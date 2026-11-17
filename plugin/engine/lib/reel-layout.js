// Conservative Reels/TikTok layout. Backgrounds may bleed; text clips to the safe area.
export function safeArea(width, height) {
  const left = Math.ceil(width * 0.06), right = Math.floor(width * 0.82);
  const top = Math.ceil(height * 0.15), bottom = Math.floor(height * 0.75);
  return {left, right, top, bottom, width: right - left, height: bottom - top,
    cx: (left + right) / 2, cy: (top + bottom) / 2};
}

export function fitText(ctx, text, font, size, maxWidth) {
  ctx.font = font(size);
  const measure = () => [...text].reduce((sum, ch) => sum + ctx.measureText(ch).width, 0);
  const width = measure();
  if (width > maxWidth) {
    size = Math.max(1, Math.floor(size * maxWidth / width));
    ctx.font = font(size);
  }
  return {size, width: measure()};
}

// Preserve animated positions and rotations. Only clip text at the UI margins.
// The drawing functions still paint full-bleed backgrounds and abstract decoration.
export function safeShotContext(ctx, area, width, height) {
  return new Proxy(ctx, {
    get(target, key) {
      if (key === 'fillText' || key === 'strokeText') return (...args) => {
        const transform = target.getTransform();
        target.save();
        target.setTransform(1, 0, 0, 1, 0, 0);
        target.beginPath(); target.rect(area.left, area.top, area.width, area.height); target.clip();
        target.setTransform(transform);
        target[key](...args);
        target.restore();
      };
      if (key === 'fillRect') return (x, y, w, h) => {
        if (x === area.left && y === area.top && w === area.width && h === area.height) {
          const transform = target.getTransform();
          target.save(); target.setTransform(1, 0, 0, 1, 0, 0);
          target.fillRect(0, 0, width, height); target.restore();
          target.setTransform(transform);
        } else target.fillRect(x, y, w, h);
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, key, value) { return Reflect.set(target, key, value, target); },
  });
}
