# Sound effects

Every sound an edit needs comes from the engine itself: no account, no key, no download. Two sources, in this order:

1. **The engine's own sounds**, synthesized in code during the mix. Call them by name: `sfx.extra: [[t, 'thud', gain?]]` (SOURCE time).
2. **Sound files the person provides** (their own recording or a file they have the rights to), referenced in `sfx.files` or `sfx.kit`. This module ships no sound files.

Never generate or fetch a sound on an outside service.

## 1. Engine sounds (`sfx.extra`)

| name | sound | when |
|---|---|---|
| `thud` | paper set down on a desk, soft and low | a number lands or dies, a strike, the payoff |
| `pop` | soft woody blip | a real arrival: the logo or the result that matters |
| `bell` | FM bell | a success, a check |
| `tap` | trackpad click | a click shown on screen |
| `tom` | low tom | a heavy beat, a step |
| `slide`, `swish` | paper slide, layout move | movement noise: off by default (`sfx.swish: 0`) |

The scenes add their own cues (a `term` types with key clicks, a `counter` ticks); `sfx.accents` (default 0) adds glassy blips on key moments.

## 2. The person's own files (`sfx.files`)

Put the file in the project's `assets/sfx/` (or the style's `assets/sfx/`, `init` copies those). Levelled on its own in the mix: `gain` = dB under the voice (default -10). `peak: true` puts the loudest instant on `at` (impacts). `endAt` makes a riser land on the payoff.

| kind of sound | use it for | spec |
|---|---|---|
| a heavy impact | THE payoff, a big number, a hook verdict | `{at, src, peak: true, gain: -8}` |
| a short glitch or hit | the hook → content cut, with a `glitch` on the same `t` (once or twice a short) | `{at, src, peak: true, gain: -6}` |
| a riser | build-up to a reveal | `{endAt: <reveal>, src, gain: -12}` |
| glass breaking | a screen or a logo that breaks (`shatter` item) | `{at: <breakAt>, src, peak: true}` |

## Example

```js
sfx: {
  swish: 0, accents: 0,
  extra: [[7.7, 'thud', -6]],
  files: [
    { at: 2.0, src: 'assets/sfx/hit.wav', peak: true, gain: -6 },
    { at: 13.8, src: 'assets/sfx/impact.wav', peak: true, gain: -8 },
  ],
},
glitch: { keys: [[2.0, .4, 1]] },
```
