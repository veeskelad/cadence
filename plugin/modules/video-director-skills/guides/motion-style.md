Когда: перед любой раскадровкой или кодом анимации; постоянная система движения и вида.

# MOTION_STYLE.md

## Purpose

This document defines the permanent visual and motion design system for all generated videos.

Read this entire document before:

* planning scenes
* writing animation code
* modifying existing scenes
* creating transitions
* selecting typography layouts
* adding visual elements
* changing animation timing

These rules override generic animation patterns and default design decisions.

The goal is to create fast-paced editorial motion graphics inspired by professional After Effects social media videos.

The final output must feel like one continuous animated composition.

It must NOT feel like:

* a slideshow
* a PowerPoint presentation
* a website carousel
* animated subtitles
* disconnected scenes
* template-based motion graphics
* static cards with entrance animations

---

# 1. CORE MOTION PHILOSOPHY

Every video should feel alive.

Visual progression should happen continuously.

Do not think:

Scene 1 → transition → Scene 2 → transition → Scene 3.

Think:

Idea → visual reaction → transformation → new information → composition shift → next idea.

The entire video should feel like one connected visual system.

Elements should:

* enter
* move
* transform
* overlap
* react
* exit
* become part of the next composition

Avoid fully resetting the canvas between every narration segment.

---

# 2. PRIMARY CREATIVE RULE

DO NOT TURN THE SCRIPT INTO ANIMATED CAPTIONS.

This is the most important rule in this document.

The narration provides the message.

The visuals should interpret, explain, support, or amplify the message.

BAD:

Narration:

"Getting your first 100 customers is difficult."

Visual:

Large centered text displaying:

GETTING YOUR FIRST
100 CUSTOMERS
IS DIFFICULT

GOOD:

Narration:

"Getting your first 100 customers is difficult."

Visual:

* oversized "0"
* customer avatars entering the canvas
* progress line moving toward 100
* counter increasing
* small annotation reading "EARLY STAGE"
* visual friction as progress slows

Always ask:

"What is the visual concept behind this sentence?"

Never ask only:

"How should I animate this text?"

---

# 3. SCENE PLANNING SYSTEM

Before writing animation code, create a motion plan.

For every narration segment, define:

## Message

What is the narration communicating?

## Primary Visual Concept

What object, diagram, number, image, interface, graph, or composition represents the idea?

## Composition

Where are the elements positioned?

## Primary Entrance

How does the main visual enter?

## Secondary Motion

What happens after the main entrance?

## Exit or Transformation

How does the composition evolve?

## Connection

How does this scene visually connect to the next idea?

Do not start implementation until this motion plan exists.

---

# 4. MOTION DENSITY

The target style requires high motion density.

Meaningful visual activity should happen approximately every:

0.5 to 1.5 seconds.

This does NOT mean everything should constantly move.

It means the viewer should continuously receive new visual information.

Possible visual events:

* text reveal
* word entrance
* number change
* line animation
* card movement
* object scale
* background change
* label appearance
* image entrance
* highlight expansion
* object rotation
* graph animation
* composition shift
* element exit
* transition beginning

Avoid scenes where all elements enter simultaneously and remain static.

BAD MOTION STRUCTURE:

0.0s: Everything enters.

0.8s: Animation finishes.

0.8s to 4.0s: Nothing happens.

4.0s: Everything exits.

GOOD MOTION STRUCTURE:

0.0s: Primary headline enters.

0.4s: Supporting line draws.

0.8s: Small annotation appears.

1.2s: Graphic enters.

1.8s: Important number scales.

2.4s: Existing elements shift position.

3.0s: Next visual starts entering.

3.5s: Previous composition transforms into the next scene.

---

# 5. ANIMATION OVERLAP

Animations should frequently overlap.

Avoid:

animate in
wait
animate out
wait
next scene

Prefer:

element enters
secondary element enters before first animation fully settles
graphic starts moving
annotation appears
previous element begins exiting
next scene starts entering
transition completes

The composition should rarely feel completely finished.

Visual momentum should continue throughout the video.

---

# 6. COMPOSITION RULES

Avoid default centered compositions.

Do not repeatedly use:

* centered headline
* centered subtitle
* centered card
* centered graphic
* centered CTA

Use asymmetrical editorial layouts.

Preferred placements:

* upper left
* lower left
* left aligned
* right aligned
* slightly off center
* near viewport edges
* partially outside viewport
* overlapping another element

Create contrast between:

* large and small
* empty and dense
* aligned and offset
* static and moving

Use negative space intentionally.

Do not fill every empty area.

---

# 7. COMPOSITION VARIETY

Every consecutive scene should have a noticeably different composition.

Avoid repeating the same layout twice in a row.

Possible composition patterns:

## Layout A

Large left-aligned headline.

Small visual element on right.

Tiny annotation near bottom.

## Layout B

Oversized number occupying most of the canvas.

Small supporting text.

Thin horizontal line.

## Layout C

Floating cards arranged asymmetrically.

Small headline.

Background grid.

## Layout D

Split-screen comparison.

Two contrasting visual systems.

## Layout E

Large image partially outside viewport.

Text overlapping image.

Small technical labels.

## Layout F

Diagram or process flow.

Connected nodes.

Animated directional lines.

## Layout G

Full-screen typography.

One highlighted word.

Minimal secondary elements.

## Layout H

Data visualization.

Graph.

Large metric.

Tiny supporting annotation.

Rotate between composition systems.

Do not establish a single reusable scene template.

---

# 8. VISUAL LAYERING

Most scenes should contain between 3 and 6 meaningful visual layers.

Possible layers:

1. Background system.

2. Primary headline or visual.

3. Supporting graphic.

4. Secondary annotation.

5. Line, divider, or connector.

6. Small detail.

Examples of secondary details:

* tiny monospace labels
* coordinates
* timestamps
* progress indicators
* category names
* arrows
* thin lines
* small numbers
* brackets
* labels
* subtle grid elements

Do not add details randomly.

Every layer should support:

* hierarchy
* storytelling
* movement
* composition

---

# 9. TYPOGRAPHY SYSTEM

Typography should have strong visual contrast.

Use multiple scales.

## Display Typography

Purpose:

High-impact statements and important concepts.

Characteristics:

* oversized
* bold
* dominant
* sometimes cropped by viewport
* capable of becoming the main graphic element

## Primary Headline

Purpose:

Main message.

Characteristics:

* strong hierarchy
* short
* direct
* often left aligned

## Supporting Copy

Purpose:

Additional context.

Characteristics:

* smaller
* visually secondary
* limited word count

## Technical Annotation

Purpose:

Editorial detail.

Characteristics:

* tiny
* uppercase
* monospace when appropriate
* increased letter spacing

## Numeric Typography

Purpose:

Metrics, percentages, statistics, steps.

Characteristics:

* oversized
* high visual impact
* animated independently

---

# 10. TYPOGRAPHY RULES

Do not repeatedly use:

small label
large headline
small subtitle

Vary the hierarchy.

Examples:

Scene 1:

Huge number + tiny annotation.

Scene 2:

Medium headline + large graphic.

Scene 3:

Full-screen word.

Scene 4:

Small text + multiple cards.

Scene 5:

Large quote + highlighted keyword.

Scene 6:

Diagram + minimal text.

Typography should sometimes:

* enter word by word
* enter line by line
* reveal through masks
* scale rapidly
* move independently
* become cropped
* transform into another visual
* push other elements away

---

# 11. TEXT LENGTH

Avoid displaying complete narration sentences.

Shorten on-screen text.

Narration:

"Most founders struggle to find their first hundred customers."

Possible on-screen text:

FIRST
100
CUSTOMERS

or:

0 → 100

or:

EARLY STAGE
CUSTOMER ACQUISITION

Use the narration for explanation.

Use visuals for impact and understanding.

---

# 12. VISUAL STORYTELLING

Translate abstract ideas into visual systems.

## Growth

Use:

* graphs
* rising numbers
* expanding shapes
* increasing counters
* stacked objects

## Decline

Use:

* falling graphs
* shrinking objects
* disappearing elements
* decreasing counters

## Process

Use:

* connected nodes
* directional lines
* steps
* moving objects
* progress systems

## Comparison

Use:

* split layouts
* opposing sides
* contrasting sizes
* before and after compositions

## Speed

Use:

* rapid movement
* directional lines
* compressed timing
* quick counters

## Complexity

Use:

* multiple connected objects
* layered diagrams
* expanding systems

## Simplicity

Use:

* removal of elements
* reduction
* one dominant object
* clean composition

## Money

Use:

* large numbers
* counters
* charts
* transaction cards
* value changes

## Customers

Use:

* avatars
* counters
* progress systems
* customer cards
* groups

## Tasks

Use:

* checklists
* progress bars
* cards
* completion animations

Always search for the strongest visual interpretation.

---

# 13. BACKGROUND SYSTEM

The background is part of the animation.

Do not treat the background as a static container.

Possible background treatments:

* subtle grid
* plain neutral canvas
* full-screen brand color
* sliding panels
* oversized shapes
* changing sections
* masked color areas

Background changes should create rhythm.

Use full-screen brand color interruptions for:

* important statements
* transitions
* section changes
* visual emphasis

Avoid changing background color for every scene.

The changes should feel intentional.

---

# 14. TRANSITION SYSTEM

Transitions should feel connected to the composition.

Preferred transitions:

* hard cuts
* directional wipes
* object-driven wipes
* full-screen panels
* scale transitions
* mask reveals
* elements pushing the canvas
* oversized typography filling the screen
* cards moving across the viewport
* background transformation

Avoid excessive:

* cross fades
* opacity fades
* slow dissolves
* generic slide transitions

A transition should usually take:

150ms to 500ms.

Some major section transitions may take longer.

---

# 15. OBJECT CONTINUITY

Whenever possible, reuse existing elements.

Examples:

A line from Scene 1 extends and becomes a graph in Scene 2.

A card scales up and becomes the background of Scene 3.

A number moves to the corner and becomes a statistic in Scene 4.

A highlighted word expands into a full-screen color transition.

An image moves outside the viewport while the next composition enters.

A progress bar becomes a divider line.

This creates visual continuity.

Avoid destroying the entire DOM or canvas and rebuilding a completely unrelated scene after every sentence.

---

# 16. MOTION CHARACTER

Motion should feel:

* fast
* controlled
* responsive
* editorial
* intentional
* slightly aggressive

Motion should NOT feel:

* slow
* soft
* floaty
* corporate
* generic
* presentation-like

Avoid excessive bouncing.

Avoid exaggerated spring effects.

Avoid playful animation unless the content requires it.

---

# 17. EASING SYSTEM

Do not apply one easing curve globally.

Use animation-specific easing.

## Primary Entrances

Use:

fast ease-out.

Goal:

Immediate impact with controlled settling.

## Cards

Use:

translate
slight rotation
small scale adjustment

Cards may have minimal overshoot.

## Small Labels

Use:

quick opacity
small translate

Keep animation short.

## Numbers

Use:

fast scale
counter animation
strong ease-out

## Lines

Use:

width animation
height animation
SVG path animation

## Background Panels

Use:

fast directional movement
strong easing

## Exits

Exits should often be faster than entrances.

The viewer should feel pulled toward the next idea.

---

# 18. DEFAULT TIMING GUIDELINES

Use these as starting points.

Do not apply them mechanically.

Small label entrance:

150ms to 300ms.

Headline entrance:

250ms to 600ms.

Card entrance:

300ms to 700ms.

Number animation:

300ms to 800ms.

Line drawing:

300ms to 1000ms.

Micro-animation:

200ms to 600ms.

Scene wipe:

150ms to 500ms.

Major composition transformation:

500ms to 1200ms.

Avoid long animations without a storytelling reason.

---

# 19. EDITORIAL IMPERFECTION

The design should not feel mathematically perfect.

Add controlled imperfection.

Possible techniques:

* slight card rotation
* offset placement
* cropped objects
* elements extending outside viewport
* overlapping layers
* asymmetrical spacing
* offset shadows
* thin technical lines
* unexpected annotation placement

Do not randomly rotate every object.

Do not intentionally create poor alignment.

The goal is controlled visual tension.

---

# 20. IMAGE TREATMENT

Images should feel integrated into the composition.

Avoid placing every image inside a perfectly centered rectangular card.

Possible treatments:

* slight rotation
* cropped edges
* partial viewport placement
* overlapping typography
* offset shadow
* animated mask reveal
* rapid scale entrance
* image moving behind text
* image becoming part of a transition

Images should support the narration.

Do not use decorative images without storytelling value.

---

# 21. GRAPHICS AND INFOGRAPHICS

Prefer custom simple graphics over generic icons.

Possible visual elements:

* graphs
* diagrams
* counters
* progress indicators
* timelines
* cards
* nodes
* connectors
* equations
* checklists
* simplified interfaces
* comparison systems

Keep graphics visually simple.

Animate individual parts independently.

Example:

Do not reveal an entire graph at once.

Instead:

1. Axis appears.

2. Line draws.

3. Data point appears.

4. Number scales.

5. Annotation enters.

---

# 22. MICRO-ANIMATIONS

Use micro-animations to maintain visual momentum.

Examples:

* blinking cursor
* moving progress line
* changing counter
* subtle card movement
* animated underline
* small label appearing
* dot moving along a path
* graph point pulsing once
* line extending
* highlight expanding

Micro-animations should support the main visual.

Do not add meaningless movement.

---

# 23. SCENE EXIT RULES

Do not automatically fade out the entire scene.

Preferred exits:

* push elements outside viewport
* scale object until it fills the screen
* move card across the canvas
* collapse elements
* transform element
* cover scene with color panel
* allow next scene to enter over current scene
* use existing element as transition

Full-scene opacity fades should be rare.

---

# 24. FORBIDDEN PATTERNS

Avoid these patterns unless explicitly requested.

## Pattern 1

Centered label.

Centered headline.

Centered subtitle.

Wait.

Fade out.

Repeat.

## Pattern 2

Every scene uses the same entrance animation.

## Pattern 3

All elements enter simultaneously.

## Pattern 4

Long static holds.

## Pattern 5

Complete narration displayed as text.

## Pattern 6

Generic fade transitions between scenes.

## Pattern 7

Every scene resets the entire canvas.

## Pattern 8

Excessive symmetrical layouts.

## Pattern 9

Decorative graphics unrelated to narration.

## Pattern 10

Using one animation preset globally.

## Pattern 11

Animating every element with spring physics.

## Pattern 12

Treating scenes like website sections.

## Pattern 13

Treating the video like a presentation deck.

## Pattern 14

Using typography as the only storytelling device.

---

# 25. QUALITY CONTROL CHECKLIST

Before finalizing any video, review every scene.

Ask:

* Does meaningful visual activity happen every 0.5 to 1.5 seconds?

* Are there long static sections?

* Does each scene visually interpret the narration?

* Are consecutive compositions noticeably different?

* Is everything unnecessarily centered?

* Are animations overlapping?

* Does the video feel continuous?

* Are existing objects reused between scenes?

* Is typography hierarchy varied?

* Are there enough secondary details?

* Are transitions driven by objects and composition?

* Are images integrated into the layout?

* Does the background participate in the motion?

* Are micro-animations meaningful?

* Does the output feel like an After Effects motion graphic?

* Does any section feel like PowerPoint?

* Does any section feel like a website carousel?

* Does any section feel like animated subtitles?

If the answer to any of the final three questions is yes, redesign the section.

---

# 26. IMPLEMENTATION WORKFLOW

Follow this workflow for every video.

## STEP 1: ANALYZE THE SCRIPT

Break the narration into meaningful ideas.

Do not automatically create one scene per sentence.

Group related ideas.

Split complex ideas.

## STEP 2: IDENTIFY VISUAL CONCEPTS

For every idea, define the strongest visual representation.

Prioritize:

* objects
* diagrams
* numbers
* images
* graphs
* visual transformations

Do not default to text.

## STEP 3: CREATE THE MOTION PLAN

Define:

* message
* visual concept
* composition
* entrance
* secondary animation
* transformation
* connection

## STEP 4: CHECK COMPOSITION VARIETY

Compare consecutive scenes.

If two scenes use similar layouts, redesign one.

## STEP 5: CHECK MOTION DENSITY

Review the timeline.

Find sections longer than 1.5 seconds without meaningful visual progression.

Add:

* secondary information
* micro-animation
* transformation
* early entrance of the next element

## STEP 6: IMPLEMENT

Write the animation code.

Use reusable components for technical consistency.

Do NOT use reusable components in ways that make every scene visually identical.

## STEP 7: REVIEW THE FULL VIDEO

Watch the complete composition.

Do not review scenes only in isolation.

Check rhythm.

Check continuity.

Check visual variety.

Check motion density.

## STEP 8: REMOVE SLIDESHOW BEHAVIOR

Find every section following:

enter
hold
exit
next scene

Redesign those sections with overlapping animation and visual continuity.

---

# 27. FINAL CREATIVE DIRECTIVE

The goal is not to animate text.

The goal is to visually interpret ideas through motion.

Every video should feel like a continuous editorial composition built by a professional motion designer.

Prioritize:

1. Visual storytelling.

2. Continuous motion.

3. Asymmetrical composition.

4. Motion density.

5. Typography contrast.

6. Scene variety.

7. Object continuity.

8. Layered compositions.

9. Fast intentional transitions.

10. Controlled editorial imperfection.

When choosing between a simple text animation and a visual representation of the idea, choose the visual representation.

When choosing between resetting the scene and transforming the existing composition, choose transformation.

When choosing between perfect symmetry and editorial tension, choose editorial tension.

When choosing between a static hold and meaningful visual progression, choose visual progression.

The final output should feel designed, animated, and directed.

It should never feel generated from a slideshow template.
