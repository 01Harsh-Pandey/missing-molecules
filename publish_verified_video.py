import hashlib,json,subprocess,sys,time,urllib.request,zipfile
from pathlib import Path
cfg=json.loads(Path("publish_video_config.json").read_text())
out=Path("publish-video");out.mkdir(exist_ok=True)
filename="Missing_Molecules_Final_Indian_English.mp4"
url="https://github.com/01Harsh-Pandey/missing-molecules/releases/download/missing-molecules-final-video-2026-10-05/"+filename
if "--verify-public" in sys.argv:
    target=out/"downloaded-public.mp4"
    for attempt in range(6):
        try:
            with urllib.request.urlopen(url,timeout=90) as response:
                assert response.status==200
                with target.open("wb") as f:
                    while block:=response.read(1024*1024):f.write(block)
            break
        except Exception:
            if attempt==5:raise
            time.sleep(3)
    actual=hashlib.sha256(target.read_bytes()).hexdigest()
    assert actual==cfg["mp4_sha256"],"Public MP4 bytes differ from reviewed MP4"
    subprocess.run(["ffmpeg","-v","error","-i",str(target),"-f","null","-"],check=True,capture_output=True)
    result={"status":"PASSED","url":url,"http_status":200,"mp4_sha256":actual,"size_bytes":target.stat().st_size,"downloaded_copy_full_decode":"PASSED"}
    (out/"PUBLIC_DOWNLOAD_VERIFICATION.json").write_text(json.dumps(result,indent=2))
    print("VERIFIED_PUBLIC_MP4 "+json.dumps(result))
else:
    with zipfile.ZipFile("final-reviewed.zip") as z:
        for name in z.namelist():
            if ".." in Path(name).parts or Path(name).is_absolute():raise RuntimeError("Unsafe artifact archive")
            if Path(name).name in [filename,"FINAL_VIDEO_VERIFICATION.json"]:
                (out/Path(name).name).write_bytes(z.read(name))
    final=out/filename
    report=json.loads((out/"FINAL_VIDEO_VERIFICATION.json").read_text())
    assert report["status"]=="PASSED"
    assert report["voice"].startswith("en-IN-") and report["voice_is_synthetic"] is True
    assert report["video_stream_unchanged"] is True and report["full_media_decode"]=="PASSED"
    assert report["mp4_sha256"]==cfg["mp4_sha256"]==hashlib.sha256(final.read_bytes()).hexdigest()
    assert cfg["chapter_frames_reviewed"] and cfg["spoken_claims_reviewed"]
    meta=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_streams","-show_format","-of","json",str(final)]))
    assert abs(float(meta["format"]["duration"])-245)<0.1
    assert len([x for x in meta["streams"] if x["codec_type"]=="audio"])==1
    subprocess.run(["ffmpeg","-v","error","-i",str(final),"-f","null","-"],check=True,capture_output=True)
    notes=("# The Missing Molecules\n\nFinal narrated walkthrough by Harsh Pandey's project: 4:05, 1920 x 1080, H.264 video and AAC audio.\n\n"
           "The narrator is a standard synthetic Indian English voice. The video does not clone or claim to reproduce Harsh's own voice. It demonstrates the reviewed notebook in native Python. The final verification report accompanies the MP4.\n\n"
           "Data credit: Expansion Therapeutics and the OpenADMET Consortium (ExpansionRx release, CC BY 4.0). ChatGPT and Codex assisted with development, testing and video production.\n\n"
           "Notebook: https://molab.marimo.io/github/01Harsh-Pandey/missing-molecules/blob/main/missing_molecules.py\n\n"
           "No competition entry has been submitted by this automation.\n")
    (out/"RELEASE_NOTES.md").write_text(notes)
    print("PUBLICATION_INPUT_VERIFIED "+cfg["mp4_sha256"])
