#!/usr/bin/env python3
"""Расшифровка клипа локальным Whisper (faster-whisper) со словами и временем.

    python kit/transcribe.py <video> [--out file.json] [--language ru] [--model small] [--allow-download]

Пишет `<out>` (по умолчанию work/<проект>/out/<имя>.transcript.json): {text, segments[{start,end,text}],
words[{word,start,end}], duration, model}, времена в секундах от начала видео. Всё считается на этой машине,
ключей и сети нет. Модель берётся только с диска; скачать её можно с флагом --allow-download
(или ALLOW_MODEL_DOWNLOAD=1), и только после согласия человека. Зависимости: python3 scripts/module_setup.py install video-editing-skills
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cadence_env  # noqa: E402

MODEL = 'small'


def duration(video):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                          '-of', 'default=nw=1:nk=1', str(video)]))


def transcribe(video, out=None, language=None, model=MODEL, allow_download=False):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit('нет faster-whisper: python3 scripts/module_setup.py install video-editing-skills (сеть, только с согласия человека), '
                 'затем запускать python из python3 scripts/module_setup.py python video-editing-skills')
    video = Path(video).resolve()
    out = Path(out) if out else cadence_env.out_dir_for(video) / (video.stem + '.transcript.json')
    allow = allow_download or cadence_env.allow_download()
    try:
        wm = WhisperModel(model, device='cpu', compute_type='int8', local_files_only=not allow)
    except Exception as exc:
        if allow:
            raise
        sys.exit(f'модели Whisper «{model}» нет на диске ({type(exc).__name__}). Спросить человека: скачивание идёт из сети '
                 '(small около 0,5 ГБ). После согласия повторить с --allow-download.')
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / 'a.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(video), '-vn', '-ac', '1', '-ar', '16000', str(wav)], check=True)
        segs, info = wm.transcribe(str(wav), language=language, word_timestamps=True, vad_filter=False,
                                   condition_on_previous_text=False, temperature=0.0)
        words, segments, text = [], [], []
        for s in segs:
            segments.append(dict(start=round(s.start, 3), end=round(s.end, 3), text=s.text))
            text.append(s.text.strip())
            for w in s.words or []:
                words.append(dict(word=w.word, start=round(w.start, 3), end=round(w.end, 3)))
    data = dict(text=' '.join(text), segments=segments, words=words, duration=duration(video), model=model)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=1, ensure_ascii=False))
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('--out')
    ap.add_argument('--language')
    ap.add_argument('--model', default=MODEL)
    ap.add_argument('--allow-download', action='store_true')
    a = ap.parse_args()
    p = transcribe(a.video, a.out, a.language, a.model, a.allow_download)
    d = json.loads(p.read_text())
    print(f'wrote {p}  ({len(d["words"])} words)')
    for s in d['segments']:
        print(f'{s["start"]:7.2f}-{s["end"]:7.2f}  {s["text"].strip()}')
