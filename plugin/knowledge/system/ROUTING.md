# Маршрутизация визуальной системы Cadence

Основной маршрут результата остаётся в skills/cadence и профильном навыке монтажа/рендера. Эта таблица выбирает дополнительные знания; не загружать все 14 навыков для каждого ролика. Пути skills/ и design/ в рабочих документах — от корня Cadence, Markdown ссылки — относительно файла.

Перед работой по визуальной системе прочитать [совместимость](compatibility.md). При default Ember — [профиль](ember-direction.md).

| Задача | Навык | Результат |
|---|---|---|
| Визуальная идея и композиция | [cadence-visual-direction](../../skills/cadence-visual-direction/SKILL.md) | главный объект, порядок чтения, семейство вида, рецепт композиции |
| Знак и применения своего бренда | [cadence-identity-system](../../skills/cadence-identity-system/SKILL.md) | смысл, знак, носители, проверка малого размера и единства |
| Передача визуальной системы другому агенту | [cadence-design-contract](../../skills/cadence-design-contract/SKILL.md) | самостоятельные роли, геометрия, состояния, constraints и acceptance |
| Изображения веб-разделов | [cadence-web-comps](../../skills/cadence-web-comps/SKILL.md) | реестр разделов и связные отдельные композиции/briefs |
| Мобильные экраны и поток | [cadence-mobile-comps](../../skills/cadence-mobile-comps/SKILL.md) | экранные состояния, навигация и системные зоны |
| Изображение/контракт → реализация | [cadence-reference-build](../../skills/cadence-reference-build/SKILL.md) | измерение отношений, реальные files, точность и проверка поведения |
| Доводка уже готового вида | [cadence-design-revision](../../skills/cadence-design-revision/SKILL.md) | наблюдаемый дефект, минимальная правка, сравнение |
| Смысл и исполнение анимации | [cadence-motion-behavior](../../skills/cadence-motion-behavior/SKILL.md) | состояния, curve/clock, словарь, recipes и аудит |
| Жесты и физическое управление | [cadence-physical-interaction](../../skills/cadence-physical-interaction/SKILL.md) | grab/drag/release, velocity, прерывание и feedback |
| mobile web, Expo/Native, Swift, компоненты | [cadence-platform-engineering](../../skills/cadence-platform-engineering/SKILL.md) | реальный SDK/compiler и platform contract; для MP4 только изображение поведения |
| Готовые анимированные компоненты для сайта и презентации | [cadence-platform-engineering](../../skills/cadence-platform-engineering/SKILL.md) → [каталоги](../../skills/cadence-platform-engineering/references/component-sources.md) | компонент с адресом, лицензией и планом вставки; для MP4 — образец поведения |
| Вид словами («в стиле Apple», «градиенты», «блюр», «ascii», «как в терминале») | [cadence-visual-direction](../../skills/cadence-visual-direction/SKILL.md) → [словарь вида](../../skills/cadence-visual-direction/references/style-words.md) | приём из `engine/lib/looks.js` и рецепт `knowledge/effects-bank/look-*.md` |
| Loading/result и сообщения | [cadence-notification-state](../../skills/cadence-notification-state/SKILL.md) | операция, id, lifecycle, stack и сценарные события |
| Сравнение разных решений | [cadence-design-variants](../../skills/cadence-design-variants/SKILL.md) | различимые варианты на общих входах и выбор |
| Крайний контент и состояния | [cadence-layout-resilience](../../skills/cadence-layout-resilience/SKILL.md) | реальные fixtures, bounds, длинные строки, пустота, данные/медиа |
| Большая задача и отсутствие пропусков | [cadence-delivery-completeness](../../skills/cadence-delivery-completeness/SKILL.md) | обязательства, готовые файлы, интеграция и проверяемое завершение |

## Последовательности применения

Идея ролика: основной маршрут → visual-direction → действующий пак/contract при необходимости → motion-behavior → [нужный элемент](../../skills/cadence-motion-lab/references/mechanics.md) → существующая сборка/MP4 → проверки результата. Семантическая структура ролика определяется задачей, а не обязательной маркетинговой формулой.

Свой образец в код: reference-build → неизменные факты/материал и текущая система → нужные свойства сцены → проверка точности. Новая генерация изображения и смена стека не обязательны.

Настоящий интерфейс: контракт задачи → platform-engineering → physical-interaction/notification-state по действию → layout-resilience. Для показа этого интерфейса в MP4 заменить живые события журналом сценария и чистой state(t); код приложения не является скрытой зависимостью видео.

Исправление: назвать дефект → design-revision либо motion audit → затронутая область → результат и фактическая проверка. variants подключать, когда сравнение действительно заказано или нужно выбору, а не как круг согласования каждой сцены.


Подбор любого пака по концепции, референсу или актуальным примерам: [палитры](../../skills/cadence-visual-direction/references/palette-selection.md) → cadence-style → проверка сцены. Ember — доступный default, а не ограничение выбора.

## Как найти нужное, если в навыке ответа нет

1. Таблица «Просьба → навык → модуль» ниже или `grep -i "<слово просьбы>" modules/REGISTRY.json` — найти модуль и его семейство.
2. Открыть один `modules/<id>/MODULE.md` и делать по нему; соседние модули не загружать.
3. Приём или эффект без модуля — `knowledge/README.md` (банк эффектов, словарь приёмов): поиск grep по слову, чтение одного файла.
4. Не нашлось — сказать человеку прямо, что в наборе этого нет, и предложить ближайшее, что есть; поиск в сети — только с его согласия.

<!-- modules:start -->
## Просьба → навык → модуль

Собирается из `modules/*/module.json` и `modules/CAPABILITIES.json` (`scripts/build_registry.py`). Одна функция — один основной исполнитель; запасной — только если основной недоступен.

| Функция | Навык | Основной | Запасной |
|---|---|---|---|
| убрать паузы и тишину | `cadence-cut` | `script:scripts/silence_cut.py` | — |
| собрать ролик из дублей | `cadence-cut` | `script:scripts/takes_cut.py` | — |
| хайлайт длинного видео без речи | `cadence-cut` | `script:scripts/highlight_cut.py` | — |
| субтитры по речи | `cadence-cut` | `script:scripts/captions_whisper.py` | `module:speech-transcriber` |
| сцены и графика по словам | `cadence-motion` | `script:scripts/word_anchors.py` | — |
| кино-эффекты на живом видео | `cadence-cut` | `script:scripts/video_fx.py` | — |
| голос и музыка вместе | `cadence-sound` | `script:scripts/voice_music_mix.py` | — |
| проверка ролика перед публикацией | `cadence-cut` | `script:scripts/check_reel.py` | — |
| передать монтаж в DaVinci Resolve (ручная передача — бесплатно; работа агента в проекте — Cadence Pro) | `cadence-resolve` | `skill:cadence-resolve` | — |
| нарезка таймлайном для Resolve, Premiere, Final Cut, Kdenlive | `cadence-cut` | `module:smart-cutter` | — |
| оформленный ролик из разговорной записи в выбранном стиле | `cadence-cut` | `module:phantom-editor` | `module:effortless-cuts`, `module:video-copilot-skills` |
| пакет к публикации: мастер, обложка, варианты заголовка | `cadence-cut` | `module:effortless-cuts` | — |
| любая операция ffmpeg: кроп, вертикаль, громкость, склейка, конверт | `cadence-cut` | `module:ffmpeg-toolkit` | — |
| вертикальный кадр и сборка таймлайна в Resolve по анализу кадров (Cadence Pro) | `cadence-resolve` | `skill:cadence-resolve` | — |
| разбор своих исходников для Resolve: что в клипах, лучшие моменты, поиск (Cadence Pro) | `cadence-resolve` | `skill:cadence-resolve` | — |
| расшифровка речи с таймингами слов | `cadence-cut` | `module:speech-transcriber` | `script:scripts/captions_whisper.py` |
| закадровый голос из текста локальной моделью | `cadence-sound` | `module:mlx-audio-engine` | `module:voice-synthesis-toolkit`, `module:neural-tts-engine` |
| озвучка голосом по образцу записи (с согласия владельца голоса) | `cadence-sound` | `module:expressive-voice-synth` | `module:mlx-audio-engine` |
| эксплейнер с озвучкой по сценарию | `cadence-structures` | `module:explainer-engine` | `module:motion-graphics-pipeline` |
| фильм-рассказ под готовый голос, нарисованный кодом | `cadence-motion` | `module:cinematic-motion-skill` | `module:motion-graphics-pipeline` |
| готовый блок, переход или компонент из библиотеки | `cadence-motion` | `module:declarative-video-frames` | — |
| художественные приёмы: рукописный текст, живая картина, 3D-субтитры | `cadence-motion` | `module:declarative-frames-community-skills` | — |
| серия кадров из таблицы в шаблоне редактора | `cadence-motion` | `module:data-motion-graphics` | — |
| объяснялка палочными человечками | `cadence-structures` | `module:stick-figure-animator` | — |
| эксплейнер из бумажной аппликации | `cadence-structures` | `module:papercraft-explainer` | — |
| рисованная история из текста или страниц | `cadence-structures` | `module:story-to-sketch-animation` | — |
| анимация в стиле художников и эпох | `cadence-motion` | `module:calligraphy-art-motion` | — |
| дудл: картинка рисуется на глазах | `cadence-motion` | `module:doodle-animator` | — |
| рисованный герой: позы и эмоции | `cadence-motion` | `module:doodle-animator` | — |
| 10 секунд моушна в готовом визуальном стиле | `cadence-motion` | `module:motion-graphics-presets` | `module:code-to-film-engine` |
| мини-фильм кодом в стиле-образце (чертёж, доска, микроскоп…) | `cadence-motion` | `module:code-to-film-engine` | — |
| промо-ролик продукта из настоящих экранов и текст поста | `cadence-structures` | `module:promo-showcase` | — |
| скриншоты и превью-видео приложения для магазинов | `cadence-structures` | `module:promo-motion-kit` | — |
| запись экрана приложения на симуляторе | `cadence-structures` | `module:visual-fx-renderer` | — |
| логотип: варианты SVG, PNG, иконки, проверка 16 px | `cadence-identity-system` | `module:logo-craft-skill` | — |
| план битов и графика поверх говорящего видео | `cadence-visual-direction` | `module:video-director-skills` | — |
| графика поверх говорящего и на весь кадр по смыслу речи | `cadence-cut` | `module:b-roll-toolkit` | `module:video-director-skills` |
| рилс из папки своих клипов и голоса: сценарий, монтаж, обложка, подпись | `cadence-cut` | `module:reels-crafter` | — |
| нарезка вертикальных шортсов с субтитрами из длинной записи с речью | `cadence-cut` | `module:shorts-studio` | `script:scripts/highlight_cut.py` |
| раскладки говорящего: экран пополам, графика за человеком, тир-лист | `cadence-cut` | `module:video-editing-skills` | — |
| монтаж говорящей головы по транскрипту: паузы, оговорки, графика, проверка до рендера | `cadence-cut` | `module:montage-toolkit` | `script:scripts/silence_cut.py` |

| Просьба человека | Навык | Модуль |
|---|---|---|
| «добавь перебивки к видео, где я говорю в камеру» | `cadence-cut` | [`b-roll-toolkit`](../../modules/b-roll-toolkit/MODULE.md) |
| «оживи ролик с говорящей головой графикой и цифрами» | `cadence-cut` | [`b-roll-toolkit`](../../modules/b-roll-toolkit/MODULE.md) |
| «сделай b-roll под мою речь» | `cadence-cut` | [`b-roll-toolkit`](../../modules/b-roll-toolkit/MODULE.md) |
| «нужен слой графики с прозрачностью, чтобы положить на дорожку в монтажке» | `cadence-cut` | [`b-roll-toolkit`](../../modules/b-roll-toolkit/MODULE.md) |
| «сделай анимацию в стиле Ван Гога или Моне» | `cadence-motion` | [`calligraphy-art-motion`](../../modules/calligraphy-art-motion/MODULE.md) |
| «нужна история искусства за минуту: эпохи сменяются в одной комнате» | `cadence-motion` | [`calligraphy-art-motion`](../../modules/calligraphy-art-motion/MODULE.md) |
| «нарисуй кодом объясняющий фрагмент: белая доска, формулы, график» | `cadence-motion` | [`calligraphy-art-motion`](../../modules/calligraphy-art-motion/MODULE.md) |
| «динамическая типографика под мою фразу» | `cadence-motion` | [`calligraphy-art-motion`](../../modules/calligraphy-art-motion/MODULE.md) |
| «воспроизведи эту анимацию кодом по моему видео-образцу» | `cadence-motion` | [`calligraphy-art-motion`](../../modules/calligraphy-art-motion/MODULE.md) |
| «сделай фильм про наш продукт под мою озвучку, всё нарисовано кодом» | `cadence-motion` | [`cinematic-motion-skill`](../../modules/cinematic-motion-skill/MODULE.md) |
| «нужен ролик в стиле шоурила моушн-дизайнера со сценарием и раундами проверки» | `cadence-motion` | [`cinematic-motion-skill`](../../modules/cinematic-motion-skill/MODULE.md) |
| «собери объяснялку по цифрам и схемам с красивой анимацией под голос» | `cadence-motion` | [`cinematic-motion-skill`](../../modules/cinematic-motion-skill/MODULE.md) |
| «сделай вертикальную и горизонтальную версию фильма с субтитрами и музыкой» | `cadence-motion` | [`cinematic-motion-skill`](../../modules/cinematic-motion-skill/MODULE.md) |
| «сделай мне мини-фильм в стиле чертежа или школьной доски» | `cadence-motion` | [`code-to-film-engine`](../../modules/code-to-film-engine/MODULE.md) |
| «нужно объяснение моей идеи анимацией, нарисованной кодом, в стиле гравюры» | `cadence-motion` | [`code-to-film-engine`](../../modules/code-to-film-engine/MODULE.md) |
| «покажи, какие бывают визуальные стили для такого видео, и сделай одно» | `cadence-motion` | [`code-to-film-engine`](../../modules/code-to-film-engine/MODULE.md) |
| «собери кинематографичный ролик на несколько минут с голосом и музыкой кодом» | `cadence-motion` | [`code-to-film-engine`](../../modules/code-to-film-engine/MODULE.md) |
| «проверь, что текст в моём ролике успевают прочитать» | `cadence-motion` | [`code-to-film-engine`](../../modules/code-to-film-engine/MODULE.md) |
| «собери серию плашек с именами из таблицы» | `cadence-motion` | [`data-motion-graphics`](../../modules/data-motion-graphics/MODULE.md) |
| «подставь данные из CSV в шаблон титра» | `cadence-motion` | [`data-motion-graphics`](../../modules/data-motion-graphics/MODULE.md) |
| «нужно двадцать одинаковых кадров, отличающихся только текстом и цветом» | `cadence-motion` | [`data-motion-graphics`](../../modules/data-motion-graphics/MODULE.md) |
| «сделай, чтобы текст писался от руки, как карандашом» | `cadence-motion` | [`declarative-frames-community-skills`](../../modules/declarative-frames-community-skills/MODULE.md) |
| «перерисуй фото или клип как живую картину мазками» | `cadence-motion` | [`declarative-frames-community-skills`](../../modules/declarative-frames-community-skills/MODULE.md) |
| «хочу субтитры в 3D вокруг говорящего, чтобы слова прятались за ним» | `cadence-motion` | [`declarative-frames-community-skills`](../../modules/declarative-frames-community-skills/MODULE.md) |
| «сделай рисованный фильм о том, как мы работаем с агентом» | `cadence-motion` | [`declarative-frames-community-skills`](../../modules/declarative-frames-community-skills/MODULE.md) |
| «собери объяснялку-коллаж на минуту про то, что все видят каждый день» | `cadence-motion` | [`declarative-frames-community-skills`](../../modules/declarative-frames-community-skills/MODULE.md) |
| «сделай видео трека, где код горит под ноты» | `cadence-motion` | [`declarative-frames-community-skills`](../../modules/declarative-frames-community-skills/MODULE.md) |
| «нужен готовый переход, титр, плашка или шейдерный фон, не собирай с нуля» | `cadence-motion` | [`declarative-video-frames`](../../modules/declarative-video-frames/MODULE.md) |
| «найди в библиотеке блок для заголовка из стеклянных осколков» | `cadence-motion` | [`declarative-video-frames`](../../modules/declarative-video-frames/MODULE.md) |
| «как правильно сделать бесшовный переход между сценами» | `cadence-motion` | [`declarative-video-frames`](../../modules/declarative-video-frames/MODULE.md) |
| «что можно взять для карусели, чата, уведомлений или графика» | `cadence-motion` | [`declarative-video-frames`](../../modules/declarative-video-frames/MODULE.md) |
| «перенеси мой ролик с другого видеокода на движок Cadence» | `cadence-motion` | [`declarative-video-frames`](../../modules/declarative-video-frames/MODULE.md) |
| «нарисуй мне дудл-анимацию про эту идею» | `cadence-motion` | [`doodle-animator`](../../modules/doodle-animator/MODULE.md) |
| «сделай картинку, которая рисуется на глазах, как таймлапс» | `cadence-motion` | [`doodle-animator`](../../modules/doodle-animator/MODULE.md) |
| «нужен короткий фильм в стиле гравюры, акварели или бумажной аппликации» | `cadence-motion` | [`doodle-animator`](../../modules/doodle-animator/MODULE.md) |
| «анимированный логотип или зацикленный стикер» | `cadence-motion` | [`doodle-animator`](../../modules/doodle-animator/MODULE.md) |
| «объясни тему рисованной инфографикой» | `cadence-motion` | [`doodle-animator`](../../modules/doodle-animator/MODULE.md) |
| «научи рисовать вот это пошагово» | `cadence-motion` | [`doodle-animator`](../../modules/doodle-animator/MODULE.md) |
| «нарисуй мультик про моего героя, чтобы он радовался и удивлялся» | `cadence-motion` | [`doodle-animator`](../../modules/doodle-animator/MODULE.md) |
| «короткая анимация с талисманом без текста в кадре» | `cadence-motion` | [`doodle-animator`](../../modules/doodle-animator/MODULE.md) |
| «собери из моих дублей готовый ролик целиком» | `cadence-cut` | [`effortless-cuts`](../../modules/effortless-cuts/MODULE.md) |
| «смонтируй говорящую голову с титрами, звуком и обложкой» | `cadence-cut` | [`effortless-cuts`](../../modules/effortless-cuts/MODULE.md) |
| «сделай вертикальную и квадратную версию из одного монтажа» | `cadence-cut` | [`effortless-cuts`](../../modules/effortless-cuts/MODULE.md) |
| «хочу пакет для публикации: мастер, обложка, варианты заголовка» | `cadence-cut` | [`effortless-cuts`](../../modules/effortless-cuts/MODULE.md) |
| «режь как профессиональный монтажёр, без вопросов про шрифты и переходы» | `cadence-cut` | [`effortless-cuts`](../../modules/effortless-cuts/MODULE.md) |
| «сделай объяснялку с озвучкой про то, как это работает» | `cadence-structures` | [`explainer-engine`](../../modules/explainer-engine/MODULE.md) |
| «нужен обучающий ролик: диктор, схемы и подсветка по словам» | `cadence-structures` | [`explainer-engine`](../../modules/explainer-engine/MODULE.md) |
| «собери демо моего продукта: запись экрана сайта и голос за кадром» | `cadence-structures` | [`explainer-engine`](../../modules/explainer-engine/MODULE.md) |
| «хочу короткое вертикальное видео с диктором и субтитрами» | `cadence-structures` | [`explainer-engine`](../../modules/explainer-engine/MODULE.md) |
| «смонтируй мою запись по словам: убери слова и паузы» | `cadence-structures` | [`explainer-engine`](../../modules/explainer-engine/MODULE.md) |
| «прочитай этот текст моим голосом на другом языке» | `cadence-sound` | [`expressive-voice-synth`](../../modules/expressive-voice-synth/MODULE.md) |
| «озвучь голосом из моего образца записи» | `cadence-sound` | [`expressive-voice-synth`](../../modules/expressive-voice-synth/MODULE.md) |
| «сделай озвучку в нужной манере: быстро, медленно, с улыбкой» | `cadence-sound` | [`expressive-voice-synth`](../../modules/expressive-voice-synth/MODULE.md) |
| «обрежь видео с 1:20 до 2:05» | `cadence-cut` | [`ffmpeg-toolkit`](../../modules/ffmpeg-toolkit/MODULE.md) |
| «сделай вертикальную версию 9:16 с размытыми полями» | `cadence-cut` | [`ffmpeg-toolkit`](../../modules/ffmpeg-toolkit/MODULE.md) |
| «склей эти клипы с кроссфейдом» | `cadence-cut` | [`ffmpeg-toolkit`](../../modules/ffmpeg-toolkit/MODULE.md) |
| «iPhone-видео в HDR выглядит блёклым, исправь» | `cadence-cut` | [`ffmpeg-toolkit`](../../modules/ffmpeg-toolkit/MODULE.md) |
| «положи логотип в угол и вшей готовый SRT» | `cadence-cut` | [`ffmpeg-toolkit`](../../modules/ffmpeg-toolkit/MODULE.md) |
| «приведи громкость к -14 LUFS» | `cadence-cut` | [`ffmpeg-toolkit`](../../modules/ffmpeg-toolkit/MODULE.md) |
| «нарисуй логотип для моего проекта» | `cadence-identity-system` | [`logo-craft-skill`](../../modules/logo-craft-skill/MODULE.md) |
| «сделай знак и монограмму, чтобы читались на 16 пикселей» | `cadence-identity-system` | [`logo-craft-skill`](../../modules/logo-craft-skill/MODULE.md) |
| «проверь мой логотип и скажи, что в нём не так» | `cadence-identity-system` | [`logo-craft-skill`](../../modules/logo-craft-skill/MODULE.md) |
| «сделай из моего знака чёрную, белую версии и фавикон» | `cadence-identity-system` | [`logo-craft-skill`](../../modules/logo-craft-skill/MODULE.md) |
| «подготовь презентацию логотипа с макетами» | `cadence-identity-system` | [`logo-craft-skill`](../../modules/logo-craft-skill/MODULE.md) |
| «озвучь текст на моём Маке, без видеокарты» | `cadence-sound` | [`mlx-audio-engine`](../../modules/mlx-audio-engine/MODULE.md) |
| «сделай закадровый голос для ролика без микрофона» | `cadence-sound` | [`mlx-audio-engine`](../../modules/mlx-audio-engine/MODULE.md) |
| «расшифруй запись в субтитры на Маке быстро» | `cadence-sound` | [`mlx-audio-engine`](../../modules/mlx-audio-engine/MODULE.md) |
| «смонтируй мою запись: убери паузы и оговорки и добавь графику» | `cadence-cut` | [`montage-toolkit`](../../modules/montage-toolkit/MODULE.md) |
| «убери из видео неудачные дубли и заикания по тексту» | `cadence-cut` | [`montage-toolkit`](../../modules/montage-toolkit/MODULE.md) |
| «подбери оформление для объяснялки и поставь карточки по ходу речи» | `cadence-cut` | [`montage-toolkit`](../../modules/montage-toolkit/MODULE.md) |
| «проверь план шортса и футаж до рендера» | `cadence-cut` | [`montage-toolkit`](../../modules/montage-toolkit/MODULE.md) |
| «вот озвучка, сделай под неё анимационный ролик без съёмки» | `cadence-motion` | [`motion-graphics-pipeline`](../../modules/motion-graphics-pipeline/MODULE.md) |
| «собери ролик с новостями или разбором кейса под мой голос» | `cadence-motion` | [`motion-graphics-pipeline`](../../modules/motion-graphics-pipeline/MODULE.md) |
| «нужен обучающий ролик: окна, курсор, шаги, подсветка» | `cadence-motion` | [`motion-graphics-pipeline`](../../modules/motion-graphics-pipeline/MODULE.md) |
| «сделай вертикальную версию с заголовком сверху и обложками» | `cadence-motion` | [`motion-graphics-pipeline`](../../modules/motion-graphics-pipeline/MODULE.md) |
| «сделай десять секунд анимации в стиле плоской векторной графики» | `cadence-motion` | [`motion-graphics-presets`](../../modules/motion-graphics-presets/MODULE.md) |
| «хочу ролик как неоновый синтвейв восьмидесятых» | `cadence-motion` | [`motion-graphics-presets`](../../modules/motion-graphics-presets/MODULE.md) |
| «покажи варианты стилей мотиона и сделай один из них про мой продукт» | `cadence-motion` | [`motion-graphics-presets`](../../modules/motion-graphics-presets/MODULE.md) |
| «нужна заставка в стиле пиксельной игры или бумажного коллажа» | `cadence-motion` | [`motion-graphics-presets`](../../modules/motion-graphics-presets/MODULE.md) |
| «сделай интерфейс как в кино про хакеров с наведением на цель» | `cadence-motion` | [`motion-graphics-presets`](../../modules/motion-graphics-presets/MODULE.md) |
| «озвучь текст голосом, который я опишу словами» | `cadence-sound` | [`neural-tts-engine`](../../modules/neural-tts-engine/MODULE.md) |
| «сделай голос низким и спокойным, как у диктора документалки» | `cadence-sound` | [`neural-tts-engine`](../../modules/neural-tts-engine/MODULE.md) |
| «озвучь с эмоцией: радостно, строго, шёпотом» | `cadence-sound` | [`neural-tts-engine`](../../modules/neural-tts-engine/MODULE.md) |
| «прочитай текст голосом выбранного диктора» | `cadence-sound` | [`neural-tts-engine`](../../modules/neural-tts-engine/MODULE.md) |
| «сделай ролик в стиле бумажной аппликации» | `cadence-structures` | [`papercraft-explainer`](../../modules/papercraft-explainer/MODULE.md) |
| «объясни эту тему вырезанной из бумаги анимацией» | `cadence-structures` | [`papercraft-explainer`](../../modules/papercraft-explainer/MODULE.md) |
| «нужен вертикальный эксплейнер из бумаги по ссылке на продукт» | `cadence-structures` | [`papercraft-explainer`](../../modules/papercraft-explainer/MODULE.md) |
| «перестрой одну сцену бумажного ролика» | `cadence-structures` | [`papercraft-explainer`](../../modules/papercraft-explainer/MODULE.md) |
| «выбери лучшие дубли и собери из записи ролик с оформлением» | `cadence-cut` | [`phantom-editor`](../../modules/phantom-editor/MODULE.md) |
| «сделай рилс из моей записи в стиле доски или кинетического документального» | `cadence-cut` | [`phantom-editor`](../../modules/phantom-editor/MODULE.md) |
| «убери паузы, подбери дубли и добавь титры, сцены и звуки на слова» | `cadence-cut` | [`phantom-editor`](../../modules/phantom-editor/MODULE.md) |
| «перемонтируй так же, как в том ролике, который я показал» | `cadence-cut` | [`phantom-editor`](../../modules/phantom-editor/MODULE.md) |
| «добавь в разговорный ролик мемы, эффекты и B-roll на нужных словах» | `cadence-cut` | [`phantom-editor`](../../modules/phantom-editor/MODULE.md) |
| «сделай скриншоты моего приложения для App Store» | `cadence-structures` | [`promo-motion-kit`](../../modules/promo-motion-kit/MODULE.md) |
| «нужно видео-превью приложения для магазина» | `cadence-structures` | [`promo-motion-kit`](../../modules/promo-motion-kit/MODULE.md) |
| «обнови подписи и фон на скриншотах магазина, поменяй рамку телефона» | `cadence-structures` | [`promo-motion-kit`](../../modules/promo-motion-kit/MODULE.md) |
| «собери витрину приложения: пять экранов и ролик показа» | `cadence-structures` | [`promo-motion-kit`](../../modules/promo-motion-kit/MODULE.md) |
| «сделай промо-ролик моего сайта или приложения» | `cadence-structures` | [`promo-showcase`](../../modules/promo-showcase/MODULE.md) |
| «хочу короткий ролик-анонс о том, что я сделал, чтобы выложить в соцсети» | `cadence-structures` | [`promo-showcase`](../../modules/promo-showcase/MODULE.md) |
| «собери ролик из настоящего интерфейса моего продукта и напиши подпись к посту» | `cadence-structures` | [`promo-showcase`](../../modules/promo-showcase/MODULE.md) |
| «нужен запуск-ролик на 20 секунд под музыку для моего проекта» | `cadence-structures` | [`promo-showcase`](../../modules/promo-showcase/MODULE.md) |
| «собери рилс из моих кадров в этой папке» | `cadence-cut` | [`reels-crafter`](../../modules/reels-crafter/MODULE.md) |
| «напиши сценарий рилса и смонтируй под него видео» | `cadence-cut` | [`reels-crafter`](../../modules/reels-crafter/MODULE.md) |
| «сделай обложку и подпись к рилсу» | `cadence-cut` | [`reels-crafter`](../../modules/reels-crafter/MODULE.md) |
| «смонтируй мне говорящую голову: субтитры на каждое слово, смена раскладок» | `cadence-cut` | [`reels-crafter`](../../modules/reels-crafter/MODULE.md) |
| «посмотри мой рилс как режиссёр и критик и скажи, что поправить» | `cadence-cut` | [`reels-crafter`](../../modules/reels-crafter/MODULE.md) |
| «нарежь из этого длинного видео шортсы» | `cadence-cut` | [`shorts-studio`](../../modules/shorts-studio/MODULE.md) |
| «вытащи из подкаста самые сильные куски в вертикальные клипы» | `cadence-cut` | [`shorts-studio`](../../modules/shorts-studio/MODULE.md) |
| «сделай из часовой записи несколько рилсов с субтитрами» | `cadence-cut` | [`shorts-studio`](../../modules/shorts-studio/MODULE.md) |
| «найди моменты, которые зайдут как шортс, и отрендери их» | `cadence-cut` | [`shorts-studio`](../../modules/shorts-studio/MODULE.md) |
| «вырежи паузы и тишину, но с экспортом в Resolve или Premiere» | `cadence-cut` | [`smart-cutter`](../../modules/smart-cutter/MODULE.md) |
| «убери неподвижные куски и чёрные кадры из записи» | `cadence-cut` | [`smart-cutter`](../../modules/smart-cutter/MODULE.md) |
| «нарежи по словам: оставь только места, где я говорю определённое слово» | `cadence-cut` | [`smart-cutter`](../../modules/smart-cutter/MODULE.md) |
| «собери проект для монтажной программы из этой нарезки» | `cadence-cut` | [`smart-cutter`](../../modules/smart-cutter/MODULE.md) |
| «разрежь запись на отдельные клипы по кускам речи» | `cadence-cut` | [`smart-cutter`](../../modules/smart-cutter/MODULE.md) |
| «сделай субтитры к видео, но основной способ не завёлся» | `cadence-cut` | [`speech-transcriber`](../../modules/speech-transcriber/MODULE.md) |
| «расшифруй запись в текст с таймкодами» | `cadence-cut` | [`speech-transcriber`](../../modules/speech-transcriber/MODULE.md) |
| «мне нужен файл со словами и временем каждого слова» | `cadence-cut` | [`speech-transcriber`](../../modules/speech-transcriber/MODULE.md) |
| «распознай речь моделью побольше, чтобы было точнее» | `cadence-cut` | [`speech-transcriber`](../../modules/speech-transcriber/MODULE.md) |
| «сделай субтитры в формате VTT» | `cadence-cut` | [`speech-transcriber`](../../modules/speech-transcriber/MODULE.md) |
| «сделай объяснялку человечками» | `cadence-structures` | [`stick-figure-animator`](../../modules/stick-figure-animator/MODULE.md) |
| «нужен мультяшный ролик со стикменами по моему сценарию» | `cadence-structures` | [`stick-figure-animator`](../../modules/stick-figure-animator/MODULE.md) |
| «анимируй этот текст палочными человечками под мою озвучку» | `cadence-structures` | [`stick-figure-animator`](../../modules/stick-figure-animator/MODULE.md) |
| «перескажи видео рисованными человечками» | `cadence-structures` | [`stick-figure-animator`](../../modules/stick-figure-animator/MODULE.md) |
| «сделай рисованное видео из этой истории» | `cadence-structures` | [`story-to-sketch-animation`](../../modules/story-to-sketch-animation/MODULE.md) |
| «оживи мои страницы комикса: пусть листаются как книга» | `cadence-structures` | [`story-to-sketch-animation`](../../modules/story-to-sketch-animation/MODULE.md) |
| «нужен ролик в стиле цветных карандашей или акварели из моего рассказа» | `cadence-structures` | [`story-to-sketch-animation`](../../modules/story-to-sketch-animation/MODULE.md) |
| «нарисуй историю в стиле вот этой картинки» | `cadence-structures` | [`story-to-sketch-animation`](../../modules/story-to-sketch-animation/MODULE.md) |
| «покажи меню стилей рисунка» | `cadence-structures` | [`story-to-sketch-animation`](../../modules/story-to-sketch-animation/MODULE.md) |
| «смонтируй мою запись в короткий ролик с субтитрами и графикой» | `cadence-cut` | [`video-copilot-skills`](../../modules/video-copilot-skills/MODULE.md) |
| «напиши сценарии на неделю в моём голосе» | `cadence-cut` | [`video-copilot-skills`](../../modules/video-copilot-skills/MODULE.md) |
| «нарежь это длинное видео на вертикальные шортсы» | `cadence-cut` | [`video-copilot-skills`](../../modules/video-copilot-skills/MODULE.md) |
| «поставь мои B-roll на этот ролик» | `cadence-cut` | [`video-copilot-skills`](../../modules/video-copilot-skills/MODULE.md) |
| «сделай из фото анимацию бумажным коллажем» | `cadence-cut` | [`video-copilot-skills`](../../modules/video-copilot-skills/MODULE.md) |
| «напиши сценарий короткого ролика по моей идее» | `cadence-visual-direction` | [`video-director-skills`](../../modules/video-director-skills/MODULE.md) |
| «сделай раскадровку и план графики под мой голос» | `cadence-visual-direction` | [`video-director-skills`](../../modules/video-director-skills/MODULE.md) |
| «собери ролик без лица: только голос и графика» | `cadence-visual-direction` | [`video-director-skills`](../../modules/video-director-skills/MODULE.md) |
| «добавь графику, субтитры и наезды в моё говорящее видео» | `cadence-visual-direction` | [`video-director-skills`](../../modules/video-director-skills/MODULE.md) |
| «смонтируй длинное видео 16:9 с графикой-объяснениями» | `cadence-visual-direction` | [`video-director-skills`](../../modules/video-director-skills/MODULE.md) |
| «сделай экран пополам: сверху картинки, снизу я» | `cadence-cut` | [`video-editing-skills`](../../modules/video-editing-skills/MODULE.md) |
| «поставь графику за мной, чтобы я был перед ней» | `cadence-cut` | [`video-editing-skills`](../../modules/video-editing-skills/MODULE.md) |
| «сделай рейтинг по уровням, как тир-лист, поверх моего видео» | `cadence-cut` | [`video-editing-skills`](../../modules/video-editing-skills/MODULE.md) |
| «нужны три разных варианта этого ролика для пробных рилсов» | `cadence-cut` | [`video-editing-skills`](../../modules/video-editing-skills/MODULE.md) |
| «сделай ролик в духе «три картинки и заголовок»» | `cadence-cut` | [`video-editing-skills`](../../modules/video-editing-skills/MODULE.md) |
| «запиши экран моего приложения, как оно работает» | `cadence-structures` | [`visual-fx-renderer`](../../modules/visual-fx-renderer/MODULE.md) |
| «мне нужна запись экрана с телефона для рекламного ролика» | `cadence-structures` | [`visual-fx-renderer`](../../modules/visual-fx-renderer/MODULE.md) |
| «сними демонстрацию приложения на симуляторе» | `cadence-structures` | [`visual-fx-renderer`](../../modules/visual-fx-renderer/MODULE.md) |
| «сделай видео прохода по экранам приложения» | `cadence-structures` | [`visual-fx-renderer`](../../modules/visual-fx-renderer/MODULE.md) |
| «озвучь этот текст по-русски» | `cadence-sound` | [`voice-synthesis-toolkit`](../../modules/voice-synthesis-toolkit/MODULE.md) |
| «прочитай мой сценарий голосом, чтобы прикинуть тайминг» | `cadence-sound` | [`voice-synthesis-toolkit`](../../modules/voice-synthesis-toolkit/MODULE.md) |
| «озвучь текст на английском выразительно» | `cadence-sound` | [`voice-synthesis-toolkit`](../../modules/voice-synthesis-toolkit/MODULE.md) |
<!-- modules:end -->
