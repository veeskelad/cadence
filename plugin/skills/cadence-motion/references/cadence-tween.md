# Cadence Tween — движок анимации Cadence

Вся анимация на таймлайне в Cadence идёт на Cadence Tween: `engine/lib/cadence-tween.min.js`, собственный движок Cadence
без зависимостей. GSAP в Cadence не используется и в поставку не входит. Блоки, компоненты, карточки и генераторы
модулей переведены на Cadence Tween и сверены с прежними кадрами покадрово.

## Подключение

| Где страница | Тег |
|---|---|
| Проект `engine/build.mjs`, блок или компонент из библиотеки в `compositions/` | `<script src="/lib/cadence-tween.min.js"></script>` (сборка кладёт `lib/` в корень проекта) |
| Самостоятельная страница в корне проекта | `<script src="lib/cadence-tween.min.js"></script>` и копия файла в `lib/` |

В каждом встроенном скрипте композиции первая строка:

```js
var cadence = window.cadence.scope(document);
```

Внутри вложенной композиции HyperFrames даёт скрипту свой `document`, ограниченный этим экземпляром. Через
`scope` селекторы (`"#title"`, `".card"`) и поиск корня идут только внутри своего экземпляра, поэтому один блок
можно поставить в ролик несколько раз.

## Таймлайн и привязка ко времени ролика

```js
var cadence = window.cadence.scope(document);
var tl = cadence.timeline({ paused: true, defaults: { duration: 0.6, ease: "power3.out" } });
tl.from("#title", { y: 40, opacity: 0 }, 0.2)
  .to(".card", { x: 120, stagger: 0.08 }, "<0.1")
  .set("#badge", { autoAlpha: 1 }, 1.4);
cadence.mount("my-composition", tl);
```

`cadence.mount(id, tl)` находит композицию с `data-composition-id="id"` в своём экземпляре, ставит ей
`data-no-timeline` и перематывает таймлайн по событию `hf-seek`: время композиции = время ролика минус `data-start`
композиции и всех её родителей. Таймлайн, собранный позже (после шрифтов или моделей), сразу встаёт на текущее время.
`cadence.timelineOf(id)` возвращает привязанный таймлайн, `cadence.onMount(fn)` вызывает `fn(id, tl, host)` на
каждую привязку.

## Что умеет

- Твины: `to`, `from`, `fromTo`, `set`, `call`, `add` (вложенные таймлайны, метки, функции), `addLabel`.
- Позиция: число, `"<"`, `">"`, `"<0.2"`, `">-0.1"`, `"+=0.5"`, `"-=0.25"`, `"метка"`, `"метка+=0.4"`.
- Свойства: `x`, `y`, `z`, `xPercent`, `yPercent`, `rotation`/`rotate`, `rotationX`/`rotateX`, `rotationY`/`rotateY`,
  `skewX`, `skewY`, `scale`, `scaleX`, `scaleY`, `transformOrigin`, `transformPerspective`, `svgOrigin`. У `x` и `y`
  единица сохраняется: `"50%"` — половина своей ширины, `"20cqw"`, `"5vw"`, `"2em"` пишутся как есть. CSS-свойства
  `translate`, `rotate` и `scale` элемента учитываются вместе с его `transform`. Любые CSS-свойства, в том числе
  цвета, `filter`, `clipPath`, `boxShadow`, проценты и `em`; CSS-переменные `"--glow"`; `attr: {}` для SVG;
  `autoAlpha`; свойства обычных объектов (`{ val: 0 }`); `textContent` со `snap`.
- Значения: относительные `"+=50"`, функции `(i, target, targets) => …`, `keyframes`, `startAt`, `motionPath`
  (`path`, `align`, `alignOrigin`, `autoRotate`, `start`, `end`).
- Разбег: число или `{ each | amount, from: "start" | "center" | "end" | "edges" | индекс, grid, axis, ease }`.
- Повторы: `repeat`, `repeatDelay`, `yoyo`, `yoyoEase`; колбэки `onStart`, `onUpdate`, `onComplete`, `onRepeat`,
  `onReverseComplete`, `tl.eventCallback("onUpdate", fn)`.
- Плавности: `none`, `power1–4`, `sine`, `expo`, `circ`, `back(n)`, `elastic(a, p)`, `bounce`, `steps(n)` с `.in`,
  `.out`, `.inOut`; своя кривая `cadence.customEase("имя", "M0,0 C0.25,0 0.2,1 1,1")`; `cadence.parseEase(...)`.
- Утилиты: `cadence.getProperty`, `cadence.utils.toArray | selector | clamp | interpolate | mapRange | snap | wrap | distribute`.

## Чего нет

Плагинов GSAP (ScrollTrigger, SplitText, Flip, DrawSVG, MorphSVG, Draggable), `quickTo`, `matchMedia`. Текст по
буквам делить своим кодом, обводку рисовать через `strokeDasharray` и `strokeDashoffset`, морфинг — через `attr: { d }`
с одинаковым числом точек.

## Правила детерминизма

Кадр — функция времени: без `requestAnimationFrame`, `setTimeout`, `Date.now()` и `Math.random()` в отрисовке.
`play()` есть только для предпросмотра в браузере, рендер ведёт время сам. Колбэки срабатывают при прохождении точки
в любую сторону, `seek()` их глушит, как и раньше.

При рендере (`engine/build.mjs`, `hyperframes render`, `snapshot`) движок ведёт себя как рантайм HyperFrames:

- перемотка вперёд проходит кадры внутри пересечений твинов на одной цели с общими свойствами, поэтому поздний твин
  берёт стартовое значение, как при обычном проигрывании, даже если воркер начал с середины ролика;
- `translate3d` посреди твина не пишется (`force3D` выключен), слой композитинга не меняет размытие и свечение;
  включить для одного твина — `force3D: true`, для всей страницы — `cadence.config({ force3D: "auto" })`;
- длительность ролика рантайм берёт из `data-duration` корня, а без него — по концам вложенных композиций.
  `cadence.mount` ставит `data-duration` только композиции без вложенных и заменяет заглушки вроде
  `__VIDEO_DURATION__`.

`onUpdate`, повешенный на первый твин, видит значения следующих твинов с прошлого шага. Если отрисовка (canvas,
WebGL, three.js) зависит от всех значений сразу, вешай её на `onUpdate` таймлайна.

`onStart` срабатывает до того, как твин запишет первые значения: элемент в нём ещё в прежнем состоянии. `call()` и
другие мгновенные колбэки в точке срабатывают один раз: при приходе в неё или при уходе. Если перемотка пришла в точку
молча (`seek`), колбэк сработает при уходе. У повторяющегося таймлайна вложенные твины на каждом круге снова получают
`onStart`.

## Версия и лицензия

`engine/lib/cadence-tween.min.js` — собранный файл Cadence Tween, версия и контрольная сумма записаны в
`engine/lib/cadence-tween.version`. Движок под проприетарной лицензией: использовать его можно только в составе
Cadence, править файл, копировать его в другие продукты и разбирать нельзя. Новые версии ставит владелец
командой `bash scripts/sync-tween.sh vX.Y.Z`, ручные правки файла ловит `tests/test_no_gsap.py`.
