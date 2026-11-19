# Сторонние компоненты

Cadence распространяется по собственной лицензии (`LICENSE.txt`). Чужие компоненты внутри набора
сохраняют свои лицензии. Их тексты лежат рядом с самими компонентами.

| Компонент | Где | Лицензия | Текст лицензии |
|---|---|---|---|
| three.js | `engine/vendor/three/` | MIT, © three.js authors | `engine/vendor/three/LICENSE` |
| shaders 4.0.0 (WebGPU-шейдеры для блоков библиотеки) | `engine/lib/shaders.iife.js` | MIT, © 2026 Shader Effects Inc. | `engine/lib/shaders.THIRD-PARTY-LICENSES.txt` |
| Literata | `engine/fonts/literata/` | SIL Open Font License 1.1 | `engine/fonts/literata/LICENSE` |
| Manrope | `engine/fonts/manrope/` | SIL Open Font License 1.1 | `engine/fonts/manrope/LICENSE` |
| JetBrains Mono | `engine/fonts/jetbrains-mono/` | SIL Open Font License 1.1 | `engine/fonts/jetbrains-mono/LICENSE` |
| Onest | `engine/fonts/onest/` | SIL Open Font License 1.1 | `engine/fonts/onest/LICENSE` |
| Sofia Sans Extra Condensed | `engine/fonts/sofia-sans-extra-condensed/` | SIL Open Font License 1.1 | `engine/fonts/sofia-sans-extra-condensed/LICENSE` |
| Alumni Sans | `engine/fonts/alumni-sans/` | SIL Open Font License 1.1 | `engine/fonts/alumni-sans/LICENSE` |
| Oswald | `engine/fonts/oswald/` | SIL Open Font License 1.1 | `engine/fonts/oswald/LICENSE` |
| Roboto Flex | `engine/fonts/roboto-flex/` | SIL Open Font License 1.1 | `engine/fonts/roboto-flex/LICENSE` |
| Tektur | `engine/fonts/tektur/` | SIL Open Font License 1.1 | `engine/fonts/tektur/LICENSE` |
| Inter Tight | `engine/fonts/inter-tight/` | SIL Open Font License 1.1 | `engine/fonts/inter-tight/LICENSE` |
| Golos Text | `engine/fonts/golos-text/` | SIL Open Font License 1.1 | `engine/fonts/golos-text/LICENSE` |
| Geologica | `engine/fonts/geologica/` | SIL Open Font License 1.1 | `engine/fonts/geologica/LICENSE` |
| Jost | `engine/fonts/jost/` | SIL Open Font License 1.1 | `engine/fonts/jost/LICENSE` |
| Montserrat | `engine/fonts/montserrat/` | SIL Open Font License 1.1 | `engine/fonts/montserrat/LICENSE` |
| Wix Madefor Display | `engine/fonts/wix-madefor-display/` | SIL Open Font License 1.1 | `engine/fonts/wix-madefor-display/LICENSE` |
| Unbounded | `engine/fonts/unbounded/` | SIL Open Font License 1.1 | `engine/fonts/unbounded/LICENSE` |
| Dela Gothic One | `engine/fonts/dela-gothic-one/` | SIL Open Font License 1.1 | `engine/fonts/dela-gothic-one/LICENSE` |
| Rubik Mono One | `engine/fonts/rubik-mono-one/` | SIL Open Font License 1.1 | `engine/fonts/rubik-mono-one/LICENSE` |
| Playfair Display | `engine/fonts/playfair-display/` | SIL Open Font License 1.1 | `engine/fonts/playfair-display/LICENSE` |
| Cormorant | `engine/fonts/cormorant/` | SIL Open Font License 1.1 | `engine/fonts/cormorant/LICENSE` |
| Yeseva One | `engine/fonts/yeseva-one/` | SIL Open Font License 1.1 | `engine/fonts/yeseva-one/LICENSE` |
| Pixelify Sans | `engine/fonts/pixelify-sans/` | SIL Open Font License 1.1 | `engine/fonts/pixelify-sans/LICENSE` |
| Press Start 2P | `engine/fonts/press-start-2p/` | SIL Open Font License 1.1 | `engine/fonts/press-start-2p/LICENSE` |
| Caveat | `engine/fonts/caveat/` | SIL Open Font License 1.1 | `engine/fonts/caveat/LICENSE` |
| Sanzo Wada colour-combinations dataset by Matt DesLauriers (based on Dain M. Blodorn Kim's digitization) | `knowledge/palettes/sanzo-wada/vol1-colors.json` | MIT, © 2020 Matt DesLauriers | `knowledge/palettes/sanzo-wada/LICENSE.md` |

## Не входят в архив, ставятся отдельно

| Компонент | Как попадает | Лицензия |
|---|---|---|
| HyperFrames | `npm --prefix engine install` | Apache 2.0 |
| Chrome без окна (рендер) | скачивает HyperFrames при установке | лицензия Chromium и Google |
| CrispASR (субтитры, по желанию) | ставишь сам: файл со страницы релизов github.com/CrispStrobe/CrispASR | MIT; модель Parakeet TDT v3 — CC-BY-4.0 (NVIDIA) |
| Whisper (субтитры, по желанию) | ставишь сам: `pip install openai-whisper` или `faster-whisper` | MIT |
| Навыки HyperFrames (по желанию) | `npx skills add …` из первоисточника | Apache 2.0 |

## Модули

Почти все модули `modules/<id>/` сделаны на основе открытых проектов других авторов. Их часть остаётся
под лицензией автора, добавленное Cadence — под лицензией Cadence. У каждого модуля: `UPSTREAM.md` —
проект, автор, лицензия и как взято; `licenses/` — тексты лицензий автора; вложенные `NOTICE*`,
`LICENSE*`, `CREDITS*` — там, где они лежали у автора. Зависимости модулей (pip, npm, модели) в архив
не входят и ставятся `python3 scripts/module_setup.py install <id>` по согласию; у каждой своя лицензия.
Вырезка человека в `video-editing-skills` на macOS — встроенная сегментация Vision, на Linux —
MediaPipe 0.10.21 (Apache-2.0, модель внутри пакета). Рендер всех модулей — общий движок HyperFrames.

| Модуль | Проект автора | Автор | Лицензия | Подробно |
|---|---|---|---|---|
| `b-roll-toolkit` | [iart-ai/b-roll-skills](https://github.com/iart-ai/b-roll-skills) | iart.ai | MIT | `modules/b-roll-toolkit/UPSTREAM.md` |
| `calligraphy-art-motion` | [alchaincyf/huashu-art-motion](https://github.com/alchaincyf/huashu-art-motion) | alchaincyf (花叔) | MIT; демо-персонажи автора под лицензию не входят | `modules/calligraphy-art-motion/UPSTREAM.md` |
| `cinematic-motion-skill` | [tonyprots/motion-film-skill](https://github.com/tonyprots/motion-film-skill) | tonyprots | MIT и лицензии вложенных частей (см. NOTICE.md) | `modules/cinematic-motion-skill/UPSTREAM.md` |
| `code-to-film-engine` | [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar/tree/f171360) | Lemomo (LemoLab) | MIT на коммите f171360 (позже автор перевёл тексты и промпты на CC BY-NC 4.0; они сюда не входят) | `modules/code-to-film-engine/UPSTREAM.md` |
| `data-motion-graphics` | [EddyTheDesigner/Data-Driver](https://github.com/EddyTheDesigner/Data-Driver) | EddyTheDesigner | НЕТ ЛИЦЕНЗИИ: все права у автора | `modules/data-motion-graphics/UPSTREAM.md` |
| `declarative-frames-community-skills` | [heygen-com/hyperframes-community-skills](https://github.com/heygen-com/hyperframes-community-skills) | HeyGen | Apache-2.0 | `modules/declarative-frames-community-skills/UPSTREAM.md` |
| `declarative-video-frames` | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | HeyGen, Inc. | Apache-2.0 | `modules/declarative-video-frames/UPSTREAM.md` |
| `doodle-animator` | [alexgreensh/anidoodle](https://github.com/alexgreensh/anidoodle) | Alex Greenshpun | Apache-2.0 | `modules/doodle-animator/UPSTREAM.md` |
| `effortless-cuts` | [ranahaani/i-hate-editing](https://github.com/ranahaani/i-hate-editing) | Muhammad Abdullah (ranahaani) | MIT | `modules/effortless-cuts/UPSTREAM.md` |
| `explainer-engine` | [vincentsch/explainroo](https://github.com/vincentsch/explainroo) | Vincent Schmalbach | MIT | `modules/explainer-engine/UPSTREAM.md` |
| `expressive-voice-synth` | [QwenAudio/CosyVoice](https://github.com/QwenAudio/CosyVoice) | FunAudioLLM / Alibaba | Apache-2.0 | `modules/expressive-voice-synth/UPSTREAM.md` |
| `ffmpeg-toolkit` | [kajisho5/ffmpeg-skill](https://github.com/kajisho5/ffmpeg-skill) | kajisho5 | MIT | `modules/ffmpeg-toolkit/UPSTREAM.md` |
| `logo-craft-skill` | [kaankiziltug/logo-design-skill](https://github.com/kaankiziltug/logo-design-skill) | kaankiziltug | MIT | `modules/logo-craft-skill/UPSTREAM.md` |
| `mlx-audio-engine` | [Blaizzy/mlx-audio](https://github.com/Blaizzy/mlx-audio) | Prince Canuma | MIT | `modules/mlx-audio-engine/UPSTREAM.md` |
| `montage-toolkit` | [nateherkai/herk-edit-kit](https://github.com/nateherkai/herk-edit-kit) | Nate Herk | MIT (с исключением для бренда автора) | `modules/montage-toolkit/UPSTREAM.md` |
| `motion-graphics-pipeline` | [isaachang/motion-video-workflow](https://github.com/isaachang/motion-video-workflow) | Isaac Chang | MIT | `modules/motion-graphics-pipeline/UPSTREAM.md` |
| `motion-graphics-presets` | [Vincentwei1021/mg-styles-15](https://github.com/Vincentwei1021/mg-styles-15) | Vincentwei1021 | MIT | `modules/motion-graphics-presets/UPSTREAM.md` |
| `neural-tts-engine` | [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) | Alibaba Cloud (QwenLM) | Apache-2.0 | `modules/neural-tts-engine/UPSTREAM.md` |
| `papercraft-explainer` | [0xS4N4TG/papercut-explainer](https://github.com/0xS4N4TG/papercut-explainer) | sanat (0xS4N4TG) | MIT | `modules/papercraft-explainer/UPSTREAM.md` |
| `phantom-editor` | [kurbaitaev/ghost-editor](https://github.com/kurbaitaev/ghost-editor) | kurbaitaev | MIT | `modules/phantom-editor/UPSTREAM.md` |
| `promo-motion-kit` | [software-mansion-labs/goldie](https://github.com/software-mansion-labs/goldie) | Kacper Kapuściak (Software Mansion) | MIT; рамки устройств и шрифты — свои лицензии (assets/ATTRIBUTION.md) | `modules/promo-motion-kit/UPSTREAM.md` |
| `promo-showcase` | [latent-spaces/brag](https://github.com/latent-spaces/brag) | Shunit Haviv Hakimi (latent-spaces) | MIT | `modules/promo-showcase/UPSTREAM.md` |
| `reels-crafter` | [lalimi/claude-reelsmith](https://github.com/lalimi/claude-reelsmith) | lalimi | MIT | `modules/reels-crafter/UPSTREAM.md` |
| `shorts-studio` | [AgriciDaniel/claude-shorts](https://github.com/AgriciDaniel/claude-shorts) | Daniel Agrici | MIT | `modules/shorts-studio/UPSTREAM.md` |
| `smart-cutter` | [WyattBlue/auto-editor](https://github.com/WyattBlue/auto-editor) | WyattBlue | Unlicense | `modules/smart-cutter/UPSTREAM.md` |
| `speech-transcriber` | [openai/whisper](https://github.com/openai/whisper) | OpenAI | MIT | `modules/speech-transcriber/UPSTREAM.md` |
| `stick-figure-animator` | [nispa/stickman-video](https://github.com/nispa/stickman-video) | nispa | MIT | `modules/stick-figure-animator/UPSTREAM.md` |
| `story-to-sketch-animation` | [gnipbao/story-to-handdrawn-video](https://github.com/gnipbao/story-to-handdrawn-video) | gnipbao | MIT | `modules/story-to-sketch-animation/UPSTREAM.md` |
| `video-copilot-skills` | [Melvynx/video-agent-skills](https://github.com/Melvynx/video-agent-skills) | Melvyn Malherbe (Melvynx) | MIT | `modules/video-copilot-skills/UPSTREAM.md` |
| `video-director-skills` | [imtamiliniyan/claude-video-skills](https://github.com/imtamiliniyan/claude-video-skills) | Tamil Iniyan | MIT | `modules/video-director-skills/UPSTREAM.md` |
| `video-editing-skills` | [artemnovitckii/claude-editing-skills](https://github.com/artemnovitckii/claude-editing-skills) | Artem Novitckii | MIT (медиа витрины автора не входят) | `modules/video-editing-skills/UPSTREAM.md` |
| `visual-fx-renderer` | не подтверждён | — | — | `modules/visual-fx-renderer/UPSTREAM.md` |
| `voice-synthesis-toolkit` | [resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox) | Resemble AI | MIT | `modules/voice-synthesis-toolkit/UPSTREAM.md` |

## Источники знаний

Словарь приёмов `knowledge/techniques/` — пересказ своими словами открытого каталога
кинематографических приёмов melies.co/cinematic-techniques; дословных карточек каталога в наборе нет.
Рецепты банка эффектов ссылаются на публичные ролики, по которым разобран приём; сами ролики
в набор не входят.

## Звуки и музыка

Звуки в `sounds/` и демо-бит синтезированы кодом этого набора (`scripts/make_sounds.py`,
`scripts/demo_beat.py`) и распространяются вместе с ним по лицензии Cadence; в своих роликах их можно использовать без отдельного разрешения. Чужой музыки в наборе нет.
Права на трек, который ты подкладываешь сам, — на тебе. Для публикации бери свой трек или
трек из библиотеки площадки.

## Методические источники

Самостоятельные инструкции Cadence разработаны после изучения открытых систем [Taste](https://github.com/Leonxlnx/taste-skill) и [Emil](https://github.com/emilkowalski/skills). Их идеи преобразованы в собственные контракты и процедуры Cadence; исходные тексты, код, брендовые материалы и рабочие исследования не включены в эту поставку. Их репозитории имеют собственные лицензии MIT. Эта запись не изменяет лицензии используемых компонентов или права на внешние материалы.
