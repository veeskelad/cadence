# Phantom Editor: говорящая голова в вертикальный ролик

**Когда брать.** Человек принёс сырую запись, где говорит в камеру (дубли, паузы, оговорки), и хочет вертикальный ролик 1080x1920 с лучшими дублями, титрами по словам, сценами и звуками на слова и проверенным B-roll, в одном из именованных стилей. Только паузы или только склейка дублей без оформления проще делает `scripts/silence_cut.py` и `scripts/takes_cut.py`.

**Что дать.** Файл записи; сценарий, если есть; имя стиля (список с просьбами для каждого — `docs/PLAYBOOK.md`: Clean OS, Seoul list, RESULT, Whiteboard, Kinetic doc, Step Deck, Caption News и другие; плюс семь пресетов `clean`, `editorial`, `meme`, `cinematic`, `launch`, `kinetic`, `pop`).

**Команда.** Первый шаг, дальше по справке:

```bash
bash modules/phantom-editor/scripts/prep.sh <запись> <папка проекта>
```

**Что получится.** В папке проекта: `assets/talk.mp4` (1080x1920, 30 к/с, голос на -16 LUFS), затем `reel.json`, расшифровка, трек лица, предпросмотр 720x1280, после «да» человека итоговый ролик и отчёты проверок. Исходник не меняется. Папку проекта (`$P`) держать в `$WORK/<проект>/`, не внутри модуля.

Весь порядок работы, шаги-ворота, выбор дублей, стили и правила: [guides/phantom-editor.md](guides/phantom-editor.md). Там `$S` означает корень модуля `modules/phantom-editor`.

## Перед началом

1. `python3 scripts/module_setup.py status phantom-editor` из корня Cadence. Python-пакеты ставятся по `scripts/venvs/media.txt` (около 2 ГБ: нейросети для лица, whisper, opencv). Ставить только с согласия человека.
2. `bash modules/phantom-editor/scripts/doctor.sh`: чего не хватает, с командой исправления. Нужны `ffmpeg` (с libvpx и libass), `node` 18+, `whisper`; рендер идёт через HyperFrames нужной версии (`scripts/HF_VERSION`), он скачивается при первом запуске через `npx`, то есть по сети, только с согласия.
3. Звуки, музыка и эмодзи не лежат в модуле: `python3 modules/phantom-editor/scripts/library_restore.py` докачивает только лицензированные (около 60 МБ, сеть, с согласия). Файлы ложатся в `library/` модуля, в git они не попадают.
4. Необязательные наборы (каждый отдельной командой, со своим окружением): `scripts/setup_looks.sh` (плёночные лукi, около 1 ГБ), `scripts/setup_matte.sh` (вырезание человека для слов за спиной, около 2,4 ГБ), `scripts/setup_audioqa.sh` (паузы на шумной записи, около 1,9 ГБ).

## Основные шаги

| Шаг | Команда (от корня модуля) |
|---|---|
| подготовка записи | `bash scripts/prep.sh <запись> $P` |
| расшифровка всех дублей | `python3 scripts/transcribe.py $P/assets/talk.mp4 --out $P/build/words.whisper.json --lang <код>` |
| трек лица (титры не закрывают лицо) | `python3 scripts/face_track.py $P/assets/talk.mp4 --out $P/build/face.json` |
| один чистый дубль без пауз | `python3 scripts/autocut.py $P/assets/talk.mp4 --noise -30` |
| выбор дублей, план битов | `references/take-selection.md`, `references/reel-json.md` |
| сборка `index.html` и звука | `node scripts/build.mjs $P` |
| лист согласования, потом предпросмотр | `scripts/approval_sheet.py`, `scripts/finals.py preview` |
| итог и проверка | `scripts/finals.py render`, `scripts/finals.py qa` |

Человек подтверждает лист согласования и предпросмотр до итогового рендера.

## Ограничения

- Сеть выключена, пока человек не согласился. Это: загрузка HyperFrames, `library_restore.py`, `broll_fetch.py` (бесплатный сток), `wikimedia_fetch.py` (архивные картинки), `emoji_fetch.py`, `trends.py`.
- Ключ Gemini (`GEMINI_API_KEY` в окружении или в `.env` модуля) не обязателен. С ним работают проверка B-roll по людям и по смыслу строки, поиск по своим клипам, разбор референса; кадры уходят в Google, поэтому спросить человека до первого вызова. Без ключа эти проверки пропускаются, пресеты работают.
- Облачного голоса, платных сервисов картинок и запись в соцсети в модуле нет. Рассказчика берут из записи человека. Картинки и видео по описанию заказывать навыком `cadence-generate`.
- Мемы-клипы с видеосайтов не качаются: `library_restore.py` всегда берёт только лицензированные звуки и музыку.
- Только macOS (проверка титров идёт через системное распознавание текста, быстрая расшифровка на Apple silicon).
- Файл `people-rules.json` пуст: правила «кто и что может попасть в B-roll» человек задаёт сам (образец — `people-rules.example.json`), не добавлять от себя.
- В `guides/phantom-editor.md` остались шаги для субагентов Claude Code и отсылки к папкам автора вида `~/reels/…`: считать их примерами, свои пути брать из `$WORK`.
