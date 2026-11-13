# Подбор средства без смены стека

Вход: semantic task, текущие dependencies/lockfile, платформы, accessibility, SSR/client boundary, лицензия, необходимый контроль и разрешение. Выход: одно средство с причиной, план интеграции и QA; если достаточно встроенного API, зависимость не добавляется.

1. Проверить уже установленный компонент и conventions. Рабочий аналог не менять только из-за нового списка рекомендаций.
2. Разделить render-only графику и настоящий UI: экспортируемая карточка не нуждается в dialog focus trap, настоящий dialog нуждается.
3. Сопоставить задачу с возможными средствами ниже. Имена — адреса проверки совместимости, не команда установки и не гарантия актуальной лучшей версии.
4. Для выбранного кандидата проверить API/типы и license локально; при конкретном пробеле — официальную документацию. Описать объём, fallback и cleanup.
5. Установку/обновление выполнять только в разрешённой задаче; provider и renderer contracts сохраняются.

| Потребность | Кандидат при отсутствии подходящего installed средства | Контракт QA |
|---|---|---|
| Dialog/popover/menu/select | Base UI | focus, escape, portal, keyboard, anchor |
| Command palette | cmdk | поиск, shortcuts, keyboard и мгновенная доступность |
| Notification | Sonner | lifecycle/id, root renderer, client execution |
| OTP | input-otp | paste, caret, screen reader, реальные валидные символы |
| Controls параметров | Leva или DialKit | dev-only scope, units/ranges, reset |
| Сложный web spring/layout | Motion | текущая версия, прерывание и current value |
| Числа | NumberFlow | locale, tabular width и верное итоговое значение |
| Text motion | torph | grapheme/RTL, ownership и reading |
| Globe | Cobe | доступность/статический fallback, локальные данные |
| OG/растровая карточка | Satori | шрифты, поддерживаемый CSS и размеры файла |
| Syntax | Shiki | безопасный текст, installed grammars, контраст |
| Stream chart | Liveline | время, сохранение данных и пауза |
| Обычные charts | Recharts | domain, zero/negative, labels и доступность |
| Reorder/drag drop | dnd kit | keyboard reorder, cancel и stable id |
| Большие списки | Virtuoso | measured items, focus, scroll restoration |
| Shared state | Zustand | один owner, selectors, reset/serialization |
| Условные classes | clsx | понятный mapping и отсутствие конфликтов |
| Typed visual variants | cva | конечный набор variants/defaults |
| Theme | next-themes | SSR initial mode, flash, user override |

Для обычной hover/fade достаточно существующего CSS. MP4 использует текущие primitives renderer и чистый render(t); UI-библиотеку нельзя добавить только ради того, что она умеет «красивую анимацию».
