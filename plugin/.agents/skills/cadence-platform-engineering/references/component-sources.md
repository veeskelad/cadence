# Где брать готовые анимированные компоненты для сайта и презентации

Вход: элемент, который нужен человеку (кнопка, карточка, поле ввода, навигация, AI-элемент, анимированный текст), стек проекта и разрешение на новую зависимость. Выход: один выбранный компонент с адресом, лицензией и планом вставки, либо отказ в пользу уже установленного средства ([выбор средства](component-selection.md)).

Каталоги проверены 16.11.2026. Цены и лицензии меняются: перед вставкой открыть страницу компонента и файл LICENSE репозитория заново.

| Каталог | Что там | Формат | Лицензия (проверено) | Как брать |
|---|---|---|---|---|
| [DesignBookmark Motion](https://designbookmark.com/motion) | около 85 живых карточек: кнопки, поля ввода, навигация, карточки, AI-элементы, текст. Около 54 своих (Focus mode, Plan switch, Pull cord, Morph tooltip, Scramble text, Prompt box, Streaming reply) и ссылки на Kokonut UI и SmoothUI | React/TSX + Motion (`motion/react`), Tailwind | у своих карточек лицензии нет ни на странице, ни в terms: только «как есть». Для коммерческого проекта брать как образец поведения и писать свой код, либо брать ту же идею из Kokonut UI или SmoothUI | на карточке кнопки «Copy for Claude» и «Copy code»: человек копирует, агент вставляет и адаптирует под стек |
| [Kokonut UI](https://kokonutui.com) | кнопки (Hold button, Slide to confirm), карточки (Boarding pass, Notification stack), текст (Typewriter), AI (Agent steps) | React + Motion, Tailwind; установка через shadcn CLI: `npx shadcn@latest add @kokonutui/<имя>` | MIT, [LICENSE](https://github.com/kokonut-labs/kokonutui/blob/main/LICENSE). Есть платный Kokonut UI Pro: его компоненты не брать без покупки человеком | установка только с согласия человека, в существующий React-проект |
| [SmoothUI](https://smoothui.dev) | компоненты и поверхности: Siri orb, Unlock Face ID, [ASCII Render](https://smoothui.dev/docs/components/ascii-render) (картинка или видео в ASCII в одном `<pre>`) | React + Motion; `npx smoothui-cli add <имя>` | MIT, [LICENSE](https://github.com/educlopez/smoothui/blob/main/LICENSE) | то же |

## Правила

1. Сначала то, что уже стоит в проекте, и обычный CSS: каталог не повод добавлять зависимость.
2. Сайт и HTML-презентация на React — компонент из каталога с MIT ставится в проект после согласия. Без React (чистый HTML, Keynote, Google Slides) — повторить поведение своим CSS/JS или записать его как видео-вставку через движок Cadence.
3. Компонент нужен в ролике (MP4) — библиотеку в ролик не ставить: поведение повторяется чистой функцией `render(t)` движка (`cadence-motion-behavior`), каталог служит образцом. ASCII-эффект для ролика уже есть в движке: `ascii()` в `engine/lib/looks.js`, рецепт `knowledge/effects-bank/look-ascii-render.md`.
4. Лицензия не подтверждена — компонент не копировать в коммерческий проект: брать идею и писать свой код.
5. В отчёте человеку: имя компонента, адрес, лицензия, что ставится (`npx …`), какие файлы проекта меняются.
