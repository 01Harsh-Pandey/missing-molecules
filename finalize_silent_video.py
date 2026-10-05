"""Trim the real capture at its synchronization marker and produce a silent MP4."""
import base64, csv, hashlib, json, subprocess
from pathlib import Path
out=Path("video-output")
delivery=out/"delivery"
delivery.mkdir(exist_ok=True)
capture=json.loads((out/"capture.json").read_text())
raw=Path(capture["raw_video"])
info=json.loads(subprocess.check_output(["ffprobe","-v","error","-select_streams","v:0","-show_entries","stream=avg_frame_rate","-of","json",str(raw)]))
a,b=info["streams"][0]["avg_frame_rate"].split("/")
fps=float(a)/float(b)
pixels=subprocess.check_output(["ffmpeg","-v","error","-i",str(raw),"-vf","crop=2:2:0:0,scale=1:1:flags=neighbor,format=rgb24","-f","rawvideo","pipe:1"])
marked=[i//3 for i in range(0,len(pixels)-2,3) if pixels[i]>180 and pixels[i+1]<70 and pixels[i+2]>180]
assert marked, "Recording sync marker missing"
start=(max(marked)+1)/fps
mp4=delivery/"Missing_Molecules_Silent_Walkthrough.mp4"
subprocess.run(["ffmpeg","-y","-v","error","-ss",str(start),"-i",str(raw),"-t","245","-an","-c:v","libx264","-preset","medium","-crf","23","-pix_fmt","yuv420p","-r","30","-movflags","+faststart",str(mp4)],check=True)
meta=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_streams","-show_format","-of","json",str(mp4)]))
streams=meta["streams"]
video=next(x for x in streams if x["codec_type"]=="video")
duration=float(meta["format"]["duration"])
assert abs(duration-245)<0.2, duration
assert (video["width"],video["height"])==(1920,1080)
assert not any(x["codec_type"]=="audio" for x in streams)
segments=json.loads(Path("voiceover_segments.json").read_text())
def timestamp(seconds):
    seconds=int(seconds)
    return f"{seconds//60}:{seconds%60:02d}"
guide=["# Add your voice to the silent walkthrough","","Video: **4:05**, **1920 x 1080**, with no audio track.","","The footage shows actual native-Python notebook interactions using the published source and embedded released data. It is not a recording of molab's editor. The colored circle and chapter labels are recording annotations, added only in the browser.","","Record one voice clip per row, then place each clip at its start time in your video editor. Speak naturally and leave short pauses. Export the combined video after listening through it.","","| Start | End | Chapter | Narration |","| --- | --- | --- | --- |"]
for start_s,end_s,label,narration in segments:
    guide.append(f"| {timestamp(start_s)} | {timestamp(end_s)} | {label} | {narration} |")
guide+=["","Keep displayed units and numerical claims unchanged. The gates are illustrative; shortlist bounds are logical evidence bounds, not confidence intervals or predictions.","","Use the permanent molab link for competition submission: https://molab.marimo.io/github/01Harsh-Pandey/missing-molecules/blob/main/missing_molecules.py","","No competition entry was submitted by this recording automation."]
(delivery/"VOICEOVER_GUIDE.md").write_text("\n".join(guide)+"\n",encoding="utf-8")
with (delivery/"VOICEOVER_TIMESTAMPS.csv").open("w",newline="",encoding="utf-8") as f:
    writer=csv.writer(f);writer.writerow(["start_seconds","end_seconds","chapter","narration"]);writer.writerows(segments)
def srt(seconds):return f"{seconds//3600:02d}:{seconds//60%60:02d}:{seconds%60:02d},000"
(delivery/"CHAPTERS.srt").write_text("\n\n".join(f"{i+1}\n{srt(row[0])} --> {srt(row[1])}\n{row[2]}" for i,row in enumerate(segments))+"\n",encoding="utf-8")
evidence={
    **capture,"raw_video":raw.name,"silent_mp4":mp4.name,
    "duration_seconds":duration,"width":video["width"],"height":video["height"],"audio_tracks":0,
    "mp4_sha256":hashlib.sha256(mp4.read_bytes()).hexdigest(),
    "trimmed_start_seconds":start,"mp4_size_bytes":mp4.stat().st_size
}
(delivery/"RECORDING_REPORT.json").write_text(json.dumps(evidence,indent=2)+"\n")
for seconds in [5,62,145,187,233]:
    jpg=delivery/f"frame-{seconds:03d}.jpg"
    subprocess.run(["ffmpeg","-y","-v","error","-ss",str(seconds),"-i",str(mp4),"-frames:v","1","-vf","scale=960:540","-q:v","6",str(jpg)],check=True)
    encoded=base64.b64encode(jpg.read_bytes()).decode("ascii")
    for index in range(0,len(encoded),8192):
        print(f"VIDEO_FRAME_CHUNK {seconds} {index//8192} {encoded[index:index+8192]}",flush=True)
print("SILENT_VIDEO_VALIDATION "+json.dumps({k:evidence[k] for k in ["duration_seconds","width","height","audio_tracks","mp4_sha256","mp4_size_bytes"]}),flush=True)
