# Монтаж говорящей головы по транскрипту (montage-toolkit)

**Когда брать:** есть запись человека, который говорит в камеру (урок, объяснялка, подкаст, реклама), и нужно
пройти путь целиком: расшифровка, срез пауз и ошибок по словам, план графики, сборка и проверка. Или нужна
только одна часть: срез ошибок по тексту, библиотека карточек, проверка плана шортса, шоурил на бит.

**Что дать:** запись, цель ролика, площадку, длительность, бренд (цвета и шрифты). Транскрипт делается
локально; чужие облачные расшифровщики в модуль не входят.

**Команда (от корня Cadence), создаёт проект из синтетического стартера в `work/<проект>/`:**
`node modules/montage-toolkit/scripts/new-video.mjs <проект>`

**Что получится:** транскрипты и список решений после срезов, проект HyperFrames с композицией,
готовый mp4 из общего движка Cadence (`npm --prefix engine run render`), отчёт проверки.

Модуль в статусе beta: тесты скриптов, пробная нарезка на синтетической записи и рендер стартового проекта
общим движком Cadence (HyperFrames 0.9.52, 16.11.2026) проходят. Карточки библиотеки по одной рендером не прогонялись.
Пути в справках модуля считаются от `modules/montage-toolkit/`.

## Оглавление

1. Подготовка
2. Порядок монтажа
3. Библиотека карточек и шаблоны
4. Справки модуля
5. Ограничения

## 1. Подготовка

1. `python3 scripts/module_setup.py status montage-toolkit`. Не готово: сказать человеку, что установка
   берёт около 5 МБ из сети (анимационная библиотека GSAP), и ставить только после согласия:
   `python3 scripts/module_setup.py install montage-toolkit`.
2. Движок рендера общий: `python3 scripts/engine_setup.py status`. Нет движка: около 300 МБ, тоже только
   с согласия.
3. Нужны `ffmpeg`, `ffprobe` и Node 22+.

## 2. Порядок монтажа

1. Проект: `node modules/montage-toolkit/scripts/new-video.mjs <проект>`. Исходную запись положить в
   `work/<проект>/assets/raw.mp4` и не менять; результат каждого этапа писать в новый файл.
2. Слова с временем: `python3 scripts/captions_whisper.py work/<проект>/assets/raw.mp4` даёт
   `work/<проект>/out/raw.words.json`, затем
   `node modules/montage-toolkit/scripts/words-to-transcript.mjs work/<проект>/out/raw.words.json work/<проект>/assets/raw.json`.
3. Паузы: `node modules/montage-toolkit/workflows/cut-silences/scripts/cut-silences.mjs raw.json --video raw.mp4 --out-dir work/<проект>/assets`
   (подробности в [guides/cut-silences.md](guides/cut-silences.md)). Для результата берутся и видео, и
   пересчитанный транскрипт.
4. Ошибки: [guides/cut-mistakes.md](guides/cut-mistakes.md). Скрипт находит кандидатов, агент смотрит
   каждый в контексте, решения записываются до применения. Умышленный повтор ошибкой не считается.
5. План и оформление: [guides/video-storytelling.md](guides/video-storytelling.md) (мир, крючок,
   открытые петли, возвраты), [guides/style-library.md](guides/style-library.md) (выбор карточек),
   [guides/hyperframes-video-beats.md](guides/hyperframes-video-beats.md) (графика с привязкой к слову).
6. Сборка композиции: правила движка в [guides/hyperframes.md](guides/hyperframes.md) и
   [guides/gsap.md](guides/gsap.md). Шрифты только локальные.
7. Проверка до рендера: `node modules/montage-toolkit/scripts/preflight.mjs work/<проект>` и, для
   композиций с привязкой к словам, `node modules/montage-toolkit/scripts/validate-beat-sync.mjs work/<проект>`.
8. Рендер: `npm --prefix engine run render -- work/<проект> --quality high --fps 30 --output work/<проект>/out/<имя>.mp4`.
9. Проверка глазами и на слух: кадры вокруг переходов, склейки звука, текст в кадре. Линт не доказывает
   качество картинки. Сдать путь к mp4 и список того, что выбрано без просьбы человека.

Для коротких вертикальных роликов читать [guides/short-form-edit.md](guides/short-form-edit.md) и
[guides/SHORT-FORM.md](guides/SHORT-FORM.md); проверки плана и футажа лежат в
`workflows/short-form-edit/scripts/`. Для шоурила под музыку — [guides/motion-showreel.md](guides/motion-showreel.md).

## 3. Библиотека карточек и шаблоны

- `style-library/registry.json`: каталог на 406 карточек двух стилей. `paper-explainer` (106) бумажный
  коллаж, резкий низкий шаттер, засечки; `aurora-glass` (300) тёмный, стеклянные карточки и мягкое свечение.
  Выбирать по стилю, уровню (`tier1` закрывает кадр, `tier2` поверх человека), назначению и числу слотов.
- У каждого стиля есть `DESIGN.md`, `tokens.css` и манифест со слотами текста. Правила карточек и
  добавление стиля — `style-library/GUIDE.md`; новый стиль: `scripts/style-library/new-style.mjs`;
  пересборка каталога: `scripts/style-library/build-registry.mjs`.
- Тексты, цифры и источники внутри карточек учебные заглушки: заменить на проверенные своими.
- `style-templates/`: две стартовые сцены (тёмный фон-сетка, стеклянная панель на кадре). Стеклянной нужна
  своя запись `assets/source.mp4` со звуком.

## 4. Справки модуля

Монтаж: [edit-video](guides/edit-video.md), [WORKFLOW](guides/WORKFLOW.md),
[EDITING-PLAYBOOK](guides/EDITING-PLAYBOOK.md), [PROMPTS](guides/PROMPTS.md),
[make-a-video](guides/make-a-video.md), [STORYTELLING-WORKBOOK](guides/STORYTELLING-WORKBOOK.md),
[motion-philosophy](guides/motion-philosophy.md), [kit-workspace](guides/kit-workspace.md),
[short-form-video](guides/short-form-video.md).
Движок (справка, общий движок Cadence): [hyperframes](guides/hyperframes.md),
[hyperframes-cli](guides/hyperframes-cli.md), [gsap](guides/gsap.md).

## 5. Ограничения

- Без облака: расшифровка, озвучка и генерация картинок и видео в модуль не входят. Нужные кадры, голос и
  музыку даёт человек.
- Команды `npx hyperframes init|add|tts|transcribe|capture|auth|cloud` в справках оставлены только как
  описание движка и не запускаются: они ходят в сеть или ставят модели.
- Шрифты из сети не грузятся: `tokens.css` без подключения Google Fonts, нужные гарнитуры подключаются
  локально (`engine/fonts` Cadence). Без этого предпросмотр карточек покажет запасной шрифт.
- Версия движка Cadence новее той, под которую писались шаблоны: первый рендер композиции проверять
  по кадрам.
- Демо-проекты и готовые ролики набора в модуль не вошли; справки иногда на них ссылаются.
- Срез пауз здесь пересекается с `scripts/silence_cut.py`: если нужны только паузы, брать его.
