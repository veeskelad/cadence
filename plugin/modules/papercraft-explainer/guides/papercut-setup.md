# Papercut setup

Когда: ролик не собирается или нужно понять, чего не хватает: Node, ffmpeg, Chrome, Python-пакеты, локальный голос.

Библиотека лежит в самом модуле: `PAPERCUT_LIB=modules/papercraft-explainer/library` (абсолютный путь от корня Cadence).
Отдельной установки навыков здесь нет. Ставятся только внешние программы и пакеты, и только с согласия человека.

## Проверка без сети

```
node -v          # нужен 22 или новее
python3 scripts/engine_setup.py status                       # движок Cadence: ready
python3 scripts/module_setup.py status papercraft-explainer   # пакеты модуля
ffmpeg -version | head -1
python3 -c 'import numpy, PIL, soundfile'      # плитки, контактные листы, сведение звука
bash modules/papercraft-explainer/library/tools/selftest.sh    # собирает пример и рендерит один кадр
```

`selftest.sh` ничего не скачивает: ему нужны поставленные пакеты модуля (`python3 scripts/module_setup.py install papercraft-explainer`, сеть, только с согласия) и движок Cadence.
Без Chrome или Chromium не соберётся звук (`audio/render.mjs`); путь задаётся переменной `CHROME_PATH`.

## Три уровня

- **Минимальный**: только справка из этой папки (стратегия, хук, сценарий, раскадровка, подсказки по стилю). Ничего не рендерится.
- **Стандартный**: Node 22+, ffmpeg, Python с numpy, Pillow и soundfile, Chrome, пакеты модуля (около 100 МБ) и движок Cadence.
  Рендер с временной озвучкой (`library/tools/placeholder_vo.py`, тишина или macOS `say`).
- **Полный**: стандартный плюс локальный голос Qwen3-TTS (`library/voice/setup_tts.sh`: окружение около 1,5 ГБ и модель 2,3 или 4,2 ГБ)
  и распознавание речи для таймингов слов. Перед загрузкой спросить человека; на машине без GPU генерация занимает минуты на строку,
  тогда проще записать голос самому.

`setup_tts.sh` пишет `QWEN_TTS_PY` и `ASR_PY` в `~/.config/papercut-explainer/config.env`, и остальные голосовые скрипты берут пути оттуда.

## Если что-то не работает

| Признак | Что делать |
|---|---|
| Node старше 22 или нет | Поставить Node 22+. |
| Нет ffmpeg | Поставить ffmpeg через менеджер пакетов системы. |
| «need Python 3.10-3.12» в голосовом окружении | У Qwen3-TTS нет сборок под новые Python: поставить Python 3.12 или `uv` и повторить `setup_tts.sh`. |
| Загрузка модели обрывается | Повторить: готовые файлы сохраняются, скрипт сам пробует три раза. |
| Рендер долго не начинается | Движок ждёт чужой рендер на этой машине: одновременно идёт один. |
| Нет текстуры `felt-fibre.mp4` | Она процедурная: `python3 library/papercut/tools/textures.py felt-fibre` (нужен ffmpeg). |
| Саморазбор падает | Запустить `library/tools/selftest.sh` напрямую и смотреть, на каком шаге останавливается. |
