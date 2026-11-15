Когда: нужен закадровый сценарий короткого ролика без лица по идее, заметкам или ссылке; выбирается одна из шести форм рассказа, каждый бит помечен видом графики.

# /reel-script

Writes a voiceover script for a **faceless** short-form reel in the paper-reel
style (cream grid + orange punch cards + taped proof-card aesthetic). The
output is timed prose meant to be read aloud as VO, not slides — every beat
is short enough to say in one breath and tagged with which graphic kind it
becomes downstream (`pr_card` / `pr_punch` / `pr_proof`, the Remotion kinds
already wired into the paper-reel render pipeline).

**The single biggest failure mode of this skill is sameness** — every idea
coming out with the same hook/credibility/reframe/3-tips/CTA shape,
regardless of what the idea actually is. That's not a structure, it's a
straitjacket. Fix: diagnose what KIND of idea this is first, pick the
narrative shape that actually fits it, and vary the hook style every time.

## When to use

- User gives a topic, a raw idea, rough notes, an article, or a link and wants it turned into a short-form script.
- User asks for "a hook for X" or "script this like the reel you showed me."
- User is prepping VO to record before a `pr_*` render pass.

## Step 1 — diagnose the idea, don't default

Before writing a word, decide what kind of idea this is. That decision
picks the shape (below), which picks the beat count and order. Don't reuse
last script's shape just because it worked before.

| If the idea is... | Use shape |
|---|---|
| A myth, a misconception, a surprising truth ("everyone thinks X, actually Y") | **A — Reveal** |
| A list of tools/mistakes/tips with no single narrative thread | **B — Listicle** |
| Something that happened to you or someone specific, with a beginning/middle/end | **C — Story** |
| A workflow, tool, or way of doing things that got replaced by a better one | **D — Before/After** |
| A stat, trend, or market shift that's surprising on its own | **E — Data-led** |
| Two options/approaches being weighed against each other | **F — Showdown** |

If the idea genuinely fits two shapes, pick the one that needs fewer forced
beats — don't hedge by blending both.

## Step 2 — the shapes

Each shape lists its beats in order. Beat count and presence of
credibility/reframe beats **varies by shape** — don't import beats from
shape A into a different shape out of habit.

**A — Reveal** (myth-bust / reframe)
1. HOOK — the counter-intuitive claim → `pr_punch`
2. CREDIBILITY — one stat/fact that makes the claim believable → `pr_proof`
3. REFRAME — the twist that turns the claim into a lesson → `pr_punch` (boxed)
4. TIPS (2–4) — one teachable idea each → `pr_card` per tip
5. CTA → `pr_card`

**B — Listicle**
1. HOOK — frames the count and the stakes ("3 things nobody tells you about X") → `pr_punch` or `pr_card`
2. ITEM 1..N (3–5 items) — each is self-contained: the insight AND its proof in one beat, no separate credibility beat → `pr_card` per item, `eyebrow: "0N"`
3. CTA → `pr_card`
(No REFRAME beat — the list itself is the payoff.)

**C — Story**
1. HOOK — cold open on a moment, not a claim ("It's 2am. The render just failed for the sixth time.") → `pr_punch` or `pr_proof`
2. SETUP — the stakes/context in one line → `pr_card`
3. TURN — what changed, the decision, the twist → `pr_punch` (boxed)
4. LESSON — what it means for the viewer, generalized from the specific story → `pr_card`
5. CTA → `pr_card`

**D — Before/After**
1. HOOK — the promise of the change ("I deleted my video editor. Then I made more videos than ever.") → `pr_punch`
2. BEFORE — the old way, concrete and specific (not "it was hard" — what exactly was hard) → `pr_card`
3. AFTER — the new way, concrete contrast → `pr_card`
4. HOW — the one mechanism that made the shift possible → `pr_proof` or `pr_card`
5. CTA → `pr_card`

**E — Data-led**
1. HOOK — the stat stated cold, no preamble ("300 million to 5.2 billion. Six months.") → `pr_proof` or `pr_punch`
2. CONTEXT — why this number is surprising / what it's being compared against → `pr_card`
3. IMPLICATION — what it means for the viewer specifically, not just "the industry" → `pr_punch` (boxed)
4. SUPPORT (1–2 beats) — a second data point or example → `pr_card`
5. CTA → `pr_card`

**F — Showdown**
1. HOOK — frames the two options ("Timeline editing vs. one folder and a prompt.") → `pr_punch`
2. OLD WAY — its real pain point, specific → `pr_card`
3. NEW WAY — the alternative, specific → `pr_card`
4. WHY IT WINS (1–2 beats) — concrete reasons, not vibes → `pr_card`
5. CTA → `pr_card`

## Step 3 — vary the hook, every time

Reusing the same hook style back-to-back is the fastest way to make two
different scripts feel identical. Before writing the hook, pick a style you
haven't used in your last script (if you don't know what was used last,
just don't default to "bold claim" every time — it's the easiest trap):

- **Bold claim** — "I deleted my video editor. Then I made more videos than ever."
- **Contrarian reframe** — "Everyone thinks X. Actually, Y."
- **Question** — "What if your editor could brand itself?"
- **Cold-open scene** — "It's 2am. The render just failed for the sixth time."
- **Stat-first** — "300 million to 5.2 billion. Six months."
- **POV** — "POV: you just fired your video editor."

## Voice rules (apply to every shape)

- **Staccato, confident, no filler.** Short sentences. Cut "so," "basically," "honestly," "I think" — state things directly.
- **Numbers, not adjectives.** "300 million to 5.2 billion" beats "grew massively."
- **Every line must be sayable in one breath.** If a sentence needs a breath in the middle, split it into two beats.
- **Total length: 30–60s of spoken VO** (~75–160 words) for a first pass, unless the user asks for longer. Longer needs more beats/items, not padding.
- **A correction/contrast moment ("not X. Y.") is a spice, not a requirement.** Use it where it genuinely fits one beat, skip it entirely if it doesn't — don't force one into every script just because it worked once.
- **Don't recycle phrasing across scripts.** If a line you're about to write echoes a line from a script you wrote earlier in this conversation (same opening word, same sentence shape), rewrite it.

## Output format

State which shape you picked and why (one line), then write the script as
labeled beats in that shape's order, each on its own block, tagged with its
target kind:

```
Shape: <A/B/C/D/E/F — name> — <one-line reason this idea fits it>

HOOK (pr_punch)
"<line>"

<next beat name> (<kind>)
"<line>"

...

CTA (pr_card)
"<line>"
```

## Process

1. If the user gave a topic/notes/link, work from that directly — don't ask clarifying questions unless the input is too thin to find a real angle (e.g. just "AI" with nothing else). A genuinely thin prompt is worth one clarifying question; anything with a real angle, just write it.
2. Diagnose the idea against the table in Step 1 and commit to one shape — resist defaulting to Reveal just because it's the most familiar.
3. Pick a hook style per Step 3, favoring one you haven't used recently.
4. Write the beats for that shape, following the voice rules.
5. After the script, note total estimated VO duration (rough: ~2.3 words/sec spoken) so the user knows if it's in the 30–60s band.
6. Don't render anything or touch any render pipeline — this skill only writes the script. Handoff is: user records VO from this script, then a separate pass builds the `broll_plan.json` and renders.
