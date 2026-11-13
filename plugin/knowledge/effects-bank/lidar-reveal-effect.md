# LIDAR-развёртка: разбор приёма и промпт под фото

Статус: из гайда, рендером не проверено (четыре прогона генерации дали только переход между двумя роликами)
Маршрут: both
Исполнитель: генерация (вне Cadence, позже) + cadence-motion; кодовый вариант скана — внутри шаблона шоурила, [cadence-showreel](../../skills/cadence-showreel/SKILL.md)
Вход: одно фото с выраженной глубиной (человек, интерьер, улица); дальше — Remotion-переход или Resolve
Цена: платная генерация 1–4 кандидатов + минуты монтажа
Источник: референсный ролик (удалён после разбора) — разбор 16.09.2026 в самом рецепте; промпты проверены прогонами image-to-video

Приём: фотография разбирается на облако точек лазерного сканирования, камера проходит сквозь эту сцену, затем возвращается настоящий цвет, и кадр сходится обратно в исходное фото. Ниже — структура, признаки look, готовые промпты и способы сделать то же самое без внешнего сервиса. Разбор от 16.09.2026, числа получены замером кадров и сигнала.

## Структура: семь секунд

| Доля | Что в кадре |
| --- | --- |
| 0,0–0,5 с | чёрный кадр, поперёк нижней трети — яркая бело-голубая линия сканирования, под ней полоса светящихся точек |
| 0,5–3,0 с | камера идёт низко сквозь сцену; мир собран из бирюзовых точек, вытянутых радиальными штрихами по направлению движения; небо чёрное |
| 3,0–4,7 с | возвращается цвет: сначала главный объект и ближние к нему поверхности, остальное ещё бирюзовое |
| 4,7–7,0 с | обычная фотография: кадр сходится в исходное изображение и держится неподвижно |

Ориентиры по цвету: в точечной фазе насыщенность около 0,94 при почти нулевом красном канале (R 0,02–0,07 против G и B 0,19–0,29) — это и есть монохромная бирюза. Дальше красный растёт до 0,27 и к финалу до 0,48: цвет возвращается не рывком, а за 1,5–2 секунды.

Звук: событие здесь есть, значит и звук нужен — подводка на фронте сканирования, удар в момент возврата цвета, подложка на проходе. Ровная музыка поверх всего эффекта его обесценивает.

## Из чего складывается look

1. **Небо не отражает лазер.** Всё, что выше линии горизонта, — абсолютный чёрный. Это главный признак: любой градиент в небе сразу выдаёт подделку.
2. **Один цвет.** Бирюза от глубокого сине-зелёного до почти белого в самой яркой точке; насыщенность около 0,95, красного канала нет.
3. **Яркость = отражение, а не свет сцены.** Ближние стебли светятся сильнее дальних, глубина читается затуханием.
4. **Точки вытянуты по вектору движения.** Из-за скорости полёта они превращаются в штрихи, направленные от центра кадра — именно это даёт ощущение сканирования, а не «эффекта частиц».
5. **Фронт сканирования** — яркая линия, уходящая от камеры по земле. Появляется первой и задаёт направление.
6. **Цвет возвращается от объекта наружу.** Сначала то, ради чего кадр снят, потом ближние поверхности, потом остальное. Не общий кроссфейд.
7. **Финал совпадает с исходным фото** — вплоть до кадрирования. Приём читается как «фотография собралась из данных».

## Универсальный промпт под любое фото

Для image-to-video: одно фото на вход, вертикаль 720×1280 или 1080×1920, 6–8 секунд. Ничего подставлять не нужно — блоки написаны так, что модель сама читает позу, окружение и глубину с фотографии. Правки делать только в блоке LOOK, если нужен другой тип сканера.

```
LiDAR scan reveal built from this photograph.

LOOK — keep exactly:
The whole scene is rebuilt from dense glowing laser-return points on pure black.
One colour family only: cyan-teal, near-white at the strongest returns, no other
hue until the reveal. Sky, open air and anything beyond range give no return and
stay pure black. Return brightness falls off with distance: near surfaces read
bright, far ones dim. Points elongate into streaks along the direction of camera
travel. A bright scan wavefront runs ahead of the reconstruction.

SCENE — rebuild beyond the frame:
Reconstruct the full space the photograph implies, including ground, surfaces,
structures and objects outside its borders. Keep the same location, time of day,
weather, materials and direction of light as the source. Invent nothing that
contradicts it: no new characters, no different architecture, no props that would
not belong in that place.

SUBJECT — locked:
The subject keeps exactly the pose, body position, clothing and expression of the
source image, whether standing, sitting, lying or in motion. No re-posing, no
walking, no head turn, no blinking, no added gestures. Only the camera moves and
the point cloud resolves.

CAMERA — pick the move that fits this photograph:
Begin away from the subject inside the point cloud and travel to the exact
viewpoint of the source image in one continuous move, no cuts, slight handheld
micro-shake. Descend vertically if the subject is seen from above; push in at eye
level for a standing or seated figure; arc low around a vehicle or object; fly
forward along the road, path or corridor if the scene has deep perspective; and
if the photograph is flat and has almost no depth, keep the camera still and let
the wavefront sweep across the subject instead.

REVEAL:
As the camera arrives, real colour returns from the subject outward — the subject
first, then the surfaces nearest to it, then the rest of the frame — until the
image resolves into the original photograph: identical framing, sharp and
photographic. Hold that final frame for one second.

Vertical 9:16, 6-8 seconds. You may refine wording and add detail that this
specific photograph needs, but keep every rule above intact.
```

Отрицательный промпт:

```
colour in the sky, gradient sky, cross-fade or dissolve transition,
uniform particle effect, sparks, glitter, text, UI, watermark,
morphing face, changed framing at the end, lens flare, rainbow colours
```

Что менять под задачу: цвет возврата (бирюза — как у лидара; фиолетово-розовый — как у ToF-сканера; янтарный — тепловизор), скорость пролёта, порядок возврата цвета, длину финального удержания.

## Вариант с раскадровкой по таймкодам

Часть моделей лучше слушается другого формата, чем универсальный шаблон: shot list с таймкодами, физическое описание движения камеры вместо названий эффектов, перечисление примет внешности и запреты прямо в теле промпта.

```
Rebuild this photograph as a LiDAR point-cloud scan, then let it return to the
original image.

Preserve identity exactly: the subject's face, hair, clothing, colours and pose
stay as in the reference image. The subject does not move, walk, turn the head
or blink. Only the camera moves and the point cloud resolves.

[0-1s] Pure black frame. One bright cyan-white scan line sweeps away from camera
across the ground and leaves a thin band of glowing laser-return points.
[1-3s] The whole scene stands up as dense cyan-teal points on pure black: ground,
plants, surfaces, structures, and the surroundings that continue beyond the edges
of the photograph. Near returns are bright white-cyan, far ones dim. Sky and open
air give no return and stay pure black. Camera pushes in low and fast toward the
subject with subtle handheld shake, points stretching into long radial streaks
along the direction of travel.
[3-4.5s] Real colour returns from the subject outward: the subject first, then the
surfaces nearest to it, then the rest of the frame.
[4.5-6s] The point cloud is gone. The frame is the original photograph again:
identical framing, sharp, photographic, held still.

Camera: one continuous move, no cuts. If the subject is seen from above, descend
vertically instead of pushing in. If the photograph is flat and has no depth, keep
the camera static and let the scan line sweep across the subject.

Sound: low scanning hum rising in pitch, one restrained impact when colour returns,
then silence. Never upbeat, no melody.

No soft dissolves, no cross-fades, no colour in the sky, no sparks or glitter, no
generic particle-effect look, no morphing face, no re-posing, no text or watermark,
no changed framing at the end.
```

Настройки: вход — само фото, формат 9:16, длительность 6 секунд. Если модель принимает конечный кадр, поставить туда то же самое фото — это единственный доступный способ подтянуть финал к оригиналу, хотя совпадения он не гарантирует.

## Если промпт под конкретное фото пишет модель

Промпт не обязательно писать руками: модель со зрением смотрит на фотографию и подставляет в шаблон настоящие объекты кадра. Инструкция для неё:

```
Look at the attached photograph and write the final video prompt for an
image-to-video model, using the LiDAR template below.

Before writing, decide from the photograph: what the subject is and in what
pose; where the camera sits relative to it; how much depth the frame has;
what surroundings beyond the borders have to be rebuilt; which two or three
elements should regain colour first.

Then output only the finished prompt: keep the LOOK, SCENE, SUBJECT and REVEAL
rules intact, leave in the CAMERA block only the single move that fits this
photograph, and replace generic words with the concrete nouns of this scene.
No commentary, no headings.

<шаблон выше>
```

Шаблон остаётся одним файлом, под каждое фото подставляются настоящие объекты кадра — это надёжнее общих формулировок.

Справочно, какое движение к какому кадру подходит:

| Что на фото | Движение камеры в промпте |
| --- | --- |
| герой лежит, снят сверху | `the camera descends vertically toward the subject, the scan wavefront sweeping across the ground plane` |
| герой стоит, съёмка с уровня глаз | `the camera pushes in at eye level and settles on the subject's face` |
| герой стоит, вокруг есть пространство | `the camera arcs a quarter-orbit around the subject at chest height` |
| предмет на поверхности: мотоцикл, техника | `the camera circles the object low, close to the ground, then rises to the source framing` |
| крупный портрет, глубины почти нет | `no camera travel: the scan sweeps top-to-bottom across the face and the cloud rebuilds in place` |
| пейзаж или улица с уходящей перспективой | `the camera flies low and fast along the [road/path] toward the subject` |

**Почему в шаблоне есть замок позы.** Модель по умолчанию оживляет героя: добавляет шаг, поворот головы, моргание — и финальный кадр перестаёт совпадать с исходным фото. Блок SUBJECT это запрещает, убирать его нельзя.

**Чего промпт не спасёт.** Глубину модель считывает из самого фото. Если кадр плоский — портрет в упор, объект на однотонном фоне, съёмка в контровом свете без планов, — точкам нечем показывать расстояние, и вместо сканирования получится шум. Для таких кадров берите вариант «без движения камеры» или снимайте с передним планом.

Годится любой кадр с выраженной глубиной: поле, улица, лестница, мотоцикл на крыше.

## Чем это генерировать

Cadence сам видео не генерирует: генерацию человек делает в любом image-to-video сервисе или модели, которые у него есть, на свой счёт и по своему согласию. Что важно при выборе:

- нужна модель, которая принимает первый и, лучше, последний кадр: так финал ближе к исходному фото;
- **ни одна модель не гарантирует**, что финальный кадр совпадёт с исходным фото: лицо и кадрирование плывут даже с последним кадром. Последние 1,5 секунды надёжнее добрать монтажом, подложив оригинал;
- готовые пресеты с названием «lidar» у сервисов бывают про другое (мир наклоняется вокруг героя) — по названию не ориентироваться, смотреть пример.

**Локально на Mac с Apple Silicon** открытые видео-модели запускаются, но на 5 секунд 720p уходят десятки минут, а управление по глубине в таких сборках не заявлено. В план закладывать не стоит.

**Детерминированный путь.** [Depth Anything 3](https://github.com/bytedance-seed/depth-anything-3) даёт карту глубины, [Image2PCD](https://github.com/Oh-JongJin/Image2PCD) — перевод фото в облако точек, [DepthFlow](https://github.com/BrokenSource/DepthFlow) — параллакс-пролёт, [Point Cloud I/O](https://extensions.blender.org/add-ons/point-cloud-io/) — рендер точек в Blender. Дольше по времени, зато финальный кадр совпадает с исходным по построению и результат повторяется от ролика к ролику. Установка программ — только с согласия человека.

## Как сделать это без чужого сервиса

Локальный путь тот же по смыслу, только глубину считаем сами:

1. Карта глубины из фото — Depth Anything V2 или аналог, на Apple Silicon работает локально.
2. Точки: каждый пиксель выносится в 3D по глубине. В Fusion это `Camera3D` + `Renderer3D`, точки — `pEmitter` по карте глубины; в Blender — Geometry Nodes по той же карте. Готового узла «лидар» в Resolve нет.
3. Полёт камеры внутрь сцены и растяжка точек: `Directional Blur` вдоль вектора движения, сила растёт со скоростью.
4. Фронт сканирования — анимированная маска по глубине (`Depth Map` OFX даёт саму глубину, дальше `Luma Keyer` по порогу).
5. Возврат цвета — микс исходного кадра поверх точечного слоя, маска расширяется от объекта наружу.
6. Звук ставить по событиям: подводка на фронте сканирования, удар в момент возврата цвета, подложка на полёте. Правила — [sound design](../sound/sound-design.md) и [правила SFX в монтаже](../sound/sfx-rules.md).

Честная оценка: генерацией это делается за один запрос, руками в Fusion — работа на несколько часов и результат будет жёстче, но полностью свой и повторяемый.

## Переход между двумя лидар-роликами

Два готовых ролика с этим приёмом связываются третьей генерацией: мир снова осыпается
в точки, камера уходит в абстрактное пространство и влетает в следующую сцену. Разобрано
на четырёх прогонах image-to-video с первым и последним кадром, 2K, 16.09.2026.

**Привязка к двум кадрам работает надёжно.** Первым кадром ставится последний кадр
уходящего ролика, последним — кадр приходящего ролика в его точечной фазе. Во всех
четырёх прогонах модель села на конечный кадр практически точно, и склейка получается
встык, без смаза и обработки. Это главное, ради чего стоит брать модель с поддержкой
first и last frame.

**Режим отказа, который надо предотвращать промптом: провал в чёрное.** Если камера
поворачивает туда, где в промпте ничего не описано, модель заполняет разрыв темнотой.
Замер прогона v4: с 2,6 по 3,5 с средний цвет кадра падает до R4 G6 B7 и затем скачком
возвращается к R24 G50 B52. Формально склейки нет, детектор сцен молчит, но движение
читается как бессмыслица. Диагностируется одной командой:

```
ffmpeg -v error -i <файл> -vf "fps=8,scale=1:1:flags=area,format=rgb24" -f rawvideo -
```

Провал виден по средней яркости; порог тревоги — сумма каналов ниже 30 дольше двух
десятых секунды.

Две меры против него:

1. **Пространственная связка.** Новое пространство должно вырастать из старого, а не
   появляться после поворота. Приём: когда сцена становится точками, её линейные элементы
   (перила, бордюр, край дороги) вытягиваются в длинные светящиеся линии, и камера идёт
   по ним. Повороты делаются уже внутри нового пространства, на ходу. Это прямое
   применение правила из [монтажных переходов](../editing/transitions.md): вход и выход
   движения готовятся с совместимой осью и направлением.
2. **Правило яркости в теле промпта, а не в отрицательном.** Формулировка «кадр не
   темнеет ни в один момент, плотности и яркости точек постоянны» в основном тексте
   срабатывает; тот же запрет в negative prompt модель игнорирует.

**Что ещё выяснилось по формулировкам.**

| Написано в промпте | Что отдаёт модель |
| --- | --- |
| `corridor with walls, floor and ceiling on both sides` | узкий интерьерный коридор квартирного масштаба |
| `flies over a city` | буквальный город с пальмами, проводами и фонарями |
| `abstract corridor of glowing lines, walls far from the lens` | абстракция нужного масштаба |
| `colour drains from the edges inward` | герой конвертируется последним, эффект теряется |
| `the scan begins on the subject and spreads outward` | скан идёт от героя, как и задумано |
| `whips hard`, `at full speed`, `violent` | рваное движение вместо кинематографичного |
| `smooth even gliding sweep, ease-in and ease-out` | плавный ход |
| интерьер в начале маршрута | финал через дверной проём; окна модель не строит |
| маршрут снаружи | влёт через окно получается сам |

**Стекло не отражает лазер.** Окно в облаке точек — чёрный провал в стене, по той же
логике, что небо и открытый воздух. Это даёт бесплатный и физически верный способ войти
в помещение, и он лучше дверного проёма: проём модель рисует как обычную дверь и ломает
абстракцию.

**Число событий.** Шесть бит на шесть секунд модель держит, восемь уже нет: лишние
события она склеивает темнотой. Держать два типа движения — полёт вперёд и доворот — и
не вводить третий.

## Проверка результата

- Небо осталось чёрным, без градиента.
- Ближние объекты ярче дальних.
- Штрихи направлены от центра кадра, а не хаотично.
- Лицо не морфит и не меняет черты при возврате цвета.
- Финальный кадр совпал с исходным фото по кадрированию.
- Событие озвучено: подводка, удар на раскрытии, тишина или подложка между ними.

Связанные приёмы каталога: [Slit-Scan, Projections, Masking](../techniques/in-camera-fx-m-z.md), [Night Vision и Thermal](../techniques/in-camera-fx-m-z.md) — там же колонка о том, что из этого делается в Resolve.
