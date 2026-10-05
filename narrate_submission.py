"""Build and verify an Indian-English narration on the previously reviewed footage."""
import asyncio, base64, hashlib, json, re, subprocess, wave, zipfile
from pathlib import Path
import numpy as np
import edge_tts
from faster_whisper import WhisperModel

ROOT=Path("narrated-output");ROOT.mkdir(exist_ok=True)
DELIVERY=ROOT/"delivery";DELIVERY.mkdir(exist_ok=True)
STEMS=ROOT/"stems";STEMS.mkdir(exist_ok=True)
INPUT=ROOT/"silent";INPUT.mkdir(exist_ok=True)
with zipfile.ZipFile("silent.zip") as z:
    for name in z.namelist():
        if ".." in Path(name).parts or Path(name).is_absolute():raise RuntimeError("Unsafe input archive path")
    z.extractall(INPUT)
source=next(INPUT.rglob("Missing_Molecules_Silent_Walkthrough.mp4"))
report=json.loads(next(INPUT.rglob("RECORDING_REPORT.json")).read_text())
assert hashlib.sha256(source.read_bytes()).hexdigest()=="959d9128d551885aae0f4964fdb712122e9c555e08900e3a2747335f0208710c"
assert report["notebook_sha256"]=="de5d29f56c04b0bd87238a8a9774ade19a8fcefad0ec353b531bd95543e3325b"
assert report["page_errors"]==[] and report["console_errors"]==[]
segments=json.loads(Path("narration_segments.json").read_text())
SR=48000
def run(args):return subprocess.run(args,check=True,capture_output=True)
def probe(path):return json.loads(run(["ffprobe","-v","error","-show_streams","-show_format","-of","json",str(path)]).stdout)
def decode(path):return np.frombuffer(run(["ffmpeg","-v","error","-i",str(path),"-vn","-ar",str(SR),"-ac","1","-f","f32le","pipe:1"]).stdout,dtype="<f4").copy()
def write_wav(path,samples):
    with wave.open(str(path),"wb") as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR)
        w.writeframes((np.clip(samples,-0.99,0.99)*32767).astype("<i2").tobytes())
async def synth(text,voice,path,rate):
    for attempt in range(3):
        try:
            await asyncio.wait_for(edge_tts.Communicate(text,voice,rate=rate).save(str(path)),timeout=70)
            if path.stat().st_size<1000:raise RuntimeError("Empty narration")
            return
        except Exception as e:
            print("TTS_RETRY",attempt,type(e).__name__,flush=True)
            if attempt==2:raise
            await asyncio.sleep(2)
async def build():
    voices=await asyncio.wait_for(edge_tts.list_voices(),timeout=40)
    names=[v["ShortName"] for v in voices if v.get("Locale")=="en-IN"]
    preferred=["en-IN-PrabhatNeural","en-IN-PrabhatIndicNeural","en-IN-NeerjaNeural"]
    voice=next((v for v in preferred if v in names),None)
    assert voice, "Indian English neural voice unavailable"
    print("SELECTED_INDIAN_VOICE",voice,flush=True)
    mixed=np.zeros(245*SR,dtype=np.float32)
    checks=[]
    for i,(start,end,label,text) in enumerate(segments):
        assert 0<=start<end<=245
        raw=STEMS/f"clip-{i:02d}.mp3"
        rate="-5%"
        await synth(text,voice,raw,rate)
        samples=decode(raw)
        # Keep short natural breaths, while removing service padding.
        blocks=np.array([np.sqrt(np.mean(samples[j:j+480]**2)) for j in range(0,len(samples),480)])
        active=np.where(blocks>0.002)[0]
        assert len(active)>15, "No sustained voice in clip"
        a=max(0,int(active[0]*480)-int(0.12*SR))
        b=min(len(samples),int((active[-1]+1)*480)+int(0.15*SR))
        samples=samples[a:b]
        duration=len(samples)/SR
        budget=end-start-0.85
        if duration>budget*1.15:
            rate="+10%"
            await synth(text,voice,raw,rate)
            samples=decode(raw)
            duration=len(samples)/SR
        factor=1.0
        if duration>budget:factor=duration/budget
        elif duration<budget*0.78:factor=max(0.85,duration/(budget*0.85))
        assert 0.85<=factor<=1.20, "Voice would require unnatural speed adjustment"
        stem=STEMS/f"clip-{i:02d}.wav";write_wav(stem,samples)
        if abs(factor-1)>0.005:
            adjusted=STEMS/f"fit-{i:02d}.wav"
            run(["ffmpeg","-y","-v","error","-i",str(stem),"-af",f"atempo={factor:.8f}","-ar",str(SR),str(adjusted)])
            samples=decode(adjusted)
        offset=round((start+0.4)*SR)
        assert (offset+len(samples))/SR<=end-0.30,"Narration overlaps next screen cue"
        assert np.max(np.abs(mixed[offset:offset+len(samples)]))==0,"Overlapping speech clips"
        mixed[offset:offset+len(samples)]+=samples
        check={"chapter":label,"cue_start":start,"cue_end":end,"speech_start":offset/SR,"speech_end":(offset+len(samples))/SR,"tts_rate":rate,"tempo_factor":factor,"rms":float(np.sqrt(np.mean(samples**2))),"text":text}
        checks.append(check);print("NARRATION_SEGMENT",json.dumps(check),flush=True)
    raw_wav=ROOT/"narration-raw.wav";write_wav(raw_wav,mixed)
    measured=run(["ffmpeg","-v","info","-i",str(raw_wav),"-af","loudnorm=I=-16:TP=-2:LRA=11:print_format=json","-f","null","-"]).stderr.decode()
    stats=json.loads(re.search(r"\{\s*\"input_i\".*?\}",measured,re.S).group())
    audio_wav=ROOT/"narration.wav"
    af=("loudnorm=I=-16:TP=-2:LRA=11:"
        f"measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:"
        f"measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true")
    run(["ffmpeg","-y","-v","error","-i",str(raw_wav),"-af",af,"-ar",str(SR),str(audio_wav)])
    final=DELIVERY/"Missing_Molecules_Final_Indian_English.mp4"
    run(["ffmpeg","-y","-v","error","-i",str(source),"-i",str(audio_wav),
         "-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-b:a","192k","-ar",str(SR),"-ac","2",
         "-t","245","-movflags","+faststart","-metadata","title=The Missing Molecules",
         "-metadata","comment=Reviewed native-Python footage; synthetic Indian English narration.",str(final)])
    meta=probe(final);streams=meta["streams"]
    v=next(s for s in streams if s["codec_type"]=="video")
    audio_streams=[s for s in streams if s["codec_type"]=="audio"]
    assert len(audio_streams)==1 and audio_streams[0]["codec_name"]=="aac"
    assert (v["width"],v["height"])==(1920,1080) and v["codec_name"]=="h264"
    assert abs(float(meta["format"]["duration"])-245)<0.1
    assert abs(float(audio_streams[0]["duration"])-245)<0.1
    def video_hash(p):
        return run(["ffmpeg","-v","error","-i",str(p),"-map","0:v:0","-c","copy","-f","hash","-hash","sha256","-"]).stdout.decode().strip()
    assert video_hash(source)==video_hash(final),"Narration changed the reviewed video stream"
    run(["ffmpeg","-v","error","-i",str(final),"-f","null","-"])
    final_audio=decode(final)
    peak=float(np.max(np.abs(final_audio)))
    assert peak<0.99,"Audio clipping detected"
    for c in checks:
        voice_audio=final_audio[round(c["speech_start"]*SR):round(c["speech_end"]*SR)]
        assert np.sqrt(np.mean(voice_audio**2))>0.006,"Chapter narration missing from final MP4"
    # Transcribe the encoded final audio, rather than checking only the TTS input.
    model=WhisperModel("base.en",device="cpu",compute_type="int8",cpu_threads=4,num_workers=1)
    asr,info=model.transcribe(str(final),language="en",beam_size=5,vad_filter=True,word_timestamps=True)
    transcript=[{"start":s.start,"end":s.end,"text":s.text} for s in asr]
    joined=" ".join(x["text"] for x in transcript)
    print("FINAL_AUDIO_TRANSCRIPT",joined,flush=True)
    (DELIVERY/"FINAL_AUDIO_TRANSCRIPT.json").write_text(json.dumps(transcript,indent=2))
    assert len(joined.split())>=250,"Final audio transcription is incomplete"
    expected=" ".join(row[3] for row in segments)
    # ASR renders words/numbers differently; inspect the transcript rather than claiming verbatim ASR identity.
    result={"status":"PASSED","source_video_sha256":report["mp4_sha256"],"notebook_sha256":report["notebook_sha256"],
        "voice":voice,"voice_is_synthetic":True,"duration_seconds":float(meta["format"]["duration"]),
        "video_stream_unchanged":True,"full_media_decode":"PASSED","width":1920,"height":1080,
        "audio_codec":"aac","audio_tracks":1,"audio_sample_rate":48000,"audio_peak_dbfs":20*np.log10(peak),
        "segment_overlap_check":"PASSED","audible_chapter_checks":"PASSED",
        "mp4_sha256":hashlib.sha256(final.read_bytes()).hexdigest(),"mp4_size_bytes":final.stat().st_size,
        "segments":checks,"tts_package":getattr(edge_tts,"__version__","unknown"),"transcription_model":"base.en"}
    (DELIVERY/"FINAL_VIDEO_VERIFICATION.json").write_text(json.dumps(result,indent=2))
    (DELIVERY/"NARRATION_TEXT.md").write_text("# Final synthetic narration\n\n"+"\n\n".join(f"## {a:g}–{b:g} seconds: {title}\n\n{text}" for a,b,title,text in segments))
    for sec in [5,62,85,118,148,187,205,233]:
        jpg=ROOT/f"final-frame-{sec}.jpg"
        run(["ffmpeg","-y","-v","error","-ss",str(sec),"-i",str(final),"-frames:v","1","-vf","scale=960:540","-q:v","6",str(jpg)])
        enc=base64.b64encode(jpg.read_bytes()).decode()
        for j in range(0,len(enc),8192):print(f"FINAL_FRAME_CHUNK {sec} {j//8192} {enc[j:j+8192]}",flush=True)
    for name,start,duration in [("intro",0,20),("evidence",144,19),("closing",220,25)]:
        sample=ROOT/f"audio-{name}.mp3"
        run(["ffmpeg","-y","-v","error","-ss",str(start),"-i",str(final),"-t",str(duration),"-vn","-b:a","64k",str(sample)])
        enc=base64.b64encode(sample.read_bytes()).decode()
        for j in range(0,len(enc),8192):print(f"FINAL_AUDIO_CHUNK {name} {j//8192} {enc[j:j+8192]}",flush=True)
    print("FINAL_NARRATED_VIDEO_VALIDATION",json.dumps({k:result[k] for k in ["status","voice","duration_seconds","mp4_sha256","mp4_size_bytes","audio_peak_dbfs","video_stream_unchanged"]}),flush=True)
asyncio.run(build())
