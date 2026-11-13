// Прямоугольник W×H → четырёхугольник на фото (corner pin) для CSS `matrix3d`.
// Чистые функции: работают и в композиции (сборка копирует engine/lib в build/lib), и в Node.
//
// quad — четыре угла в пикселях фото или кадра, порядок всегда один:
//   [левый верх, правый верх, правый низ, левый низ].
// Элемент, к которому применяется матрица, стоит в (0, 0) с `transform-origin: 0 0`.

// Проверка четырёхугольника: четыре конечные точки, выпуклый, обход по часовой стрелке
// в экранных координатах (y вниз). Возвращает список ошибок; пустой список — всё хорошо.
export function quadProblems(quad) {
  if (!Array.isArray(quad) || quad.length !== 4) return ['нужно ровно 4 угла'];
  const bad = [];
  quad.forEach((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) bad.push(`угол ${i + 1}: нужна пара чисел [x, y]`);
  });
  if (bad.length) return bad;
  for (let i = 0; i < 4; i++) {
    const [a, b, c] = [quad[i], quad[(i + 1) % 4], quad[(i + 2) % 4]];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (!(cross > 1e-6)) {
      bad.push('углы не образуют выпуклый четырёхугольник в порядке «левый верх, правый верх, правый низ, левый низ»');
      break;
    }
  }
  return bad;
}

function assertQuad(quad) {
  const bad = quadProblems(quad);
  if (bad.length) throw new Error(`quad: ${bad.join('; ')}`);
}

// Матрица 4×4 по столбцам, как её ждёт CSS matrix3d.
// Единичный квадрат → четырёхугольник (проективное отображение), затем деление на размер источника.
export function quadMatrix(W, H, quad) {
  assertQuad(quad);
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  let a = x1 - x0 + g * x1, b = x3 - x0 + h * x3;
  let d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
  a /= W; d /= W; g /= W;
  b /= H; e /= H; h /= H;
  return [a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, x0, y0, 0, 1];
}

export const quadMatrix3d = (W, H, quad) =>
  `matrix3d(${quadMatrix(W, H, quad).map((v) => +v.toFixed(9)).join(',')})`;

// Куда попадает точка (x, y) источника W×H после матрицы. Нужна для проверки углов,
// для расширения вклейки (overscan) и для углов кадра на экране перед вылетом.
export function project(W, H, quad, x, y) {
  const [a, d, , g, b, e, , h, , , , , c, f] = quadMatrix(W, H, quad);
  const w = g * x + h * y + 1;
  return [(a * x + b * y + c) / w, (d * x + e * y + f) / w];
}

// Четырёхугольник для вклейки, которая заходит на рамку на `o` пикселей источника с каждой стороны:
// по краю экрана тогда не просвечивает то, что было на фото.
export const overscanQuad = (W, H, quad, o) =>
  [[-o, -o], [W + o, -o], [W + o, H + o], [-o, H + o]].map(([x, y]) => project(W, H, quad, x, y));

// Углы с фото → в пиксели кадра. crop = [x, y, ширина, высота] — кусок фото, который при k = 1
// занимает весь кадр шириной frameW.
export function photoToFrame(quad, crop, frameW) {
  const [cx, cy, cw] = crop;
  const s = frameW / cw;
  return quad.map(([x, y]) => [(x - cx) * s, (y - cy) * s]);
}

// Линейное смешение двух четырёхугольников (вылет кадра с экрана на весь кадр).
export const lerpQuad = (q0, q1, w) => q0.map((p, i) => [p[0] + (q1[i][0] - p[0]) * w, p[1] + (q1[i][1] - p[1]) * w]);
