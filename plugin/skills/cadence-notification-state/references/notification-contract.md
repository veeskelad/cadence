# Модель уведомления и адаптер

```text
id, destination, kind, title, description, icon
actions[{label, execute, dismissPolicy}], secondaryAction
createdAt, readBudget, dismissible, persistent
status: pending | success | error | info | warning | dismissed
appearance: tokens, class mapping, position, offsets, direction
callbacks: userDismiss, autoClose, operationResult
```

Pending не превращается в success по окончании анимации. Promise must settle; ошибка имеет ясное сообщение. Update сохраняет id и меняет только поставленные поля; cancellation/finished guard предотвращает позднее «успешно» после отмены. Persistent имеет visible dismissal/next action, если операция допускает. Secondary message не становится modal confirmation.

Renderer монтируется в стабильном root; один default target. В нескольких областях все renderer имеют id, сообщение имеет destination. Client event создаёт сообщение; server operation возвращает результат клиенту. Позиция учитывает safe insets и layer contract, не случайно огромный z-index внутри clipped parent. Hidden tab и повторное mounting не должны создавать duplicates.

## Установленный Sonner

Проверить экспортируемые types/API текущего пакета. Один Toaster обслуживает client toast() calls. Kind отображается через typed success/error/info/warning; loading либо управляется id, либо toast.promise с результатными functions. toast.custom отдаёт собственный shell, сохраняя поведение installed stack. dismiss(id) завершает один, dismiss() все; useSonner/getActiveToasts дают наблюдение, не ещё один owner.

Параметры адаптера: theme (system либо реально разрешённая тема), richColors/invert, expand/visibleToasts, position, offset/mobileOffset, swipeDirections, dir/hotkey, gap/icons, id; общие toastOptions и per-message overrides. Данные сообщения: description, duration/persistence, dismissible, closeButton, icon, action/cancel, id/toasterId, testId, style/classNames/unstyled, callbacks onDismiss/onAutoClose, containerAriaLabel. Не считать defaults установленной версии неизменными; существенные значения задать явно после проверки API.

Action может закрыть сообщение автоматически; если продолжение должно оставаться, использовать поддерживаемый prevent-dismiss contract. JSX/function output безопасен по границе данных; текст человека не вставляется raw HTML. Headless shell подходит сложному брендированию лучше цепочки !important. Небольшой override начать с supported options, затем style/class mapping; не переписывать библиотечный source. Stylesheet и Shadow DOM требуют фактического scope: поддерживаемый импорт/изолированный stylesheet по текущей сборке.

## Диагностика и QA

| Симптом | Проверка |
|---|---|
| Ничего нет | root renderer mounted, client boundary, правильный target |
| Дубликат | два renderer, repeated effect/event, стабильный operation id |
| Loading бесконечен | promise не завершён, persistence либо запрещённое dismissal |
| За overlay | stacking context/overflow родителей; portal/root layering |
| Тема/цвет не меняется | resolved theme не передана, explicit semantic color options |
| Класс проигрывает | specificity/injected styles; использовать supported unstyled/headless |
| Styles исчезли | import/lifecycle/styles scope при navigation или Shadow DOM |
| Swipe неверен | position и разрешённые направления; alternate close action |
| Сообщение всюду | destination отсутствует при multiple renderer |

Проверить update, resolve/reject, cancel, user vs auto dismissal, keyboard focus, reduced-motion, темы и narrow container. UI проверка требует реального запуска, видео — MP4 и seek consistency. Никакой toast API не подтверждает выполнение реальной операции сам по себе.

## Повторная попытка и поздний ответ

Операция имеет стабильный operationId, каждая попытка — новый attemptId. Сообщение может сохранять прежний notification id, но принимает result/update только для активного attemptId и незавершённой операции. Поздний ответ отменённой или предыдущей попытки не заменяет текущий успех/ошибку. Различать loading, error и successful-empty: ошибка не является нулевым результатом данных. Cancel завершает попытку, не доказывает success. В MP4 попытки и исходы заранее записаны в event journal; история seek не запускает network/Promise.
