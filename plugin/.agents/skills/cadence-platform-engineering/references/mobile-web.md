# Mobile web и PWA

Контракт: доступные input capabilities, viewport/keyboard, scroll ownership, контент и controls, темы, safe insets, размеры текста. Не определять touch по user-agent: мышь и touch могут сосуществовать. Для MP4 фиксированные W/H и рабочие поля площадки имеют приоритет; env() браузера не знает интерфейс социальной сети.

## Решения по симптомам

| Симптом | Исполнимая правка | Проверка |
|---|---|---|
| Hover остаётся после tap | Ограничить hover capability-query; сохранить active/focus feedback | touch, mouse, keyboard; действие не зависит от hover |
| Браузерный flash конфликтует с feedback | Изменить tap highlight только при собственном видимом press-state | первое касание понятно даже без звука |
| Нижний control закрывает URL bar | app shell следует dvh; стабильная первая страница может использовать svh; fallback по support matrix | открытая/закрытая browser chrome, landscape |
| Input приближает страницу | Проверить фактический размер input; mobile-font не мельче 16 CSS px, не запрещать zoom | focus/blur и увеличенный текст |
| Запоздалый tap | pointer-down/active даёт feedback; semantic action после release; touch-action manipulation только controls | cancel и отсутствие дублирующего события |
| Scroll цепляет фон/refresh | Для вложенного app scroll использовать overscroll containment; root suppression только там, где app владеет областью | край списка, drawer, обычный document |
| Notch закрывает controls | viewport-fit=cover и env safe-area padding с fallback; layout учитывает реальные inset | device/standalone и rotate |
| Long press выбирает label | user-select отключён только на controls, содержимое копируется | адрес/error по-прежнему выделяются |
| Pan конфликтует со scroll | Browser сохраняет pan-y при custom horizontal gesture; обратная ось для vertical handle; none только полной gesture-surface | диагональный жест и scroll мимо элемента |
| Carousel обычного scroll | Использовать native scrolling/snap, если хватает задачи, без собственного физического движка | первая/последняя карточка, keyboard, RTL |
| Тема chrome отличается | theme-color соответствует реальному верхнему фону, меняется с режимом; manifest/status bar только для заданного PWA | light/dark и пользовательская тема |
| Keyboard закрывает composer | Viewport/visual viewport и keyboard layout проверить в установленном browser; не рассчитывать независимый timer | ввод, rotation и возврат высоты |

Поле получает смысловую клавиатуру: type/inputmode, enterkeyhint; username/code без ненужного autocapitalization/autocorrect. Browser zoom и масштабирование текста сохраняются. Не блокировать все touchmove ради одной панели.

## Рецепт проверки

1. Прочитать реальную страницу и найти кто владеет scroll/viewport.
2. Применить только строки, объясняющие наблюдаемый симптом; не вставлять общий reset без анализа.
3. Проверить контейнер, темы, focus, увеличенный текст и смешанный pointer.
4. На доступном устройстве проверить chrome, keyboard, overscroll, notch, orientation, long press; installed PWA отдельно, если это цель.
5. Записать проверенные условия. Эмуляция помогает geometry, но не подтверждает ощущения и все повадки устройства.
