// Browser side of a composition bundle: mounts the chosen composition into #app and redraws it on every hf-seek.
// build.mjs puts this module in front of the composition entry; frame.tsx render() calls __HF_MOUNT__.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Frame, type CompositionSpec, type VideoConfig} from '@cadence/frame';

type HfWindow = Window & {__HF_MOUNT__?: (spec: CompositionSpec, id: string) => void; __HF_PRELOAD__?: string[]; __hfThreeTime?: number};
const w = window as HfWindow;

w.__HF_MOUNT__ = (spec, id) => {
  const cfg: VideoConfig = {id, fps: spec.fps, width: spec.width, height: spec.height, durationInFrames: spec.durationInFrames, defaultProps: spec.props ?? {}, props: spec.props ?? {}};

  // Every image the composition shows was found at build time; loading them here, before the first frame,
  // makes the engine wait for them (it waits for every <img> on the page) and keeps them decoded in memory.
  const box = document.getElementById('hf-preload');
  for (const src of w.__HF_PRELOAD__ ?? []) {
    const img = document.createElement('img');
    img.decoding = 'sync';
    img.src = src;
    box?.appendChild(img);
  }
  // Fonts: ask for every face up front (Latin and Cyrillic), so text never falls back to a serif on its first frame.
  for (const f of spec.fonts ?? []) {
    document.fonts.load(`${f.style ?? 'normal'} ${f.weight ?? '400'} 64px "${f.family}"`, 'AaZz09 АаЯяЁё').catch(() => undefined);
  }

  const el = document.getElementById('app');
  if (!el) throw new Error('#app is missing');
  const root = createRoot(el);
  const last = Math.max(0, cfg.durationInFrames - 1);
  const draw = (t: number) => {
    // Frame of the composition: rounding, so float error never lands on the previous frame.
    const frame = Math.min(last, Math.max(0, Math.round(t * cfg.fps)));
    flushSync(() => root.render(<Frame cfg={cfg} frame={frame} Component={spec.component} />));
  };
  window.addEventListener('hf-seek', (e) => draw(Number((e as CustomEvent<{time: number}>).detail?.time) || 0));
  draw(w.__hfThreeTime || 0);
};
