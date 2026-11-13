// Время ролика о продукте: набор текста, нормы чтения, сетка долей.
// Одни и те же числа двигают картинку и ставят звук, поэтому сценарий времени живёт в одном месте.
// Всё — чистые функции: кадр в момент t считается заново (см. motion.js).
//
//   import {typing, typedAt, readSec, assertReadable, beatGrid, snapToGrid} from './lib/timing-kit.js';

// Нормы чтения: ≈0,3 с на слово, фраза — не меньше 1,2 с, одно слово-метка — ≈0,8 с.
export const READ = {perWord: 0.3, minPhrase: 1.2, label: 0.8};
// Набор текста: 16–18 знаков в секунду читается спокойно, быстрее 30 — мелькание.
export const TYPE_CPS = 17;

const r3 = (x) => Math.round(x * 1000) / 1000;

// Набор text за отрезок [t0, t1]: время появления каждого знака, равномерно.
// Без t1 длина берётся из скорости cps.
export function typing(text, t0, t1 = null, cps = TYPE_CPS) {
  const chars = [...String(text)];
  const n = Math.max(1, chars.length);
  const end = t1 ?? t0 + n / cps;
  const step = (end - t0) / n;
  return {text: String(text), t0, t1: end, cps: Math.round((n / (end - t0)) * 10) / 10,
    chars: chars.map((_, i) => r3(t0 + (i + 1) * step))};
}

// Какая часть строки уже набрана к моменту t.
export function typedAt(ty, t) {
  let k = 0;
  while (k < ty.chars.length && ty.chars[k] <= t) k++;
  return [...ty.text].slice(0, k).join('');
}

// Сколько секунд текст должен стоять на экране, чтобы его успели прочитать.
export function readSec(text, norms = READ) {
  const {perWord, minPhrase, label} = {...READ, ...norms};
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  if (words <= 1) return label;
  return r3(Math.max(minPhrase, words * perWord));
}

// Сборка падает, если текст держится меньше нормы. items: [{id, text, shown: [встал, начал уходить]}].
// slack — допустимый недобор: 0,15 — на 15 % короче, когда подпись повторяет картинку.
export function assertReadable(items, {slack = 0.15, norms = READ} = {}) {
  const bad = items
    .map((it) => ({...it, need: readSec(it.text, norms), have: it.shown[1] - it.shown[0]}))
    .filter((it) => it.have < it.need * (1 - slack));
  if (bad.length) {
    throw new Error('Текст не успеть прочитать:\n' + bad.map((b) =>
      `  ${b.id}: держится ${b.have.toFixed(2)} с, нужно от ${b.need.toFixed(2)} с — «${b.text}»`).join('\n'));
  }
  return items.length;
}

// Доли трека → время ролика. Ролик начинается с offset секунды трека: доля c встаёт в c − offset.
export function beatGrid(beats, offset = 0, duration = Infinity) {
  return beats.map((c) => Math.round((c - offset) * 100) / 100).filter((t) => t >= 0 && t <= duration);
}

// Ближайшая доля (half — и полудоля) к моменту t: смены и удары ставятся на сетку.
export function snapToGrid(t, grid, half = false) {
  const g = half ? grid.flatMap((b, i) => (i + 1 < grid.length ? [b, Math.round(((b + grid[i + 1]) / 2) * 100) / 100] : [b])) : grid;
  return g.reduce((best, b) => (Math.abs(b - t) < Math.abs(best - t) ? b : best), g[0]);
}

// Касание: палец входит из-за кадра, нажатие и событие экрана — в один кадр.
// Возвращает {visible, travel 0→1 (подлёт), press 0→1→0 (вдавливание)} для момента t.
export function touchAt(t, {enter, press, leave, travel = 0.35, hold = 0.12}) {
  if (t < enter || t > leave) return {visible: false, travel: 0, press: 0};
  const u = Math.min(1, Math.max(0, (t - (press - travel)) / travel));
  const k = t < press ? 0 : t < press + hold ? 1 : Math.max(0, 1 - (t - press - hold) / hold);
  return {visible: true, travel: 1 - Math.pow(1 - u, 3), press: k};
}
