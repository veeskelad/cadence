# Swift: безопасная модель и проверяемая реализация

Применять только к явно выбранному Swift-проекту. Записать compiler/language mode, deployment target, build flags, isolation settings, modules и доступность API. Не утверждать номер текущего выпуска по сохранённому документу. Новая синтаксическая возможность должна компилироваться целевым toolchain; экспериментальные/unreleased features не включаются автоматически.

## Модель и ошибки

Начать с конкретных struct/enum и let. Class нужен для identity, общего изменяемого состояния или lifetime ресурса. Копия struct с mutable class внутри не даёт независимого значения: immutable storage либо явно реализованный copy-on-write при мутации. Взаимоисключающие состояния обозначить enum с associated values; не собирать их из несогласованных optional/bool. Unique resource может требовать noncopyable/consuming/borrowing, если compiler это поддерживает; проверить ownership всех путей.

Внешний отказ является Error с контекстом; нарушение программистского invariant — precondition с причиной. Guard завершает ошибочную ветвь. Optional unwrap допускается при доказанном invariant, не ради сокращения кода. Typed throws уместен при нужном contract и наличии поддержки, публичная API evolution важнее лишнего ограничения error type.

## Isolation и задачи

Определить who owns state до добавления concurrency. MainActor для UI-состояния; library не получает blanket MainActor только потому, что приложение его использует. Async обозначает suspension, не автоматически background CPU. Поведение nonisolated/async/@concurrent зависит от compiler/settings: проверить его по действующей документации и compilation, а не переносить правило между режимами.

Expensive CPU выделять после профиля. Mutable actor state изменять синхронными транзакционными участками; await оставляет consistent state и требует повторной проверки предположений. Actor serializes access, но не гарантирует FIFO или atomic transaction через await. Для cache загрузки хранить in-flight operation либо recheck после suspension. Не держать lock/semaphore/thread-local assumption через await.

Для фиксированных независимых jobs — async let, для динамических — bounded task group. One end-to-end operation имеет понятный owner/lifetime. Unstructured Task требует cancellation/lifetime policy, detached не является универсальным способом убрать warning. Cancellation cooperative: проверять перед дорогой работой и cleanup на всех путях; cancellation handler может выполняться concurrently, поэтому его shared storage имеет synchronization contract. AsyncStream cleanup в termination; continuation завершить ровно один раз success/failure/cancel, заранее clear stored reference. Task-local context имеет разумное значение при отсутствии binding.

Sendable фиксирует безопасное пересечение isolation. Предпочтения: не делиться mutable объектом → value snapshot → actor ownership → измеренно необходимая synchronization. @unchecked Sendable/nonisolated(unsafe) не средство подавления предупреждения. Public Sendable является API обещанием. Legacy callbacks/SDK migration требуют проверенного actor context; assumeIsolated допускается лишь при доказанном runtime invariant, не вместо hop.

## SwiftUI, generics и API

Вызов жеста синхронно изменяет UI state/animation, длительная операция стартует затем. Closure с Sendable constraint получает необходимые value captures, не весь self. async layer возвращает результат/мутирует seam state, не управляет view напрямую.

Сначала concrete implementation, затем protocol для реальной повторяемой capability. Customizable method является requirement, extension-only method не заменяет dynamic customization. Composition сохраняет узкий контракт. some удерживает один underlying type и specialization; any нужен для heterogeneous storage/erasure. Associated types и same-type constraints сохраняют отношения; consuming associated-type operation через erased existential может требовать generic function. Не создавать protocol hierarchy без независимых вариантов поведения.

Название API объясняет применение, access control отражает boundary, validation не даёт записать незаконное состояние. Wrapper описывает access policy; result builder уместен для DSL; macro — для реально выводимого compiler boilerplate.

## Стоимость и lifetime

Сначала исправить алгоритм: многократное remove/re-slice и промежуточные arrays могут делать линейную задачу квадратичной. Затем профиль Time Profiler/Allocations на представительной операции: copying, ARC, allocations, actor hops, dynamic dispatch. Batch hops и работу вместо задачи на каждый scalar.

Final помогает запрещённому subclassing; homogeneous storage помогает специализации. Большие values с reference fields могут стоить copies/retains — сравнить с CoW, не объявлять struct всегда бесплатным. Existential storage может boxing; использовать только при нужной вариативности. InlineArray/Span и specialization annotations проверять на compiler support и измеренную необходимость. Unsafe buffer нужен только narrow interop/hot path с bounds/lifetime доказательством; pointers не выходят из owning scope; sanitizers подтверждают проверку, не делают UB безопасным.

ARC гарантирует жизнь до последнего use, не закрывающей скобки. Weak/unowned — явная ownership relation, лучше избежать cycle структурой дерева. Не привязывать глобальный эффект к времени deinit; explicit finish/defer описывает завершение. WithExtendedLifetime — адресная компенсация установленного lifetime, не новый общий стиль.

## Исполнимая QA и миграция

```text
Вход: compiler/settings, target и проблема
Модель: состояния, ownership, failure paths
Параллелизм: кто владеет, где suspension и cancel
Правка: минимальный участок и поддерживаемые APIs
Проверка: compile, unit inputs, race/cancel cases, profile при performance цели
Доказательство: команды/результаты и непроверенные device условия
```

Swift Testing использовать для новых value/async tests, если установлен; #expect показывает выражение, #require завершает нужную ветвь, parameterized cases независимы. Suites изолируют state. Known issue не превращать в вечную disabled проверку; traits/availability отражают цель. XCTest остаётся для поддерживаемого UI automation/performance/interop. Parallel tests не должны полагаться на порядок. Callback count/continuation test проверяет ровно одно завершение; crash-contract проверяется отдельно доступным exit-test механизмом.

Macro tests проверяют expansion и diagnostics; неверный input получает ошибку, не незаметный некомпилируемый output. Logging: subsystem/category, correlation id, минимальная нужная severity, privacy персональных interpolations; не логировать raw material/keys. LLDB/Instruments помогают task/lifetime анализу. C/ObjC/C++ interop внедрять по файлу, boundary имеет explicit ownership и ABI compatibility.

Modern syntax (expressions, packs, observation, typed notifications, regex/parsers, subprocess, spans, availability/module selectors) выбирать по compiler и dependency contract, не по модности. Date/currency parsing получает locale; regex bounded, без разрушительного backtracking. Swift migration: новый compiler в прежнем language mode → complete checking по одному target → root warnings → новый language mode → отдельный refactor. Не смешивать массовую архитектуру с включением safety.

## Уточнение языка по toolchain

При наличии поддержки применять if/switch expressions для значения, parameter packs для повторяющихся generic аргументов, Observation для наблюдаемой модели, typed notifications для типизированной доставки, Regex/RegexBuilder и системные date/currency parsers для структуры ввода. AsyncSequence transactional observation, Subprocess package, InlineArray/Span/RawSpan/OutputSpan, specialized/inline attributes, module selectors, raw identifiers тестов, cancellation shield, keyed mapping, unified availability, borrow/mutate accessors и unique storage имеют version/package условия: проверить каждую используемую возможность compiler/types, не переносить future syntax в текущий target. Macro roles (member/peer/accessor/member-attribute/conformance) соответствуют действительно выводимому коду; доступность interop/export attributes и safety diagnostics зависит от settings. Типизированный binary parser предпочтительнее непроверенной ручной pointer арифметики. Устаревшие callbacks мигрируют постепенно с exact-once contract; новые feature не требуют массовой переписки.
