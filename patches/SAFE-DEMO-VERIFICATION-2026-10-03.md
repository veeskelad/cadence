# Cadence: исправленный demo и полный экспорт

Исправлен первый demo-шаблон beat-reel из публичного Cadence 1.3. Сохранены
тёплая палитра, шрифты, генераторы, расшифровка хука, монтаж по биту и кольцо плиток.
Публичный ZIP, pointer и landing не изменялись этой работой.

## Изменения исходников

Review patch `cadence-1.3-safe-demo.patch` содержит четыре файла:

- `engine/templates/beat-reel/index.html`: safe-area для хука, всех сцен,
  полосы бита, имени, подписи и CTA; overlap на входе финального знака.
- `engine/lib/reel-layout.js`: консервативная область, измерение посимвольной
  строки с учётом отличия от kerning, canvas clipping текста в координатах экрана.
- `engine/reel-layout.test.mjs`: четыре regression tests.
- `examples/beat-reel/film.json`: подпись «дизайн · моушн · монтаж · звук».

На 1080×1920 essential content защищён прямоугольником
x=65..885, y=288..1440. Для текста действует clipping независимо от масштаба
и вращения сцены. Фон может идти до краёв; полноэкранные абстрактные элементы
не превращены в отдельную маленькую картинку. Тексты сцен адаптированы к safe rect.
Хук измеряется по сумме advances отдельных символов, которыми реально рисуется
decoder. Выход хука больше не масштабирует читаемый текст за края safe area.

На финальном стыке исходящий кадр удерживается и затухает 0.45s, пока плитки
влетают. Название начинает появляться прямо на cut. Предыдущая тёмная пауза
9.60–9.83s устранена. Пример и fallback-template одинаково называют полный состав Cadence.

## Проверки исходников

- `git apply --check` к неизменённой распаковке public 1.3: PASS.
- `node --test engine/reel-layout.test.mjs`: 4/4 PASS.
- Проверены точные margins, длинная кириллическая строка/kerning, clipping
  при zoom/rotation, фон до краёв без сдвига foreground.
- Root выполнил независимый bounded review patch: blocking замечаний нет.

Original archive SHA-256:
`2184ace1ce4f3706b55f418b8ae7580cc55cdd2bddba48ab89ba70f3e2e42406`.

Patch SHA-256:
`8e24e2475206a695514c35f73242d16fc0de2c8cd0161b67c2fb95d0f0aa9b20`.

## Финальный MP4

Финальная композиция с обновлённой полной подписью прошла штатные npm check/render
на aisy-core через существующий Hyperframes 0.7.64, telemetry выключена.
Рендер завершён: 378/378 кадров, high quality, 2m17.0s. Исходная запись около 9.3 MB.

После завершённой передачи выполнены deliver, затем по отдельному заданию root
двухпроходная loudnorm-нормализация тестового артефакта к −16 LUFS. Source
`deliver.py` и штатное правило Cadence «без limiter» не изменялись. FFmpeg
выбрал dynamic normalization; перед AAC оставлена дополнительная peak-headroom,
после normalization gain −0.5 dB. Этот mastering относится к финальному demo,
а не обещает другой звук из неизменённого release deliver.

Измерения на окончательном декодированном файле:

- 1080×1920, 30 fps, H.264 / yuv420p, AAC 48 kHz.
- SAR 1:1, DAR 9:16, rotation отсутствует.
- Длина контейнера 12.600s, 378 видеокадров.
- Интегральная громкость −16.3 LUFS, true peak −3.4 dBTP.
- Громкость и peak прошли checker; клиппинг не выявлен.
- Видео не перекодировано при mastering: packet SHA исходного и final video одинаковый,
  `0d2a20ff055471638ccae4011bf61d6823a6dbcb9c175f4d9fbf027fb6b36968`.

## Визуальная проверка и остаточные предупреждения

Осмотрен contact sheet с UI-overlay через каждые 0.25s, отдельные final-tagline
и opening кадры и seam contact 9.5–10s. Хук, названия сцен, полоса бита,
название Cadence, полный состав и CTA находятся внутри working safe area.
Абстрактный фон и декоративные плитки могут выходить за её границы.
Это модель консервативных UI-перекрытий, а не скриншот конкретного Instagram account/device.

`check_reel.py` оставляет две осмысленные отметки «внимание»:

- Near-black 0.07–0.17s. Кадр 0.1s осмотрен: на нём видны активные glyphs,
  это начало расшифровки текста на тёмном фоне, а не пустой/потерянный кадр.
- Freeze 0.533333–1.933333s, длительность 1.4s. Это удержание уже открытого
  хука для чтения. 0.53s в коротком отчёте является началом, а не длительностью.

StaticGuard Hyperframes пишет warning про audio data-end, хотя source HTML
содержит data-duration на всех 12 audio. check возвращает 0; runtime/layout/motion
не сообщают ошибок. Warning не скрыт и не «исправлен» изменением корректного source.

Звучание на наушниках/телефоне и субъективный баланс не прослушаны этим агентом.
Подтверждены waveform/loudness/true peak, сохранение временной сетки и отсутствие
визуального blackout на финальном стыке. Обложка/profile-grid crop отдельно не создавались:
этот artefact проверяет demo-экспорт, публикация не выполнялась.

## Связь с candidate free 1.4

Root подготовил отдельный review candidate `cadence-1.4.zip`, 2 872 265 байт,
SHA-256 `68f33226c21651536dd3545f8a17132c978e5925c8a218ec5b39ae99a4a44099`.

Сборка нового first-reel из установленного candidate с default командой guide
(без необязательного `--pack`) **совпала по SHA всех 41 build-файлов** с
композицией финального серверного render. Поэтому этот полный MP4 проверяет
тот же default composition candidate 1.4. Не делалось redundant повторного render.

Отдельная сборка с `--pack cadence-ember` отличается только двумя цветами tokens
и комментариями/hex case в index.html. Она не объявляется проверенной этим MP4.
Fresh/repeat/update установки candidate отдельно проверял root; здесь подтверждена
связь default build с фактически экспортированными кадрами, а не независимый install audit 1.4.

## Сохранённые артефакты

Постоянная папка в distribution clone:
`output/cadence-safe-demo-20261003/` (игнорируется только local git exclude).

- `out/reel.mp4`: окончательный нормализованный demo.
- `out/reel-raw.mp4`: полный raw export для воспроизводимости.
- `out/reel-deliver-linear.mp4`: промежуточный штатный deliver, не выдавать как final.
- `build/`: точная композиция render; `review-source/`: четыре изменённых исходника.
- `ui-all-frames.jpg`, `final-tagline-ui.png`, `opening-0.1s.png`, `seam-9.5-10s.jpg`.
- `check.log`, `render.log`, `check-reel.json`, `ffprobe.json`, `freeze-scan.log`.
- `audio-first-pass.json`, `audio-second-pass.json`.
- `provenance.json`: SHA исходного archive, patch, исходников и final MP4.
- `candidate-1.4-build-match.json`: все 41 matching build SHA.

Review source patch сохранён отдельно в `patches/`. Public Pages и ZIP
не публиковались; новая версия остаётся предметом отдельного review/release решения.
