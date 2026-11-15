# explainroo for coding agents

**Когда:** нужен ролик с дикторским голосом (локальная озвучка Kokoro или своя запись) из двух файлов, `script.md` и `scenes.js`: объяснялка, обучающий ролик, запуск, демо продукта с записью экрана, короткое вертикальное видео. Справка по-английски; она же печатается командой `docs`. Платные сервисы, публикация и загрузки в этой сборке убраны.

> Запускать так: `node modules/explainer-engine/bin/explainroo.js <команда>` вместо `npx --yes explainroo`.

Run explainroo with `npx --yes explainroo`. `--yes` stops `npx` from waiting
on its install question. In a source checkout, run `node bin/explainroo.js`
instead. The command examples below shorten this to plain `explainroo`, so type
the full form when you run them. `npx` does not install an `explainroo`
command on `PATH`.

This page tells you, the coding agent, how to make a video with explainroo.
The user gives you a topic, maybe with a length or a style. You write the words
and the pictures, and explainroo makes the video. A long docs topic has
sections, and `explainroo docs <topic> --sections` lists them. Print only the
one you need. When the user wants their own recording edited instead, read
`explainroo docs cut`.

## What explainroo does

explainroo turns two files into an MP4 video with narration. `script.md`
holds what the voice says. `scenes.js` draws what the viewer sees. Every
drawing can appear on a word the voice says. A voice model (Kokoro) reads
the script on this computer, or the narration is the user's own recording.
Whisper notes when each word is spoken.
Chrome draws the frames, and ffmpeg makes the MP4 with music and sound
effects. All of this runs on this computer, so a video needs no account and
no key.

## The hard limits

Check these first, and tell the user before you make anything that
runs into one.

**Languages.** Set `language` in `video.json` to one of these codes. No other
language works yet, with any voice.

| Language | Code | Kokoro, the free voice, also needs |
| --- | --- | --- |
| English | `en` | nothing more |
| Spanish, French, Italian, Brazilian Portuguese, Hindi | `es`, `fr`, `it`, `pt-br`, `hi` | the espeak-ng program |
| Japanese, Mandarin Chinese | `ja`, `zh` | Python 3 with misaki |
| German | `de` | Kokoro has no German voice |

A recording of the user's voice works in all of these languages and needs
neither program. German works only with a recording. `explainroo docs languages`
has the details.

**Keys, money and data.** In this build there are no paid services, no keys and
no sign-ins: no AI images or clips, no paid voices, no posting and no upload.
Everything is free and local. `capture` loads the page you name, and
`formats add` clones the Git address you name. The models and fonts download
the first time, and `doctor --fetch` may download espeak-ng's packages. Nothing
of the user's goes along. Nothing else leaves the computer.

## Before you start

You only need to clone explainroo to change explainroo itself. It needs
Node.js 20.11 or newer, ffmpeg, and Chrome or Chromium. Run this once:

```bash
npx --yes explainroo doctor --fetch
```

`doctor` checks Node, ffmpeg and Chrome, and the extra programs some
languages need. With `--fetch` it also downloads the speech models that
setup needs, the first time only: about 400 MB for English, and 252 MB for
another language. Each part is `ready`, `missing` with how to get it, or
`not needed` for this setup. `doctor videos/<name>` checks what that
project's languages and voices need, and before the project exists,
`doctor --language es` checks one language. On Debian and Ubuntu,
`doctor --fetch --language es` also sets up espeak-ng without root when it is
missing. Commands that work on a video take the project folder first, and
every command accepts `--json`.

`npx --yes explainroo docs` prints this page, and
`npx --yes explainroo docs <topic>` prints a topic listed at the end.

## When to ask the user

Decide the normal things yourself, like the look, the length, the voice, the
layout and the wording. Ask only when you cannot go on without an answer.
When you ask, put everything you need in one message. Typical reasons to ask:

- The topic is unclear, or you need a fact you cannot check.
- The user wants something explainroo cannot do, like video shot with a
  camera.

Explainroo makes the whole video for free, on this computer. When the user
asks for AI images, AI clips, an AI presenter, a paid voice, posting or an
upload, say that this build does not do it, and offer the free route: pictures
drawn in `scenes.js` or the user's own files, the user's own footage, their own
recording as the voice, and `package` for a folder they upload themselves.

## From a brief to a finished video

1. **Learn the subject.** Read what the user points to, and write down the
   facts you will use. Never make up numbers, quotes or claims.
2. **Create the project** with
   `explainroo init videos/<name> --theme studio --size 16:9 --title "..."`.
   Pick the look for the audience, and the size for the platform
   (`explainroo docs sizes`). `init --format <name>` starts from a format,
   like `vertical-short` (`explainroo docs formats`).
   The video has a small "explainroo.com" watermark in a corner by default,
   and `"watermark": false` in `video.json` turns it off. With
   `"captions": "auto"`, vertical, 4:5 and square videos get captions, and a
   16:9 video gets none.
3. **Write `script.md`.** The narration comes first, because it sets the
   timing for everything else (`explainroo docs writing`). When the user
   asks for a length, set it in `video.json`, like `"targetSeconds": 40`.
   After `voice`, a shorter video gets longer holds at scene ends to
   reach it, and `voice` and `check` warn when it is over by more than 0.5 s.
   `explainroo set videos/<name> targetSeconds 40` writes one setting, and a
   dotted key like `sizes.shorts.pace` sets one of a single size.
4. **Make the voice** with `explainroo voice videos/<name>`. Fix a word the
   speech check did not confirm with `{shown|spoken}`, and run it again
   (`explainroo docs writing`).
5. **Plan the pictures.** Decide what appears on each cue, what leaves and
   what stays in place (`explainroo docs pictures`).
   `explainroo words videos/<name>` lists each scene's spoken words and
   times.
6. **Collect pictures**, if the video needs them: draw them in `scenes.js` or
   use the user's own files (`explainroo docs pictures`).
7. **Write `scenes.js`**, one function per scene, with each picture tied to a
   spoken word or a `[#marker]` (`explainroo docs scene-api`).
8. **Check** with `explainroo check videos/<name>`, and fix every error and
   every warning (`explainroo docs troubleshooting`).
9. **Look at the frames** with `explainroo still videos/<name>` and
   `explainroo sheet videos/<name>`. Open the images and judge them like a
   viewer would. For a platform's version, add `--platform tiktok` to
   `check`, `still`, `sheet`, `render` and `verify`.
10. **Make the video** with `explainroo render videos/<name>`. Make a draft
    with `--draft` only when you will watch it, because `still` and `sheet`
    are the cheap way to see frames. Check the file with
    `explainroo verify videos/<name>`. It checks the loudness, black frames
    and how clear the voice is, and its last line says whether it passed.
11. **Tell the user** where the video, its subtitles, chapters and cover are,
    how long it is, what `verify` said and what you could not check. To post
    it by hand, read `explainroo docs publishing`.

## Topics

Read the topic of the step you are on. A long topic has sections:
`npx --yes explainroo docs <topic> --sections` lists them with their size, and
`npx --yes explainroo docs <topic> <section>` prints one, like
`npx --yes explainroo docs publishing post.json`. Print only the section you need.

| Topic | Read it when |
| --- | --- |
| `making-a-video` | you want each step above in full |
| `writing` | you write `script.md`: the style, the length and the script syntax |
| `pictures` | you plan the scenes, with four layouts to start from and how the camera moves |
| `scene-api` | you write `scenes.js`: everything a scene can draw, with its options |
| `troubleshooting` | a scene breaks, or before you write the first one |
| `voices` | you pick a voice, or the user wants their own recording |
| `languages` | the video isn't in English, or comes in several languages |
| `japanese-and-chinese` | the video is in Japanese or Mandarin Chinese |
| `music` | the user wants their own music, a sound file or original music from Soundroo |
| `sizes` | the video is for a platform: sizes, captions, pace and the watermark |
| `formats` | you use or install a format |
| `short-video` | you make a Short, a TikTok or a Reel |
| `product-demos` | the user wants a demo of an app or a website, also one recorded with `explainroo record` |
| `settings` | you change `video.json` or make a look of your own |
| `commands` | you need a command or a flag that this page doesn't show |
| `publishing` | the user wants a package for a platform to upload by hand |
| `web-player` | the video goes on a website, in an iframe |
| `transparent-video` | the video goes over camera footage in a video editor |
| `cut` | the user wants to cut their own recording by its words |
