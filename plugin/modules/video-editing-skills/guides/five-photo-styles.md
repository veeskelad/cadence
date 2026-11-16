# Пять фото-стилей: свои кадры и ресурсы (справка)

Когда: нужен один из пяти коротких 4,2-секундных стартовых шаблонов (shape-shift, picture-stack, scene-switch, visual-notes, orbit-reel) на своём вертикальном видео и своих картинках.

Это тихие шаблоны на 4,2 секунды, а не монтаж по расшифровке. Они лежат в `styles/<имя>/` (`build.py`, `template.html`, `example.json`), приём каждого описан в `guides/<имя>.md`. В модуль не входят ни образцы фото, ни образец говорящего: всё берётся из спецификации.

## Запуск

```bash
python3 modules/video-editing-skills/styles/orbit-reel/build.py work/<проект>/orbit-reel.json
# только редактируемая композиция, без рендера:
python3 modules/video-editing-skills/styles/orbit-reel/build.py work/<проект>/orbit-reel.json --prepare-only
```

Результат: `work/<проект>/out/orbit-reel.mp4` и рядом редактируемый HTML в `orbit-reel.composition/`. Нужны Python 3.9+, ffmpeg/ffprobe, Node.js 22+; анимация идёт на движке Cadence Tween из состава Cadence, рендер общим движком Cadence. Путь `out` в спецификации, если задан, считается от папки спецификации.

## Свои видео и картинки

Дай вертикальное видео 1080x1920 длиной не меньше `media_start + 4.2` секунды (смещение по умолчанию 0,04 с). Кадрируй заранее: шаблон не следит за лицом и не чинит смещённый кадр. Список ключей каждого шаблона лежит в его `example.json`; все ключи надо задать своими файлами.

```json
{
  "out": "my-orbit.mp4",
  "media_start": 0.04,
  "assets": {
    "explainer.mp4": "my-portrait.mp4",
    "explainer_cut.webm": "my-portrait-cutout.webm",
    "banana-heels.jpg": "my-first-image.jpg"
  },
  "text": {"Put your ideas": "Show your work"}
}
```

Имена ключей (`banana-heels.jpg`, `explainer.mp4` и так далее) только метки места в шаблоне, подставляется то, что ты указал. `text` делает буквальные замены в HTML и экранирует значения. Текст, который меняется по таймлайну, правится прямо в `template.html`.

## Вырезка человека

Shape Shift, Scene Switch и Visual Notes нужна вырезка; Orbit Reel нужны исходное видео и вырезка, их заменяют вместе; Picture Stack берёт только исходное видео. Вырезка делается с той же обрезкой, частотой кадров и длиной:

```bash
"$PY" modules/video-editing-skills/kit/cutout.py my-portrait.mp4 my-portrait-cutout.webm
```

Модель вырезки читается с диска из `kit/models/`; скачать её можно только с `--allow-download` (сеть) и с согласия человека. Проверить волосы, руки и перекрытие по глубине: сборщик проверяет размер и длину, но не качество альфы и не совпадение кадров.

## Границы

Длинные ролики, новые якоря картинок, свои субтитры и звук требуют правки таймлайна в шаблоне. Шаблоны не воспроизводят произвольный референс и не вырезают человека во время рендера.
