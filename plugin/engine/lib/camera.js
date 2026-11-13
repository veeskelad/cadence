// Камера над фото устройства. Мир — кадр при k = 1 (фото, обрезанное по кадру), камера — подобие:
// точка мира p → c + k·R(r)·p. В CSS это `translate(cx, cy) rotate(r) scale(k)` с `transform-origin: 0 0`.
// Видео в HyperFrames обязаны быть прямыми потомками корня, поэтому общего контейнера-камеры нет:
// камера живёт в CSS-переменных корня, и фото, экран, стекло применяют её каждый к себе.

const polar = (k, deg) => [k * Math.cos((deg * Math.PI) / 180), k * Math.sin((deg * Math.PI) / 180)];

export const apply = (C, [x, y]) => {
  const [ar, ai] = polar(C.k, C.r ?? 0);
  return [C.cx + ar * x - ai * y, C.cy + ai * x + ar * y];
};

// План якорем: точка мира `a` стоит в точке кадра `P` при масштабе `k` и повороте `r` (градусы).
export const anchored = (a, P, k, r = 0) => {
  const [x, y] = apply({ k, r, cx: 0, cy: 0 }, a);
  return { k, r, cx: P[0] - x, cy: P[1] - y };
};

// Поджать сдвиг, чтобы фото не отрывалось от краёв кадра (только без поворота).
// world — размер мира при k = 1, frame — размер кадра; обычно они равны.
export function keepInside(C, world, frame = world) {
  if (C.r) throw new Error('keepInside: только для плана без поворота');
  if (C.k * world[0] < frame[0] || C.k * world[1] < frame[1]) throw new Error('keepInside: при таком k фото меньше кадра');
  const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  return { ...C, cx: clampTo(C.cx, frame[0] - C.k * world[0], 0), cy: clampTo(C.cy, frame[1] - C.k * world[1], 0) };
}

// Сколько пикселей фото приходится на пиксель готового кадра при масштабе k.
// Меньше 1 — фото растянуто и мылится; отсюда правило k ≤ 2 для кропа ~3200 px на кадр 1080.
export const photoPxPerFramePx = (cropW, frameW, k) => cropW / (frameW * k);

// Время кадра для ключей `tl.set`: округлять вниз. При округлении вверх ключ срабатывает
// кадром позже, и на 30 fps каждый третий кадр повторяет прошлый.
export const frameTime = (f, fps = 30) => Math.floor((f / fps) * 1e4) / 1e4;

// power3.inOut — та же кривая, что у GSAP.
export const power3InOut = (p) => {
  p = Math.min(1, Math.max(0, p));
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
};

// Вылет кадра с экрана на весь кадр: доля пути w по power3.inOut и скругление углов, которое уходит в 0.
export function flyOut(t, t0, dur = 0.8, radius = 0) {
  const w = power3InOut((t - t0) / dur);
  return { w, radius: radius * (1 - w) };
}
