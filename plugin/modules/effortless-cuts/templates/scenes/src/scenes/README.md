# Scene components

One file per scene, named after the scene's `component` in `scenes.json`, each
exporting that component as a named export:

```tsx
export const TokenWaste: React.FC = () => { … };
```

`scenes.py sync` writes `src/Root.tsx` and `src/data/scene-spec.json` from
`scenes.json`. Do not edit either by hand: the next sync overwrites them, and
a registration that drifts from the spec renders the wrong duration silently.

Time comes from the frame, never from a clock:

```tsx
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from '@cadence/frame';
```

`@cadence/frame` is `src/lib/frame.tsx`: `useCurrentFrame`, `useVideoConfig`,
`Sequence`, `Series`, `interpolate`, `spring`, `Easing`, `random`, `Img`,
`staticFile` (files in `public/`). A scene written for another frame-driven
React renderer ports by changing its import to `@cadence/frame`.

Fonts: local files in `public/`, listed in `src/fonts.ts`.

Craft rules: `rules/scenes.md` and `rules/motion.md`.
