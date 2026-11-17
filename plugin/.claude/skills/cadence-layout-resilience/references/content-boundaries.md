# Границы данных и проверки

Таблица входа: field · source · type · validation limit/unbounded · optional · display rule. Проверить также count, timestamp, badge, label, tooltip, list length, avatar и permissions. Schema и backend limits могут различаться; указать, откуда пришла реальная граница. Проверочные примеры правдоподобны и синтетические, без адресов реальных людей.

| Область | Fixtures | Исполнимое решение |
|---|---|---|
| Имена | длинное составное, один символ, particles/suffix, repeated spaces, диакритика, CJK/RTL, emoji/ZWJ, отсутствует | grapheme-aware processing; fallback не из половины surrogate; full identity readable |
| Идентификатор | короткий/длинный email на example.test, +tag, subdomain, URL/query, UUID, длинный path/file/version | breaking boundary, middle truncation когда конец различает; полный адрес доступен отдельно |
| Labels/text | длинный перевод/compound, много tags, пустой/whitespace, newline, большой абзац, literal markup | encode как текст; wrap/clamp по роли, не raw HTML; essential labels не пропадают |
| Числа | 0/1, крупное, отрицательное, дробь, floating noise, null/NaN, % вне range, переход digit count | Intl formatting, plural rules, tabular digits; domain validation; не обрезать сравнимое число |
| Collections | пусто, один, limit/limit+1, много, несоразмерный item, одинаковые names | explicit empty/identity, pagination/virtualization UI; MP4 только смысловое число объектов |
| Время | сейчас/будущее/далёкое, zero sentinel, timezone border, длинная длительность | explicit timezone и Intl formatting; invalid timestamp не показывать реальной датой |
| Media | missing/error, очень широкий/высокий, transparent/lowcontrast, slow load | bounds/aspect predeclared, fit rule, fallback, loading не меняет финальный layout |
| State | loading/error/partial/all statuses/no permission/current user | explicit state, actions не исчезают случайно, техническая ошибка не raw stacktrace |
| Environment | реальный narrow container, wide, large text/zoom, theme, RTL, touch, orientation | responsive bounds, capability-based action, supported contexts test matrix |

## Правки layout

Flex/grid text column разрешает shrink через min-width:0/minmax(0,1fr); avatar/action сохраняют необходимый размер. Long identifier получает overflow-wrap при необходимости, не break-all всех heading. Multi-line rows align осмысленно; fixed height не режет glyph. Badge либо nowrap с местом, либо специально выбранное wrapping — не вытесняет action. Content-width buttons выдерживают перевод. Numbers/dates comparisons не truncate. Secondary preview может clamp с доступом к полному; в видео essential value должно быть прочитано без hover tooltip.

Инициалы строятся из grapheme clusters и выбранных частей имени с fallback; нельзя угадать cultural naming rule по пробелу. Optional отсутствует без orphan separator. Plural/number/date форматирование по locale. Media ошибки не создают broken icon; source colors/identity сохраняются, изображения не искажаются. Большой list проверяет memory/layout cost; web virtualization не оправдывает замену тысячи записей тысячей unreadable cards в ролике.

## Порядок проверки

1. Составить полный field map, выбрать релевантные fixtures и пределы.
2. Через props/fixture/API stub подать normal, boundary, empty, single; runtime data не менять вручную в DOM.
3. Просмотреть реальный container и требуемые themes/directions/scale. Локальный dev selector может хранить validated data-case URL; switching instant, controls вне результата.
4. Зафиксировать место, input, symptom, cause, minimal fix и уровень проверки. Не объявлять inferred CSS risk увиденным screenshot.
5. Исправить разрешённые дефекты; повторить normal и boundary, сохранить fixtures по текущим project conventions.

Для MP4 before/after, graph и counters получают реальные данные, не worst-case production fiction. Проверить captions/CTA и существенное в safe area, UI-overlay и cover crops. Всё подготовить до seek, zero-duration событие не раскрывать заранее, random seed сохранять. Экспортная проверка размеров/SAR/DAR/rotation и реальных кадров остаётся существующим процессом.
