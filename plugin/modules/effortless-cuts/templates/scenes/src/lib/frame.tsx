// Frame runtime for React compositions rendered by the Cadence engine (HyperFrames).
//
// A composition is a React tree that is a pure function of the frame number. HyperFrames sends `hf-seek`
// with a time in seconds; render() turns it into a frame, re-renders the tree synchronously (flushSync) and
// the engine captures the page. No animation library and no timeline object: every value is computed from
// the frame, so frames can be rendered in any order and on several workers.
//
// What this file gives a composition:
//   time      useCurrentFrame, useVideoConfig, Sequence, Series, Loop, Freeze, TransitionSeries + linearTiming
//   math      interpolate, spring, measureSpring, Easing, random
//   media     staticFile, Img, OffthreadVideo (alias Video), fitText
//   lifecycle delayRender / continueRender / cancelRender (kept for old call sites; the build preloads assets)
//   entry     render({id: {component, fps, width, height, durationInFrames, props, fonts}})
//
// Video: HyperFrames reads <video> tags from the static index.html and swaps in pre-extracted frames. build.mjs
// finds every OffthreadVideo by rendering the tree in Node at every Sequence start (discovery mode below) and
// writes one static <video data-hf-key> per use into #root (parked in a hidden box). In the browser, OffthreadVideo
// moves that video into its own place in the layout while it is mounted and parks it again when it unmounts.
import React, {createContext, useContext, useLayoutEffect, useRef} from 'react';

// ---------------------------------------------------------------- timeline context

export type VideoConfig = {
  id: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  defaultProps: Record<string, unknown>;
  props: Record<string, unknown>;
};
// inSequence: inside a Sequence/Loop, whose length useVideoConfig reports instead of the composition's.
type Timeline = {frame: number; offset: number; duration: number; loop: number | null; inSequence: boolean};

const ConfigContext = createContext<VideoConfig | null>(null);
const TimelineContext = createContext<Timeline>({frame: 0, offset: 0, duration: Infinity, loop: null, inSequence: false});

/** Frame number inside the current Sequence (0 at its start). */
export const useCurrentFrame = (): number => useContext(TimelineContext).frame;

/** fps, size and duration. Inside a Sequence with a length, durationInFrames is that length. */
export const useVideoConfig = (): VideoConfig => {
  const cfg = useContext(ConfigContext);
  const tl = useContext(TimelineContext);
  if (!cfg) throw new Error('useVideoConfig() outside a composition');
  return tl.inSequence && Number.isFinite(tl.duration) ? {...cfg, durationInFrames: tl.duration} : cfg;
};

// ---------------------------------------------------------------- discovery (Node, build time)

type Discovery = {
  starts: Set<number>;
  videos: Map<string, VideoUse>;
};
export type VideoUse = {key: string; src: string; startFrame: number; durationFrames: number; mediaStartFrame: number; playbackRate: number; loop: boolean; volume: number};
const discovery = (): Discovery | null => (globalThis as {__HF_DISCOVERY__?: Discovery}).__HF_DISCOVERY__ ?? null;
const markStart = (absFrame: number) => {
  const d = discovery();
  if (d && Number.isFinite(absFrame) && absFrame >= 0) d.starts.add(Math.round(absFrame));
};

// ---------------------------------------------------------------- layout

type FillProps = React.HTMLAttributes<HTMLDivElement> & {style?: React.CSSProperties};
const FILL: React.CSSProperties = {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column'};

export const AbsoluteFill = React.forwardRef<HTMLDivElement, FillProps>(({style, ...rest}, ref) => (
  <div ref={ref} {...rest} style={{...FILL, ...style}} />
));
AbsoluteFill.displayName = 'AbsoluteFill';

// ---------------------------------------------------------------- Sequence, Series, Loop, Freeze

type SequenceProps = {
  from?: number;
  durationInFrames?: number;
  layout?: 'absolute-fill' | 'none';
  style?: React.CSSProperties;
  className?: string;
  name?: string;
  children?: React.ReactNode;
  // accepted and ignored: editor-only options of older compositions
  showInTimeline?: boolean;
  premountFor?: number;
  width?: number;
  height?: number;
};

/** Children appear for `durationInFrames` frames starting at `from`, and see frame 0 at `from`. */
export const Sequence: React.FC<SequenceProps> = ({from = 0, durationInFrames = Infinity, layout = 'absolute-fill', style, className, children}) => {
  const parent = useContext(TimelineContext);
  markStart(parent.offset + from);
  if (Number.isFinite(durationInFrames)) markStart(parent.offset + from + durationInFrames);
  const local = parent.frame - from;
  if (local < 0 || local >= durationInFrames) return null;
  const duration = Math.min(durationInFrames, parent.duration - from);
  const value: Timeline = {frame: local, offset: parent.offset + from, duration, loop: parent.loop, inSequence: true};
  const inner = <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
  return layout === 'none' ? inner : <AbsoluteFill style={style} className={className}>{inner}</AbsoluteFill>;
};

type SeriesItemProps = {durationInFrames: number; offset?: number; layout?: 'absolute-fill' | 'none'; style?: React.CSSProperties; className?: string; name?: string; children?: React.ReactNode};
const SeriesItem: React.FC<SeriesItemProps> = () => null;

const flatten = (children: React.ReactNode): React.ReactElement[] => {
  const out: React.ReactElement[] = [];
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return;
    if (c.type === React.Fragment) out.push(...flatten((c.props as {children?: React.ReactNode}).children));
    else out.push(c);
  });
  return out;
};

/** Children are <Series.Sequence durationInFrames> blocks, played one after another (offset shifts a block and the rest). */
export const Series: React.FC<{children?: React.ReactNode}> & {Sequence: typeof SeriesItem} = Object.assign(
  ({children}: {children?: React.ReactNode}) => {
    let at = 0;
    const items = flatten(children).map((el, i) => {
      const p = el.props as SeriesItemProps;
      at += p.offset ?? 0;
      const from = at;
      at += p.durationInFrames;
      return (
        <Sequence key={el.key ?? i} from={from} durationInFrames={p.durationInFrames} layout={p.layout} style={p.style} className={p.className}>
          {p.children}
        </Sequence>
      );
    });
    return <>{items}</>;
  },
  {Sequence: SeriesItem},
);

/** Repeats its children every `durationInFrames` frames (`times` repeats, default forever). */
export const Loop: React.FC<{durationInFrames: number; times?: number; layout?: 'absolute-fill' | 'none'; style?: React.CSSProperties; name?: string; children?: React.ReactNode}> = ({durationInFrames, times = Infinity, layout = 'absolute-fill', style, children}) => {
  const parent = useContext(TimelineContext);
  const n = Math.floor(parent.frame / durationInFrames);
  if (parent.frame < 0 || n >= times) return null;
  const value: Timeline = {frame: parent.frame - n * durationInFrames, offset: parent.offset, duration: durationInFrames, loop: durationInFrames, inSequence: true};
  const inner = <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
  return layout === 'none' ? inner : <AbsoluteFill style={style}>{inner}</AbsoluteFill>;
};

/** Children see frame `frame` for as long as the Freeze is mounted (active=false passes time through). */
export const Freeze: React.FC<{frame: number; active?: boolean; children?: React.ReactNode}> = ({frame, active = true, children}) => {
  const parent = useContext(TimelineContext);
  if (!active) return <>{children}</>;
  return <TimelineContext.Provider value={{...parent, frame}}>{children}</TimelineContext.Provider>;
};

// ---------------------------------------------------------------- transitions

export type TransitionDirection = 'entering' | 'exiting';
export type TransitionPresentationComponentProps<P extends Record<string, unknown>> = {
  children?: React.ReactNode;
  presentationDirection: TransitionDirection;
  presentationProgress: number;
  presentationDurationInFrames: number;
  passedProps: P;
};
export type TransitionPresentation<P extends Record<string, unknown>> = {component: React.FC<TransitionPresentationComponentProps<P>>; props?: P};
export type TransitionTiming = {getDurationInFrames: (o: {fps: number}) => number; getProgress: (o: {frame: number; fps: number}) => number};

/** Progress 0 → 1 in a straight line over `durationInFrames` (optional easing). */
export const linearTiming = ({durationInFrames, easing = (x: number) => x}: {durationInFrames: number; easing?: (x: number) => number}): TransitionTiming => ({
  getDurationInFrames: () => durationInFrames,
  getProgress: ({frame}) => easing(Math.min(1, Math.max(0, frame / durationInFrames))),
});

type TSItemProps = {durationInFrames: number; offset?: number; name?: string; layout?: 'absolute-fill' | 'none'; style?: React.CSSProperties; className?: string; children?: React.ReactNode};
type TSTransitionProps = {timing: TransitionTiming; presentation?: TransitionPresentation<Record<string, unknown>>};
const TSSequence: React.FC<TSItemProps> = () => null;
const TSTransition: React.FC<TSTransitionProps> = () => null;

const Wrapped: React.FC<{pres?: TransitionPresentation<Record<string, unknown>>; dir: TransitionDirection; progress: number; T: number; children?: React.ReactNode}> = ({pres, dir, progress, T, children}) => {
  if (!pres) return <>{children}</>;
  const C = pres.component;
  return <C presentationDirection={dir} presentationProgress={progress} presentationDurationInFrames={T} passedProps={pres.props ?? {}}>{children}</C>;
};

/**
 * Scenes with transitions between them. A transition of T frames overlaps the two scenes: the next one starts T frames
 * before the previous ends. During the overlap the outgoing scene is wrapped in presentation(exiting, p) and the incoming
 * one, drawn on top, in presentation(entering, p). A transition without a presentation is a plain overlap.
 */
export const TransitionSeries: React.FC<{children?: React.ReactNode; style?: React.CSSProperties; name?: string}> & {Sequence: typeof TSSequence; Transition: typeof TSTransition} = Object.assign(
  ({children}: {children?: React.ReactNode}) => {
    const parent = useContext(TimelineContext);
    const cfg = useContext(ConfigContext);
    const fps = cfg?.fps ?? 30;
    type Item = {el: React.ReactElement; props: TSItemProps; from: number; inT?: TSTransitionProps; outT?: TSTransitionProps};
    const items: Item[] = [];
    let at = 0;
    let pending: TSTransitionProps | undefined;
    for (const el of flatten(children)) {
      if (el.type === TSTransition) {
        const t = el.props as TSTransitionProps;
        if (items.length) items[items.length - 1].outT = t;
        at -= t.timing.getDurationInFrames({fps});
        pending = t;
        continue;
      }
      const props = el.props as TSItemProps;
      at += props.offset ?? 0;
      items.push({el, props, from: at, inT: pending});
      at += props.durationInFrames;
      pending = undefined;
    }
    return (
      <>
        {items.map((it, i) => {
          const local = parent.frame - it.from;
          const d = it.props.durationInFrames;
          let node: React.ReactNode = it.props.children;
          if (local >= 0 && local < d) {
            if (it.outT) {
              const T = it.outT.timing.getDurationInFrames({fps});
              const k = local - (d - T);
              if (k >= 0) node = <Wrapped pres={it.outT.presentation} dir="exiting" progress={it.outT.timing.getProgress({frame: k, fps})} T={T}>{node}</Wrapped>;
            }
            if (it.inT) {
              const T = it.inT.timing.getDurationInFrames({fps});
              if (local < T) node = <Wrapped pres={it.inT.presentation} dir="entering" progress={it.inT.timing.getProgress({frame: local, fps})} T={T}>{node}</Wrapped>;
            }
          }
          return (
            <Sequence key={it.el.key ?? i} from={it.from} durationInFrames={d} layout={it.props.layout} style={it.props.style} className={it.props.className}>
              {node}
            </Sequence>
          );
        })}
      </>
    );
  },
  {Sequence: TSSequence, Transition: TSTransition},
);

// ---------------------------------------------------------------- math

type Extrapolate = 'extend' | 'clamp' | 'identity' | 'wrap';
export type InterpolateOptions = {easing?: (t: number) => number; extrapolateLeft?: Extrapolate; extrapolateRight?: Extrapolate};

/** Piecewise map of `input` from inputRange to outputRange; easing applies inside each segment. */
export function interpolate(input: number, inputRange: readonly number[], outputRange: readonly number[], options: InterpolateOptions = {}): number {
  if (inputRange.length !== outputRange.length || inputRange.length < 2) throw new Error('interpolate: ranges need the same length, at least 2');
  const {easing = (t: number) => t, extrapolateLeft = 'extend', extrapolateRight = 'extend'} = options;
  let seg = 1;
  while (seg < inputRange.length - 1 && inputRange[seg] < input) seg++;
  const a = inputRange[seg - 1], b = inputRange[seg];
  const c = outputRange[seg - 1], d = outputRange[seg];
  let x = input;
  const span = b - a;
  if (x < a) {
    if (extrapolateLeft === 'identity') return x;
    if (extrapolateLeft === 'clamp') x = a;
    else if (extrapolateLeft === 'wrap' && span > 0) x = a + ((((x - a) % span) + span) % span);
  }
  if (x > b) {
    if (extrapolateRight === 'identity') return x;
    if (extrapolateRight === 'clamp') x = b;
    else if (extrapolateRight === 'wrap' && span > 0) x = a + ((((x - a) % span) + span) % span);
  }
  if (c === d) return c;
  if (span === 0) return x <= a ? c : d;
  return c + (d - c) * easing((x - a) / span);
}

/** Cubic Bézier through (0,0), (x1,y1), (x2,y2), (1,1), solved for x by Newton steps with a bisection fallback. */
function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s: number) => ((ax * s + bx) * s + cx) * s;
  const Y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) {
      const e = X(s) - t;
      if (Math.abs(e) < 1e-7) return Y(s);
      const dd = dX(s);
      if (Math.abs(dd) < 1e-7) break;
      s -= e / dd;
    }
    let lo = 0, hi = 1;
    s = t;
    for (let i = 0; i < 40; i++) {
      const v = X(s);
      if (Math.abs(v - t) < 1e-7) break;
      if (v < t) lo = s; else hi = s;
      s = (lo + hi) / 2;
    }
    return Y(s);
  };
}

type EasingFn = (t: number) => number;
/** Easing curves (all map 0 → 0 and 1 → 1). in/out/inOut wrap a curve. */
export const Easing = {
  linear: (t: number) => t,
  ease: bezier(0.42, 0, 1, 1),
  quad: (t: number) => t * t,
  cubic: (t: number) => t * t * t,
  poly: (n: number): EasingFn => (t) => Math.pow(t, n),
  sin: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  circle: (t: number) => 1 - Math.sqrt(1 - t * t),
  exp: (t: number) => Math.pow(2, 10 * (t - 1)),
  elastic: (bounciness = 1): EasingFn => (t) => 1 - Math.pow(Math.cos((t * Math.PI) / 2), 3) * Math.cos(t * bounciness * Math.PI),
  back: (s = 1.70158): EasingFn => (t) => t * t * ((s + 1) * t - s),
  bounce: (t: number) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) { const u = t - 1.5 / 2.75; return 7.5625 * u * u + 0.75; }
    if (t < 2.5 / 2.75) { const u = t - 2.25 / 2.75; return 7.5625 * u * u + 0.9375; }
    const u = t - 2.625 / 2.75;
    return 7.5625 * u * u + 0.984375;
  },
  bezier,
  in: (e: EasingFn): EasingFn => e,
  out: (e: EasingFn): EasingFn => (t) => 1 - e(1 - t),
  inOut: (e: EasingFn): EasingFn => (t) => (t < 0.5 ? e(t * 2) / 2 : 1 - e((1 - t) * 2) / 2),
};

export type SpringConfig = {damping: number; mass: number; stiffness: number; overshootClamping: boolean};
const SPRING_DEFAULT: SpringConfig = {damping: 10, mass: 1, stiffness: 100, overshootClamping: false};

/** Position of a mass on a damped spring released at rest from 0 towards 1, after `t` seconds (closed form). */
function springStep(t: number, {damping: c, mass: m, stiffness: k}: SpringConfig): number {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  if (zeta === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const r = w0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * w0 + r, r2 = -zeta * w0 - r;
  return 1 + (-r2 * Math.exp(r1 * t) + r1 * Math.exp(r2 * t)) / (r2 - r1);
}

/** Frames until the spring stays within `threshold` of its target. */
export function measureSpring({fps, config = {}, threshold = 0.005}: {fps: number; config?: Partial<SpringConfig>; threshold?: number}): number {
  const cfg = {...SPRING_DEFAULT, ...config};
  const w0 = Math.sqrt(cfg.stiffness / cfg.mass);
  const zeta = cfg.damping / (2 * Math.sqrt(cfg.stiffness * cfg.mass));
  let last = 0;
  for (let f = 0; f < fps * 600; f++) {
    const t = f / fps;
    if (Math.abs(springStep(t, cfg) - 1) >= threshold) last = f;
    // stop once the decay envelope itself is under the threshold: nothing later can cross it again
    const env = zeta < 1 ? Math.exp(-zeta * w0 * t) / Math.sqrt(1 - zeta * zeta) : Math.abs(springStep(t, cfg) - 1);
    if (f > last && env < threshold) break;
  }
  return last + 1;
}

/**
 * Spring animation value at `frame`: from → to with mass, damping and stiffness. `durationInFrames` stretches or squeezes
 * time so the spring settles at that frame; `delay` holds it at `from`; `reverse` plays it backwards.
 */
export function spring({frame, fps, config = {}, from = 0, to = 1, durationInFrames, durationRestThreshold, delay = 0, reverse = false}: {
  frame: number; fps: number; config?: Partial<SpringConfig>; from?: number; to?: number; durationInFrames?: number; durationRestThreshold?: number; delay?: number; reverse?: boolean;
}): number {
  const cfg = {...SPRING_DEFAULT, ...config};
  const natural = durationInFrames === undefined && !reverse ? 0 : measureSpring({fps, config: cfg, threshold: durationRestThreshold});
  const span = durationInFrames ?? natural;
  let f = reverse ? span - frame + delay : frame - delay;
  if (f < 0) return reverse ? to : from;
  if (durationInFrames !== undefined) f = (f * natural) / durationInFrames;
  let x = springStep(f / fps, cfg);
  if (cfg.overshootClamping) x = Math.min(1, x);
  if (reverse) x = 1 - x;
  return from + (to - from) * x;
}

/** Deterministic number in [0, 1) for a seed (string or number): same seed, same value in every worker. */
export function random(seed: string | number | null): number {
  if (seed === null || seed === undefined) throw new Error('random() needs a seed');
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  let a = (h + 0x6d2b79f5) >>> 0;
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- media

/** URL of a file in the project's public/ folder. */
export const staticFile = (path: string): string => {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return 'public/' + path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
};

type ImgProps = React.ImgHTMLAttributes<HTMLImageElement> & {maxRetries?: number; pauseWhenLoading?: boolean; delayRenderTimeoutInMilliseconds?: number; delayRenderRetries?: number; showInTimeline?: boolean};
/** <img>. The build preloads every image the composition uses, so it is decoded before the frame that shows it. */
export const Img = React.forwardRef<HTMLImageElement, ImgProps>(({maxRetries, pauseWhenLoading, delayRenderTimeoutInMilliseconds, delayRenderRetries, showInTimeline, ...rest}, ref) => {
  void maxRetries; void pauseWhenLoading; void delayRenderTimeoutInMilliseconds; void delayRenderRetries; void showInTimeline;
  return <img ref={ref} decoding="sync" {...rest} />;
});
Img.displayName = 'Img';

type VideoProps = {
  src: string;
  style?: React.CSSProperties;
  className?: string;
  muted?: boolean;
  volume?: number | ((f: number) => number);
  startFrom?: number;
  trimBefore?: number;
  endAt?: number;
  trimAfter?: number;
  playbackRate?: number;
  transparent?: boolean;
  toneMapped?: boolean;
  loop?: boolean;
  onError?: (e: unknown) => void;
  pauseWhenBuffering?: boolean;
};

export const videoKey = (src: string, startFrame: number, mediaStartFrame: number) => `${src}|${startFrame}|${mediaStartFrame}`;

const UNITLESS = new Set(['opacity', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'order', 'lineHeight', 'zoom', 'scale', 'fontWeight']);
/** React style object onto a DOM element (numbers become px where CSS wants a length). */
function applyStyle(el: HTMLElement, style: React.CSSProperties | undefined, previous: string[]): string[] {
  for (const k of previous) (el.style as unknown as Record<string, string>)[k] = '';
  const keys: string[] = [];
  for (const [k, v] of Object.entries(style ?? {})) {
    if (v === undefined || v === null) continue;
    (el.style as unknown as Record<string, string>)[k] = typeof v === 'number' && !UNITLESS.has(k) ? `${v}px` : String(v);
    keys.push(k);
  }
  return keys;
}

/** Moves a static video (and the frame image the engine keeps right after it) into `parent`. */
function moveVideo(video: HTMLVideoElement, parent: HTMLElement) {
  if (video.parentElement === parent) return;
  const frame = video.nextElementSibling;
  parent.appendChild(video);
  if (frame && frame.classList.contains('__render_frame__')) parent.appendChild(frame);
}

/**
 * A video clip that plays in step with the Sequence it sits in (local frame 0 = first frame after trimBefore/startFrom).
 * The picture comes from a static <video data-hf-key> that build.mjs wrote into #root after discovering this use;
 * while mounted, the video is moved into this component's place in the layout and gets its style, then parked again.
 */
export const OffthreadVideo: React.FC<VideoProps> = (props) => {
  const tl = useContext(TimelineContext);
  const cfg = useContext(ConfigContext);
  const slot = useRef<HTMLSpanElement>(null);
  const applied = useRef<string[]>([]);
  const trim = props.trimBefore ?? props.startFrom ?? 0;
  const startFrame = tl.offset;
  const key = videoKey(props.src, startFrame, trim);
  // No file (placeholder props: src '' becomes 'public/'): draw nothing rather than a broken video.
  const empty = !props.src || props.src.endsWith('/');
  const d = empty ? null : discovery();
  if (d && !d.videos.has(key)) {
    const total = cfg?.durationInFrames ?? 0;
    const end = props.trimAfter ?? props.endAt;
    // A looping clip (inside <Loop> or with loop) keeps playing to the end of the film; the engine loops the file.
    const len = tl.loop || props.loop || !Number.isFinite(tl.duration) ? total - startFrame : tl.duration;
    d.videos.set(key, {
      key, src: props.src, startFrame,
      durationFrames: Math.max(1, Math.min(len, end !== undefined ? end - trim : len)),
      mediaStartFrame: trim, playbackRate: props.playbackRate ?? 1, loop: !!(props.loop || tl.loop),
      volume: props.muted ? 0 : typeof props.volume === 'number' ? props.volume : 1,
    });
  }
  useLayoutEffect(() => {
    const video = videoByKey(key);
    const host = slot.current;
    if (!video || !host) {
      if (!video && !empty) console.warn(`OffthreadVideo: no static <video> for ${key}; rebuild the project`);
      return;
    }
    moveVideo(video, host);
    return () => {
      const park = document.getElementById('hf-video-park');
      if (park) moveVideo(video, park);
    };
  }, [key]);
  useLayoutEffect(() => {
    const video = videoByKey(key);
    if (video) applied.current = applyStyle(video, {width: '100%', height: '100%', ...props.style}, applied.current);
  });
  // display: contents, so the video lays out as a direct child of this component's parent (as a plain <video> would).
  return <span ref={slot} className={props.className} data-hf-slot="" style={{display: 'contents'}} />;
};
export const Video = OffthreadVideo;

let videoIndex: Map<string, HTMLVideoElement> | null = null;
function videoByKey(key: string): HTMLVideoElement | undefined {
  if (!videoIndex) {
    videoIndex = new Map();
    for (const v of Array.from(document.querySelectorAll('video[data-hf-key]'))) videoIndex.set(v.getAttribute('data-hf-key') ?? '', v as HTMLVideoElement);
  }
  return videoIndex.get(key);
}

/** Font size at which `text` fills `withinWidth` px in one line. Measured with canvas once the fonts are loaded. */
export function fitText({text, withinWidth, fontFamily, fontWeight = '400', letterSpacing, textTransform}: {
  text: string; withinWidth: number; fontFamily: string; fontWeight?: string | number; letterSpacing?: string; fontVariantNumeric?: string; textTransform?: string; validateFontIsLoaded?: boolean;
}): {fontSize: number} {
  if (typeof document === 'undefined') return {fontSize: 100};
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return {fontSize: 100};
  const t = textTransform === 'uppercase' ? text.toUpperCase() : textTransform === 'lowercase' ? text.toLowerCase() : text;
  ctx.font = `${fontWeight} 100px ${fontFamily}`;
  let w = ctx.measureText(t).width;
  if (letterSpacing) {
    const v = parseFloat(letterSpacing);
    const px = letterSpacing.endsWith('em') ? v * 100 : v;
    w += px * t.length;
  }
  return {fontSize: w > 0 ? (withinWidth / w) * 100 : 100};
}

export type Caption = {text: string; startMs: number; endMs: number; timestampMs: number | null; confidence: number | null};

// Assets are preloaded by the build, so these only keep older call sites working.
let handles = 0;
export const delayRender = (label?: string, options?: unknown): number => { void label; void options; return ++handles; };
export const continueRender = (handle: number): void => { void handle; };
export const cancelRender = (err: unknown): void => { console.error(err); (window as {__hfStartupError?: string}).__hfStartupError = String(err); };

// ---------------------------------------------------------------- entry

export type FontFaceSpec = {family: string; weight?: string; style?: string; src: string; unicodeRange?: string};
export type CompositionSpec = {
  component: React.ComponentType<Record<string, unknown>>;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  props?: Record<string, unknown>;
  /** Font files under public/ (or npm:<package>/<file>); build.mjs writes @font-face rules and preloads them. */
  fonts?: FontFaceSpec[];
};

/** Root element with the composition config and the timeline at `frame`. */
export const Frame: React.FC<{cfg: VideoConfig; frame: number; Component: React.ComponentType<Record<string, unknown>>}> = ({cfg, frame, Component}) => (
  <ConfigContext.Provider value={cfg}>
    <TimelineContext.Provider value={{frame, offset: 0, duration: cfg.durationInFrames, loop: null, inSequence: false}}>
      <AbsoluteFill>
        <Component {...cfg.props} />
      </AbsoluteFill>
    </TimelineContext.Provider>
  </ConfigContext.Provider>
);

/**
 * Entry point of a composition bundle. In the browser it mounts the composition chosen by build.mjs
 * (window.__HF_COMPOSITION__) and redraws it on every hf-seek. In discovery mode (Node, build time)
 * it only hands the table to the build.
 */
export function render(compositions: Record<string, CompositionSpec>): void {
  const g = globalThis as {__HF_COMPOSITIONS__?: Record<string, CompositionSpec>; __HF_COMPOSITION__?: string; __HF_MOUNT__?: (spec: CompositionSpec, id: string) => void};
  g.__HF_COMPOSITIONS__ = compositions;
  if (typeof document === 'undefined') return;
  const id = g.__HF_COMPOSITION__ ?? Object.keys(compositions)[0];
  const spec = compositions[id];
  if (!spec) throw new Error(`No composition ${id}; have ${Object.keys(compositions).join(', ')}`);
  g.__HF_MOUNT__?.(spec, id);
}
