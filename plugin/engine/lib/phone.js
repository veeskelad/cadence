// Телефон в реальных пропорциях, нарисованный кодом, — когда своей PNG-рамки нет.
// Размеры в точках экрана большого современного телефона: корпус 471 × 986, экран 440 × 956, скругление 62.
// Слишком широкий «мокап» зритель сразу считывает как ненастоящий.
//
//   import {PHONE, phoneLayout, phoneFrame} from './lib/phone.js';
//   const L = phoneLayout(1080, 1920, {scale: 1.3, top: 478});
//   const {holder, screen} = phoneFrame(document.querySelector('#root'), L);   // своё содержимое — в screen

export const PHONE = {body: [471, 986], screen: [440, 956], radius: 62, bezel: 15.5, island: [126, 37]};

// Место телефона в кадре W×H: по центру, сверху отступ top (без него — по центру по высоте).
export function phoneLayout(W, H, {scale = 1.3, top = null, centerX = W / 2} = {}) {
  const [bw, bh] = PHONE.body, [sw, sh] = PHONE.screen;
  const width = bw * scale, height = bh * scale;
  const x = centerX - width / 2, y = top ?? (H - height) / 2;
  const sx = x + ((bw - sw) / 2) * scale, sy = y + ((bh - sh) / 2) * scale;
  return {scale, x, y, width, height,
    screen: {x: sx, y: sy, width: sw * scale, height: sh * scale, radius: (PHONE.radius - PHONE.bezel) * scale},
    radius: PHONE.radius * scale};
}

// DOM-рамка: корпус, экран с вырезом под камеру. Двигать и масштабировать — transform у holder в render(t).
export function phoneFrame(parent, L, {body = '#111', edge = '#2a2a2a', glass = '#000'} = {}) {
  const el = (tag, css, into) => {
    const n = document.createElement(tag);
    Object.assign(n.style, css);
    into.appendChild(n);
    return n;
  };
  const holder = el('div', {position: 'absolute', left: `${L.x}px`, top: `${L.y}px`, width: `${L.width}px`,
    height: `${L.height}px`, borderRadius: `${L.radius}px`, background: body,
    boxShadow: `inset 0 0 0 ${2 * L.scale}px ${edge}, 0 ${40 * L.scale}px ${70 * L.scale}px rgba(0,0,0,.28)`}, parent);
  const s = L.screen;
  const screen = el('div', {position: 'absolute', left: `${s.x - L.x}px`, top: `${s.y - L.y}px`, width: `${s.width}px`,
    height: `${s.height}px`, borderRadius: `${s.radius}px`, overflow: 'hidden', background: glass}, holder);
  const [iw, ih] = PHONE.island;
  el('div', {position: 'absolute', left: `${(s.width - iw * L.scale) / 2}px`, top: `${11 * L.scale}px`,
    width: `${iw * L.scale}px`, height: `${ih * L.scale}px`, borderRadius: `${(ih / 2) * L.scale}px`,
    background: '#000', zIndex: 10}, screen);
  return {holder, screen};
}
