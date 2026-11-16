# Вертикальный эксплейнер из бумажной аппликации

**Когда брать.** Человек хочет короткий (20–45 с) вертикальный ролик, где всё сделано как слоистая цветная
бумага: бумажные предметы с тенями, жёсткая вырезная анимация, медленный наезд камеры, заголовок на скотче
и подписи по словам. Источник обычно ссылка (репозиторий, сайт продукта, анонс).

**Что дать.** Ссылку или готовый сценарий; главную мысль ролика; кто в продукте что делает (подтвердить с
человеком, ничего не выдумывать); ключевое слово призыва; длину (по умолчанию 22–30 с); голос.

**Команда (создать эпизод).**
```
WORK=$(python3 -c 'import sys; sys.path.insert(0,"scripts"); import cadence_paths; print(cadence_paths.work_root())')
PAPERCUT_LIB="$PWD/modules/papercraft-explainer/library" \
  bash modules/papercraft-explainer/library/new_episode.sh "$WORK/<проект>/papercut" 01-slug CompId out-name
```

**Что получится.** В `$WORK/<проект>/papercut/episodes/01-slug/` проект ролика на React с готовой библиотекой
бумажных деталей, 24 фонами, переходами и 79 звуками; дальше сценарий, раскадровка, озвучка и MP4 в `out/`.
Рендерит общий движок Cadence (HyperFrames, `engine/`): `library/papercut/hyperframes/build.mjs` собирает проект
в `out/hf`, время считается от номера кадра (`kit/frame.tsx`), без библиотек анимации.

## Оглавление

- Важно до начала
- Этапы
- Голос
- Ограничения и лицензии
- Справка

## Важно до начала

- Пакеты модуля (React, esbuild, TypeScript, puppeteer-core для звука, около 100 МБ) ставятся один раз и только
  с согласия человека: `python3 scripts/module_setup.py install papercraft-explainer`. Движок Cadence общий:
  `python3 scripts/engine_setup.py status` должен дать `ready`. Нужны Node 22+ и ffmpeg. Без установки работают
  только этапы 1–4 (текст).
- `new_episode.sh` ничего не скачивает: `node_modules` эпизода становится ссылкой на пакеты библиотеки
  (`library/papercut/hyperframes/node_modules`).
- Серию держать в `$WORK/<проект>/papercut`, а не рядом с исходниками человека. Скрипты нигде не перезаписывают
  существующие файлы эпизода.
- Звук рендерится через Chrome или Chromium (`CHROME_PATH`, если браузер не в обычном месте).
- Текстура `felt-fibre.mp4` не хранится в модуле: `python3 modules/papercraft-explainer/library/papercut/tools/textures.py felt-fibre` (нужен ffmpeg).
- Что проверить в установке и как чинить: [guides/papercut-setup.md](guides/papercut-setup.md).

## Этапы

Каждый этап читает файлы предыдущего и пишет свои, поэтому остановиться можно после любого. Таблица этапов
и режимы (весь ролик, только сценарий, раскадровка по готовому сценарию, подсказка по стилю, переделка сцены):
[guides/papercut-explainer.md](guides/papercut-explainer.md).

1. Стратегия: [guides/papercut-strategy.md](guides/papercut-strategy.md).
2. Хук: [guides/papercut-hook.md](guides/papercut-hook.md).
3. Сценарий: [guides/papercut-script.md](guides/papercut-script.md).
4. Раскадровка: [guides/papercut-storyboard.md](guides/papercut-storyboard.md).
5. Сборка, сцены, звук, рендер: [guides/papercut-build.md](guides/papercut-build.md).
6. Голос и тайминг: [guides/papercut-voice.md](guides/papercut-voice.md).
7. Проверка кадров и сдача: [guides/papercut-qa.md](guides/papercut-qa.md).

Общие справки: стиль [guides/style-guide.md](guides/style-guide.md), подсказки для других генераторов
[guides/style-prompt.md](guides/style-prompt.md), принципы движения [guides/motion-principles.md](guides/motion-principles.md),
каталоги деталей и звуков `library/papercut/CATALOG.md` и `library/audio/CATALOG.md` (читать их, а не код набора).

## Голос

Три пути: локальный синтез Qwen3-TTS (окружение 1,5 ГБ и модель 2,3 или 4,2 ГБ, только с согласия),
свои записи или другой синтез, временная заглушка (`library/tools/placeholder_vo.py`, тишина или `say` на macOS).
Подробности: [guides/papercut-voice.md](guides/papercut-voice.md). Голос клонируется только с согласия говорящего.
Ключей сервисов модуль не требует; сеть нужна только для установки пакетов и загрузки модели.

## Ограничения и лицензии

- Ролик в формате 9:16, сцены на 1080×1920.
- Примеры в `examples/` вымышлены: переносить стиль и приёмы, а не содержание, продукты и цифры.
- Фоны частично сделаны графической моделью, часть нарисована кодом (`library/papercut/backdrops-src/`);
  состав и оговорки в `THIRD_PARTY.md`.
- Голосовой конвейер самый слабо проверенный: проверен на Apple Silicon, ветки CUDA и faster-whisper на железе не запускались.

## Справка

Весь набор справок лежит в `guides/` (один уровень): `papercut-*.md` по этапам, а также `style-guide.md`,
`style-prompt.md`, `motion-principles.md`, `frame-recipes.md`, `asset-prompts.md`, `frame-breakdown.md`,
`hook-patterns.md`, `storytelling.md`, `comedy.md`, `competitor-analysis.md`. Примеры запросов: `examples/prompts.md`;
готовая серия: `examples/paper-trail/`; минимальный эпизод для проверки: `examples/hello-reel/`.
