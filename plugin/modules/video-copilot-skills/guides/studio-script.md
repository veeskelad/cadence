# Studio Script

Scripts that sound like the creator on their best day: short, concrete, with a hook that earns the next 30 seconds. Everything comes from their real week and their own words. Nothing is invented.

## Before writing

Read, in this order:

1. `video-agent/voice.md`: who they are, who they talk to, how they sound, what they believe, their proof, the ask. Missing: ask 4 questions now (what they do, for whom, the language they record in, what viewers should do after watching).
2. `video-agent/swipe.md` if the person keeps one: hooks and "Concepts" that worked in their niche, with their proof. Every script sits on one of them ([studio-script/viral.md](studio-script/viral.md)). Missing: the person names 2 or 3 videos in their niche that went far (links or titles they give themselves), and those become the first concepts. This module does not scrape accounts or collect competitor statistics.
3. `video-agent/audit.md` if it exists (the person's own notes on what works on their account). Its "3 changes for next week" apply to this week's scripts. Their own data beats the niche's.
4. The last 20 lines of `video-agent/log.md`: topics and hook formulas already used. Never repeat a topic from the last 4 weeks unless they ask.
5. [studio-script/viral.md](studio-script/viral.md), [studio-script/hooks.md](studio-script/hooks.md), [studio-script/script-rules.md](studio-script/script-rules.md), [studio-script/funnel.md](studio-script/funnel.md) (the videos that reach new people are funnels), [studio-script/making-of.md](studio-script/making-of.md) (the Proof and Story videos the creator lived are making-ofs) and [studio-script/humanize.md](studio-script/humanize.md).

Talk to them in their language, and write the scripts in the language they record in.

## Modes

- Mode **week** → a week of scripts (default 5).
- Mode **topic** (`<topic or idea>`) → one script.
- Mode **funnel** → a funnel script ([studio-script/funnel.md](studio-script/funnel.md)): opens on a wide door (often a divisive take the niche's crowd already argues about), then bridge, tension, pivot, pearl down to the creator's niche and a soft ask. 3 bridges rated by door size, the pearl written first, the two widening tests on the notes line.
- Mode **making-of** → a making-of script ([studio-script/making-of.md](studio-script/making-of.md)): what the creator did with a real result, in 4 beats (setting, action, result in their numbers, moral), the advice only at the end. No result yet = episode 1 of a series.
- Mode **hook** → the hook printer: 20 hooks from at least 10 formulas, grouped by concept of swipe.md (proven concepts first), filled with voice.md (the viewer's words, their phrases, their proof, their myths), scored, through the quality gates, best 3 on top. Each keeps its formula name, so a hook that works can be reposted with a new wording.
- Mode **rewrite** → their script, tightened: same content and facts, better hook, shorter lines, timing checked, humanized. Show what changed.
- Mode **humanize** → any text (script, caption, description, post) made to sound like them: [studio-script/humanize.md](studio-script/humanize.md), with its before and after score. `humanize check` only reports.

For `hook` and `humanize`, skip "The week" and "The mix": read voice.md and the references, then do only that job.

## 1. The week

Ask one question: **"What actually happened this week?"** Give prompts so it's easy: a result (with the number), a mistake, a question a client or a follower asked, something they learned or tested, a tool they used, an opinion that came up in a conversation, something they disagree with.

Real material beats ideas, as long as it fits a proven concept. Then ask what is hot today in the niche (a launch, a trend, a price change of the week); the person names it, and one script rides it, first in the week. If they have nothing, propose 5 topics from voice.md (beliefs, mistakes their viewer makes, proof), audit.md (their topics that over-perform) and swipe.md, and let them pick.

Then: how many videos (default 5) and is there something to promote this week (yes → one Offer video, no → none).

## 2. The mix

Each video gets a type. Plan the week before writing:

| Type | What it does | Default per week of 5 |
|---|---|---|
| Teach | one problem, one fix the viewer can apply today | 2 |
| Proof | a real result and what made it happen | 1 |
| Story | a moment, a turn, a lesson | 1 |
| Opinion | a position against the usual advice in the niche | 1 |
| Offer | the problem, what they made for it, who it's for, the ask | 0 or 1, never 2 |

A Teach or an Opinion meant to reach new people is written as a funnel ([studio-script/funnel.md](studio-script/funnel.md)); a Proof or a Story the creator lived, as a making-of ([studio-script/making-of.md](studio-script/making-of.md)).

Each video also gets its offer proximity, the rung of voice.md "The ask" it points to (0 to 3, script-rules.md), following the week mix there.

Show the plan as a table (number, type, topic, concept, hook formula you'll try first, offer proximity) and let them swap before you write. Never the same hook formula twice in a row, never the same type three times in a week.

## 3. Write each script

0. **Aim**: the concept of swipe.md it rides (with its best video and its x), the fresh news if any, the viewer it talks to, the false belief or myth it breaks (voice.md), and the ask line of its rung.
1. **3 hooks**, each from a different formula of [hooks.md](studio-script/hooks.md). Score each with the rubric in [script-rules.md](studio-script/script-rules.md). Keep the best; the other two go under "Other hooks". All below 7/10: write 3 more.
2. **The on-screen hook**: 6 words or fewer, shown during the first seconds. It adds to the spoken hook, never repeats it word for word.
3. **The body**, from the structure of its type (script-rules.md). One sentence per line. A re-hook near the middle.
4. **The end**: the ask from voice.md, said once, or a last line that loops into the first.
5. **Visual notes**, apart from the spoken lines: what to show, and the 1 to 4 words worth a board (a number, a result, a tool name, a list of steps).
6. **Timing**: count the words, divide by their pace (voice.md, else 160 wpm). Check every beat rule in script-rules.md. Fix before showing.
7. **Facts**: every number, name and result comes from voice.md or what they told you. Anything else becomes `{{your number}}`, `{{client name}}`, and is listed under "To fill".
8. **Humanize**: run [studio-script/humanize.md](studio-script/humanize.md) on the script (steps 1 to 6, no report per script). Read it as if spoken aloud. Nothing they would never say (voice.md "Words I never use"), no em dash, no AI shape, every fact intact. Its score goes in the script's **Score** line.
9. **Triggers and gates**: at least four triggers of script-rules.md at their place, then the four quality gates (generic, structureless, interchangeable, viral). A failed gate is a rewrite before showing.

## 4. Format

Save to `video-agent/scripts/week-YYYY-MM-DD.md` (the Monday of the week). One file per week; a single script goes into the current week's file.

````markdown
# Week of 2026-10-05

| # | Slug | Type | Formula | Offer | Length |
|---|---|---|---|---|---|
| 1 | hooks-too-long | Teach | The mistake | 0 | 40 s |

## 1. hooks-too-long

**On screen:** Your hook is *too long*
**Hook:** Your first sentence has 20 words. Nobody hears word 12.

```script
Your first sentence has 20 words. Nobody hears word 12.
By then, most people already swiped.
I checked my last {{number}} shorts.
The ones that held past 3 seconds had short hooks.
Under 12 words, with the topic in the first 5.
Here's the part everyone skips.
Cutting is easy, picking the one point is the hard part.
So write your hook, then cross out everything before the point.
"In this video I'll show you how to write better hooks."
Becomes: "Your hook is too long."
Same idea, half the words, and it lands before they swipe.
Try it on your next three videos.
Follow for one script fix a day.
```

**Visual notes**
- line 1 → board: 20
- line 5 → board: 12 words
- line 9 → show: the long hook, crossed out

**Ask:** Follow for one script fix a day.

**Other hooks**
- (Stop / start) Stop explaining in your hook. Start with the result.
- (Their words) "My hook is fine, it's the algorithm."

**Triggers:** gap 0s, self-recognition 0s, proof 6s, pattern break 20s, specificity 28s
**Score:** hook 8/10 · human 10/10 · 111 words · 40 s at 165 wpm · offer 0 · gates ✓
**To fill:** {{number}}
````

The `script` block holds only the spoken lines: the creator reads it while recording, and short-editing reads it to edit.

Then show a READY summary and wait:

```text
READY · week of 2026-10-05 · 5 scripts (Teach, Proof, Story, Opinion, Teach) · 38 to 52 s
Saved: video-agent/scripts/week-2026-10-05.md
To fill: 3 placeholders
Reply yes to log them, or tell me what to change.
```

After a yes, add one line per script to `video-agent/log.md`:

```text
2026-10-05 | hooks-too-long | Teach | The mistake | why long hooks lose viewers
```

## 5. Hand off

Show the week's table and the first script in full, then ask what to change. Next steps: record each script (phone, camera or webcam, one take per script, into `video-agent/takes/<slug>.mp4`), then edit it with [short-editing.md](short-editing.md).

## Honest limits

- A strong script is not a promise of views. Topic, timing, delivery and luck matter as much.
- The hook score is a writing checklist, not a prediction.
- Scripts only sound like the creator when voice.md has their real words. A thin voice file gives generic scripts: update it.
