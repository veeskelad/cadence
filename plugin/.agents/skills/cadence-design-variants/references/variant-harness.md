# Варианты и переключатель

```text
brief: один результат и контекст
constraints: content, pack, bounds, accessibility, runtime
variants[{id,name,axis,decision,tradeoff,entryPoint}]
selectedId, replayGeneration, testDataId, currentTime
```

Выбрать достаточное число вариантов по запросу, не заполнять набор слабой копией. Каждый включает реальные взаимодействия для UI или исполнимую сцену для видео; одинаковые содержание, масштаб и окружающий контекст позволяют честное сравнение. Новые palette/curve параметры записываются в scene spec, не незаконными полями pack.

Harness живёт в work/prototype scope, production не импортирует его. Один вариант отображается целиком, picker расположен вне существенного содержания и может перемещаться при конфликте. Использовать нейтральные собственные controls, не переносить чужой HTML/CSS. Exactly one selection с accessible label/selected indication; URL может хранить validated variant id. Click/keyboard переключают мгновенно; shortcuts не перехватываются в editing fields или при modifiers. Replay сбрасывает вариант и seek-time по явному событию, не запускает независимый export clock. Пропавший id возвращается к существующему default, индекс вне bounds не рендерится.

QA: все варианты достижимы, реальные действия работают, console проверена, replay/resize не ломают layout, URL reload восстанавливает валидный выбор. Сравнивать в полном масштабе и нужном кропе; thumbnails не являются доказательством читаемости. На каждый вариант: какая ось, где выигрывает, цена/ограничение. После выбора интегрировать только выбранное решение в разрешённой области; temporary harness убрать или сохранить по задаче. User media не удаляется вместе с prototype.
