---
name: cadence-notification-state
description: Применяй для уведомлений, loading/success/error, устойчивого обновления сообщений, стека, actions и диагностики установленного notification-компонента; в видео исполняй события сценария без toast timers.
---

# Уведомление как состояние операции

Вход: operationId, состояния, тексты, действия/отмена, completion/error, время чтения, renderer и тема. Выход: state machine одного уведомления, idempotent updates, доступный renderer и проверка жизненного цикла. Прочитать [модель и адаптер](references/notification-contract.md) и совместимость (`knowledge/system/compatibility.md`, от корня выпуска).

Один процесс обновляет один id, повторный render не порождает сообщения. Настоящий интерфейс использует установленный notification API; новый пакет не устанавливать без разрешения. MP4 получает события loading/result/dismiss из сценария и чисто вычисляет stack(t), без promise completion и таймеров во время export.
