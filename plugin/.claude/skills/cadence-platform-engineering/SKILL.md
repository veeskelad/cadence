---
name: cadence-platform-engineering
description: Применяй только при явно выбранной разработке mobile web/PWA, Expo/React Native, Swift или при воспроизведении их поведения в сцене; не включай платформенные зависимости в обычный ролик.
---

# Платформенная реализация

Вход: конкретная платформа, доступный исходный проект, установленная версия SDK/compiler, support matrix, задача и разрешения. Выход: реализация под действующий API и отчёт проверки; для изображения интерфейса в MP4 — только сценарная модель через cadence-motion-behavior.

Прочитать совместимость (`knowledge/system/compatibility.md`, от корня выпуска), затем одну нужную область: [mobile web](references/mobile-web.md), [native/Expo](references/native-expo.md), [Swift](references/swift-engineering.md). Для компонента проверить [выбор средства](references/component-selection.md), не исполнять установку по наличию строки в каталоге. Сначала существующий стек и tokens, затем разрешённая новая зависимость.

Сведения о версиях брать из lockfile, installed types, compiler и project settings. При конкретной несовместимости допустим поиск официальной документации; не считать сведения из сохранённой инструкции актуальной гарантией SDK. UI events не заменяют clock видео, платформенные system fonts не заменяют бренд-пак. Не менять public release и не запускать новую площадку публикации.
