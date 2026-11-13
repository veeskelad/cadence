# Первая нарезка: своё видео без пауз

## Что получится

Из твоего видео с речью (говорящая голова, влог, запись экрана с голосом) получится новый MP4, в котором вырезаны паузы. По желанию — субтитры (отдельным файлом SRT или вшитые в видео) и музыка под голосом, которая сама приглушается, когда ты говоришь. Всё считается на твоём компьютере, без интернета и ключей. Исходный файл не меняется.

Проще всего попросить агента: «Порежь паузы в моём видео» — и дать путь к файлу. Ниже те же шаги вручную.

## Что нужно на машине

- `ffmpeg` и `ffprobe` — проверка: `ffmpeg -version`. Нет — macOS: `brew install ffmpeg`, Windows: `winget install Gyan.FFmpeg`, Linux: `sudo apt install ffmpeg`.
- Python 3.11 или новее — проверка: `python3 --version`.
- Для субтитров — локальный Whisper (необязательно). Проверит сам скрипт и подскажет команду.
- Для звука с рекордера и музыки — numpy и scipy (необязательно): `python3 -m pip install -r requirements.txt`.

## Подготовка

Все команды — из корня папки выпуска Cadence. Заведи проект (здесь — `my-vlog`): скрипт скопирует видео в рабочую папку и сверит копию с оригиналом по хэшу. Копия нужна, чтобы с оригиналом ничего не случилось:

```bash
python3 scripts/new_project.py my-vlog --copy ~/Movies/take1.mp4 --dry-run   # покажет, куда ляжет
python3 scripts/new_project.py my-vlog --copy ~/Movies/take1.mp4
```

Первая строка вывода — папка проекта; дальше она обозначена `WORK/my-vlog`. Есть отдельный звук с рекордера или трек для музыки — добавь их в тот же `--copy`.

Запиши отпечаток копии — в конце сверим, что файл тот же:

```bash
shasum -a 256 "WORK/my-vlog/in/take1.mp4"
```

На Windows вместо `shasum` — `certutil -hashfile WORK\my-vlog\in\take1.mp4 SHA256`.

Посмотри паспорт файла:

```bash
python3 scripts/inspect_video.py "WORK/my-vlog/in/take1.mp4"
```

## План: что будет вырезано

```bash
python3 scripts/silence_cut.py "WORK/my-vlog/in/take1.mp4" --dry-run \
  --threshold -35 --min-silence 0.45 --padding 0.12
```

Здесь показаны значения по умолчанию, их можно не писать. Ответ — примерно такой:

```
Длина: 3:12.40 → 2:31.05 (вырезано 41.4 с, 22%)
Резов: 58, кусков речи: 59; порог -35.0 dB, пауза от 0.45 с, запас 0.12 с
  вырезать 0:03.88–0:05.10 (1.22 с)
  …
Это план (--dry-run). Ничего не записано.
```

Режет посреди слов — поставь `--threshold -45`. Оставляет паузы на шумном фоне — `--threshold -30`. Слишком рублено — `--padding 0.2`.

## Выполнение

Та же команда без `--dry-run`:

```bash
python3 scripts/silence_cut.py "WORK/my-vlog/in/take1.mp4"
```

Субтитры по порезанному видео (по желанию):

```bash
python3 scripts/captions_whisper.py "WORK/my-vlog/out/take1-cut.mp4"
python3 scripts/captions_whisper.py "WORK/my-vlog/out/take1-cut.mp4" \
  --srt-in "WORK/my-vlog/out/take1-cut.srt" --burn
```

Между этими двумя командами можно открыть `take1-cut.srt` в любом текстовом редакторе и поправить слова.

Музыка под голос (по желанию):

```bash
python3 scripts/audio_sync.py "WORK/my-vlog/out/take1-cut.mp4" \
  --music "WORK/my-vlog/in/track.mp3" --duck
```

Есть отдельная запись с петлички — сведи её с видео **до** нарезки пауз:

```bash
python3 scripts/audio_sync.py "WORK/my-vlog/in/take1.mp4" --audio "WORK/my-vlog/in/mic.wav" --dry-run
```

Готовый ролик — техпроверка перед публикацией (только читает файл):

```bash
python3 scripts/check_reel.py "WORK/my-vlog/out/take1-cut-subs.mp4"
```

Что ещё посмотреть глазами — [BEFORE-POSTING.md](BEFORE-POSTING.md).

## Что появится в `WORK/my-vlog/out/`

| Файл | Что это |
|---|---|
| `take1-cut.mp4` | видео без пауз |
| `take1-cut.json` | оставленные куски и вырезанные паузы, в секундах |
| `take1-cut.edl` | монтаж для DaVinci Resolve: File → Import → Timeline |
| `take1-cut.srt` | субтитры |
| `take1-cut.words.json` | распознанные слова с временем |
| `take1-cut-subs.mp4` | видео со вшитыми субтитрами |
| `take1-cut-music.mp4`, `take1-cut-music.json` | видео с музыкой и цифры громкости |

Проверь, что исходник не изменился: `shasum -a 256 "WORK/my-vlog/in/take1.mp4"` должен напечатать ту же строку, что при подготовке.

## Если чего-то не хватает

| Сообщение | Чего не хватает | Что сделать |
|---|---|---|
| `Нет программы ffmpeg` | ffmpeg | поставить командой из раздела «Что нужно на машине» |
| `Локальный Whisper не найден` | Whisper | одна команда из сообщения: `python3 -m pip install -U faster-whisper` (нужен интернет) |
| `Модели small нет на диске` | модель Whisper | та же команда с `--allow-download` (один раз, нужен интернет) |
| `No module named 'numpy'` | numpy | `python3 -m pip install -r requirements.txt` |
| `В этой сборке ffmpeg нет фильтра subtitles` | ffmpeg с libass | поставить ffmpeg из `brew`/`winget`; SRT уже готов и без вшивания |
| `Отказ: файл … уже есть` | — | старый результат на месте; другой `--out` или `--overwrite` |
| `В проекте … уже есть in/…` | — | проект с таким именем уже заведён; возьми другое имя |
| `Уверенность низкая` | общий звук у двух записей | найди хлопок в обеих записях и задай `--offset <секунды>` |
