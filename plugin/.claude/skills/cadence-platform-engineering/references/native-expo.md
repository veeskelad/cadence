# Native и Expo: контракт реализации

Применяется к существующему native-проекту. Выяснить SDK, архитектуру, версии Reanimated/worklets/gesture handler/router, доступные native primitives и минимальную OS. Нельзя запускать installers из этой инструкции. Если dependency отсутствует, указать потребность и получить разрешение на точное изменение.

## Runtime и state

React/RN runtime хранит semantic state и результат операции. Непрерывное положение/scroll/gesture держать в UI runtime установленного animation API. Не выполнять setState и возврат в RN на каждом frame. UI worklet вызывает semantic callback на commit/threshold, с id и защитой повторов. Shared values не читать/писать во время React render. Функции, пересекающие runtime, должны поддерживать serialization/worklet contract версии. Проверить compiler-safe accessors, а не механически заменить все .value.

Gesture object и layout builders должны иметь устойчивую identity: module scope для постоянных, memo для конфигураций. Новая render-функция не переустанавливает recognizer посреди pan. Setup проверяет root gesture view, совместимость architecture и worklets transform; preset/plugin зависит от версии/типа проекта. Deprecated scheduling API не переносить в новую версию без installed types.

## Выбор конструкции

| Задача | Конструкция | Что обязательно |
|---|---|---|
| Press/state toggle | Простейший поддерживаемый transition | feedback на press-in, commit/cancel после release, увеличенный hit target |
| Gesture/scroll | Shared value → animated style | axis/ownership, current presentation, velocity handoff |
| Навигация по stack | Существующий native stack | back gesture, modal lifetime, platform default |
| Tab peers | Платформенная tab navigation | без искусственной иерархии; accessible selected state |
| Destination sheet | native presentation, если подходит | detents/version/platform limits, accessibility, keyboard |
| Sheet внутри сцены | measured bounds + gesture | content scroll vs handle, cancel и backdrop от той же позиции |
| Menu/preview/title/refresh | Доступные native primitives | поддержку каждой OS проверить; unsupported имеет видимый fallback |
| Illustration | установленный illustration renderer | не использовать для semantic UI state |
| Большая рисованная поверхность | Canvas при доказанном bottleneck views | проверить hit/accessibility альтернативы |
| Keyboard-following UI | реальное keyboard position API | provider и lifecycle; не угадывать системную кривую |

Изменение transform сохраняет порядок матриц. Не называть transform/opacity «бесплатными»: проверить view complexity и shadow layers. Тяжёлую Android shadow/blur лучше держать заранее подготовленным слоем и изменять visibility, если результат тот же. Абсолютный childless indicator может менять width, когда scale портит радиус и siblings не relayout; проверка стоимости остаётся.

## Самостоятельные recipes

- **Sheet:** bounds получены onLayout с учётом текста/insets. Gesture starts from presentation; move ограничен/сопротивляется вне границ; release project выбирает detent; spring получает v. Завершение dismiss вызывает один callback только если не отменено. Grabber не единственный способ управления. Form-sheet с intrinsic-height контентом не получает бессмысленное flex:1; nested navigation только если платформенный контракт допускает.
- **Swipe row:** направление объявлено до захвата; вертикальный список сохраняет scroll. Reveal действий и commit различаются. Закрытие gap принадлежит list layout. Воспользоваться installed swipe primitive, если он покрывает нужные semantics.
- **Collapsing header:** fixed/clipped region, внутри transform и opacity от clamp scroll progress; native large title предпочтительнее собственной копии при той же задаче. Не relayout всего списка каждым scroll tick.
- **List:** virtualized recycled row не проигрывает entrance каждый раз при scroll. Container может раскрыться один раз; item layout только при реальном изменении списка. Stable keys и memo config.
- **Keyboard footer:** от реальной keyboard height, с корректным sign/units; provider присутствует; background/unmount останавливает callbacks.
- **Tab indicator:** onLayout сохраняет bounds; current active выбирает x/width. Промежуточные значения не читаются как React state каждый кадр; label не деформируется.
- **Toast:** insets + измеренный текст; одно сообщение/id; user action доступен без swipe. Не нарушать navigation focus. Stack layout и исчезновение согласованы.
- **Threshold:** сравнить armed и previous armed на UI runtime; RN callback только на изменение; haptic не является независимым per-frame таймером.

Press targets учитывать платформенные единицы и accessibility (обычный ориентир iOS 44pt, Android 48dp), hitSlop расширяет область без увеличения glyph. Dynamic Type изменяет bounds; не отключать font scaling ради фиксированной высоты. Reduced motion передаётся поддерживаемому системному API; haptics отключаемы и имеют visual alternative. Вибрация и sound совпадают с причинным событием, а не просто с завершением tween.

## QA

Проверить repeated/interrupt/reverse, scroll конкуренцию, второго pointer, cancellation, отсутствие RN callback per frame, text scaling, screen reader, keyboard, insets и обе целевые OS. При высокой частоте дисплея измерять доступный budget, настройки FPS и power behavior по фактическому проекту. Производительность оценивать на release build и слабом поддерживаемом устройстве; simulator/debug не достаточны. Никакие native gestures/haptic/runtime не входят в обычный MP4: сценарий и кадры работают через renderer Cadence.
