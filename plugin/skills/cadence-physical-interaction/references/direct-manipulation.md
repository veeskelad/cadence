# Контракт прямого управления

## Состояния и вход

```text
idle → pressed → dragging → settling → idle/committed
pressed → cancelled → idle
settling → pressed/dragging: новый захват из текущей presentation position
```

Задать axis, bounds, snapPoints, grabOffset, activePointer, hysteresis, velocity window, commit/cancel policy, lifecycle callback и eventId. Pointer-down показывает местный feedback; semantic commit происходит после успешного release. Захват не переносит объект в центр пальца. Хранить одну активную pointer identity; второе касание не меняет grabOffset.

На web capture обеспечивает продолжение за bounds, pointercancel/lostcapture выполняют cleanup. Touch-action назначается только поверхности, которая действительно владеет осью; другая ось остаётся scroll. На native распознаватель выбирается по установленной версии, competing gestures разрешают scroll вместо похищения каждого pan. Порог намерения измеряется в координатах ввода, а не в пикселях экспортируемого видео.

## Отпускание и проекция

Оценить release velocity по короткой истории position/time; одинаковые timestamps игнорировать, единицы явно назвать. Проекция непрерывного затухания с rate λ>0: projected=p+v/λ. Выбрать допустимый snap point по projected и направлению, не только расстоянию. У разрушительной операции переход на сторону delete не равен немедленному необратимому удалению: применить установленную политику подтверждения/undo.

Сопротивление вне границы b: для overshoot d использовать непрерывную насыщаемую функцию, например offset=sign(d)×L×(1−exp(−abs(d)/L)), L>0. В самой границе offset=0; derivative около границы не скачет, дальний overshoot ограничен L. Не применять это к реальным данным графика. Handoff начинает spring с текущих p и v; для 2D хранить отдельные координаты и скорости. При относительных единицах velocity делить на distance только если distance не близко к нулю; иначе использовать нулевую нормированную скорость/абсолютный API по контракту.

## Рецепты

| Задача | Исполнение | QA |
|---|---|---|
| Перетаскиваемая панель | native sheet, если это destination; иначе measured bounds, drag ownership и snapPoints; backdrop от той же позиции | короткий flick, медленное отпускание, перехват на доезде, content scroll, cancel |
| Свайп строки | горизонтальное намерение, вертикальный scroll остаётся; reveal-action отделён от swipe-commit; gap закрывает список | повтор, направление назад, строка не удаляется дважды, действия доступны без жеста |
| Slider/picker | значение clamp к domain; позиция pointer отделена от quantized value; feedback на смену detent | края, нулевой range, keyboard и точное итоговое значение |
| Плавающий объект | grabOffset сохраняется; projected endpoint выбирает ближайший разрешённый слот | X/Y velocity, столкновение с bounds, ориентация/resize |
| Hold | явный threshold, cancel до достижения, один commit-id; feedback ранний | отпускание на пороге, ухода focus, повторный contact |
| Карточка раскрытия | источник и common element сохраняются; reverse начинается из видимого state | открытие/закрытие до завершения и неподвижный текст |

Никакой input lock только ради завершения красивого перехода. Дополнительная задержка double-tap оправдана только существующим вторым действием. Tab peers не должны изображать иерархию, а возврат по stack должен сохранять понятную обратную связь.

## Материал, типографика и чувства

Затемнение сообщает временный modal focus, прозрачная панель без scrim допускает параллельную работу. Слои глубины не должны превращаться в несколько нечитаемых стеклянных подложек. Цвет/шрифт текущего пака приоритетны; system font не заменяет согласованный бренд автоматически. Размер, weight, tracking и leading рассматриваются вместе; Dynamic Type/zoom меняет layout, а не только glyph scale.

Связать feedback с событием: contact/selection/commit/result. Sound и haptic обозначают тот же причинный момент, но отсутствие поддержки или отключённая вибрация не скрывают визуальный результат. Событие имеет id и срабатывает один раз, не на каждом frame/scroll; реальные haptic-API выбирать по платформе. Для MP4 только сценарные sound cues через cadence-sound, без vibration.

## Доступность и приёмка

Reduced-motion заменяет большие перемещения локальным state; reduced-transparency повышает устойчивость фона; high-contrast сохраняет видимые границы. Gesture имеет кнопку/keyboard alternative. Touch target определяется платформой и реальными controls, не увеличением визуального логотипа в MP4. Проверить undo/cancel, focus/keyboard, отпускание вне bounds, второй pointer и backgrounding; записать, что проверено на устройстве, что только по коду.

## Дисциплина интерфейса

Перед реализацией проверить восемь задач: нужное действие имеет цель; человек сохраняет cancel/undo и управление; обработка данных/прав прозрачно соответствует операции; знакомые controls ведут себя предсказуемо; layout выдерживает контексты и способности; основной путь понятен без скрытых ловушек; детали, состояния и feedback согласованы; выбранное чувство возникает из результата, а не конфетти. Status, completion, warning и error различаются содержанием, не только цветом. Экран сообщает текущее место, доступный следующий шаг и выход. Контроль расположен у изменяемого объекта, конкретный label описывает действие. Это критерии проверки, не повод добавить unsolicited permission workflow.

## Малые UI-рецепты

Входы всех: semantic state, current presentation, измеренный layout, установленный API, tokens и a11y. Результат — from/to и event владельцы с cancel/reverse.

| Рецепт | State и закон | Проверка |
|---|---|---|
| Button | down показывает локальную реакцию; up внутри цели commit, cancel возвращает | keyboard, drag-away/back и повтор |
| Popover/menu/select | источник задаёт origin; состояние open; current-to-target вместо restart | focus, escape, trigger и обратное действие |
| Tooltip | initial intent-delay может избегать случайного показа; переход к соседнему подсказанному control без лишнего ожидания; содержимое accessible | keyboard и touch не зависят от hover |
| Modal | самостоятельный task, централизованный surface/scrim и focus return | cancel, overlay stacking и background focus |
| Drawer | общая axis/edge; drag-time не фиксированный keyframe; settle от velocity | interruption и content scroll |
| Toast | operation state/id; появление и уход по пространственному контракту стека | отдельный notification-state и оба вида закрытия |
| Accordion | open/closed, измеренная content-height, локальный clip; не деформировать буквы | dynamic text и re-open mid-transition |
| Stagger | порядок данных и bounded group span; interactive controls готовы до конца декора | large group/repeated visibility |
| Hold | armed/committed/cancelled, progress во время actual hold | отпускание до threshold и idempotent commit |
| Tabs | selected peer и measured indicator; shared reveal согласует цвет | keyboard/RTL и invalid active |
| Scroll reveal | один intentful reveal, readable content не блокируется | scroll back/reduced motion |
| Drag dismissal | current position, grabOffset, release projection, допустимая цель | короткий flick и повторный захват |
| Programmatic transition | существующий API имеет cancel/time/finish ownership, explicit properties | reverse и cleanup; в MP4 paused seek clock |

Локальный blur может смягчить согласованную surface подмену после исправления geometry, но не скрывать неподвижный текст и не служить причиной тяжелого полноэкранного эффекта. Поддержка GPU/WAAPI зависит от свойств/версии, проверяется локально.

## Устаревшее завершение после перехвата

У каждой settle-анимации есть session/generation id. Новый захват сначала читает текущее положение и скорость, увеличивает generation, отменяет прежний owner и создаёт следующий сегмент. Callback завершения проверяет generation перед изменением state: устаревший callback не возвращает старую цель и не запускает прежний feedback. Отмена очищает listeners/resources. В MP4 callbacks не нужны: активный сегмент выбирается из неизменного журнала по t, каждый кадр восстанавливает state полностью.
