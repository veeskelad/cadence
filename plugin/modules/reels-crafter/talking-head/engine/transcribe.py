import sys, json, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "prep"))
from whisper_local import load as load_whisper
src, out, size = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else "small")
m = load_whisper(size)
segs, info = m.transcribe(src, language=os.environ.get("REEL_LANG") or None, word_timestamps=True, vad_filter=True)
words = []
for s in segs:
    for w in s.words:
        words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)})
json.dump({"lang": info.language, "words": words}, open(out, "w"), ensure_ascii=False, indent=0)
print(" ".join(f"{w['w']}[{w['s']}]" for w in words))
