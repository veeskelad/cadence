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
