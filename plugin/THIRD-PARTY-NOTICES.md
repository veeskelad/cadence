# Сторонние компоненты

Cadence распространяется по лицензии MIT (`LICENSE.txt`). Чужие компоненты внутри набора
сохраняют свои лицензии. Их тексты лежат рядом с самими компонентами.

| Компонент | Где | Лицензия | Текст лицензии |
|---|---|---|---|
| three.js | `engine/vendor/three/` | MIT, © three.js authors | `engine/vendor/three/LICENSE` |
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
| Whisper (субтитры, по желанию) | ставишь сам: `pip install openai-whisper` или `faster-whisper` | MIT |
| Навыки HyperFrames и Remotion (по желанию) | `npx skills add …` из первоисточника | у каждого своя; Remotion бесплатен для одиночек и команд до 3 человек |

## Источники знаний

Словарь приёмов `knowledge/techniques/` — пересказ своими словами открытого каталога
кинематографических приёмов melies.co/cinematic-techniques; дословных карточек каталога в наборе нет.
Рецепты банка эффектов ссылаются на публичные ролики, по которым разобран приём; сами ролики
в набор не входят.

## Звуки и музыка

Звуки в `sounds/` и демо-бит синтезированы кодом этого набора (`scripts/make_sounds.py`,
`scripts/demo_beat.py`) и распространяются по MIT вместе с ним. Чужой музыки в наборе нет.
Права на трек, который ты подкладываешь сам, — на тебе. Для публикации бери свой трек или
трек из библиотеки площадки.

## Методические источники

Самостоятельные инструкции Cadence разработаны после изучения открытых систем [Taste](https://github.com/Leonxlnx/taste-skill) и [Emil](https://github.com/emilkowalski/skills). Их идеи преобразованы в собственные контракты и процедуры Cadence; исходные тексты, код, брендовые материалы и рабочие исследования не включены в эту поставку. Их репозитории имеют собственные лицензии MIT. Эта запись не изменяет лицензии используемых компонентов или права на внешние материалы.
