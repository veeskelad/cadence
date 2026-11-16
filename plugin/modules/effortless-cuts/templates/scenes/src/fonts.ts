// Fonts every scene may use, as local files under public/ (never fetched at render time).
// build.mjs writes the @font-face rules and warms each face up before frame 0, Latin and Cyrillic.
// Example, with the file at public/fonts/Brand-Bold.woff2:
//   {family: 'Brand', weight: '700', src: 'fonts/Brand-Bold.woff2'}
import type {FontFaceSpec} from '@cadence/frame';

export const FONT_FACES: FontFaceSpec[] = [];
