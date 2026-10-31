# Octo Character Engine

Octo is a shared character, not a per-reel illustration. Project files should
describe scenes and intent; they should not redefine Octo's body, face, idle
motion, entrance, gaze, or expressive behavior.

## Reference and non-regression rule

The source of truth for the initial motion language is
`octo-reels/template/reel-01.html` (REEL ENGINE v2). In particular, preserve:

- the soft rise from below the frame with a restrained overshoot;
- the landing squash and subtle breathing;
- independently phased tentacle sway;
- smooth gaze transitions between beat targets;
- deterministic blink timing and expression crossfades.

Do not replace these with generic CSS transitions, random per-frame movement,
or simple repeated up/down oscillation.

## Current module

`motion.mjs` contains pure, deterministic samplers. Given the same time and
configuration, it always returns the same pose. This is required by the
frame-by-frame Chrome renderer.

The module currently provides:

- `sampleEntrance(time, config)`
- `sampleIdle(time, entranceProgress)`
- `sampleGaze(time, beats, transitionDuration)`
- `buildBlinkTimes(beats, explicitTimes)`
- `sampleBlink(time, blinkTimes)`
- `sampleMouth(time, beats)`
- `sampleOctoMotion(time, config)`

The reference reel `octo-reels/template/reel-01.html` now imports this module
and uses it for the character's entrance, landing, breathing, tentacle sway,
gaze, blink, and mouth expression. Scene timing, camera, typography, monitor,
cursor, cards, and sound-event timing remain in the reel.

The SVG rig and its original numeric curves are intentionally preserved.
Semantic actions (point, explain, react, think, wave) are the next layer; they
must be added as layered pose tracks rather than replacing the base motion.

Run the deterministic regression tests from the repository root:

```bash
node --test tests/octo-motion.test.mjs
```

For a visual smoke test from `octo-reels/template`:

```bash
node scripts/render.mjs --html reel-01.html --stills 0.2,0.8,1.2,4.5,10,21,30,35
node scripts/render.mjs --html reel-01.html --video --out octo-engine-test.mp4
```

The first command creates stills in `octo-reels/template/out/stills`; the
second renders a full test video. Compare the entrance/landing, gaze changes,
blinks, and expressions with the previous `reel-01.html` output.

## Project contract (target)

A project supplies scene intent and targets, for example:

```js
{
  entrance: { start: 0.05, duration: 0.95, from: 980 },
  beats: [
    { t0: 0, t1: 3.5, gaze: [0.4, -0.2], mouth: "happy" }
  ],
  actions: [
    { action: "point", target: "shipping-price", start: 2.2, duration: 0.8 }
  ]
}
```

Projects should not contain a second copy of Octo's SVG or duplicate the
character's base movement implementation.

## Safety while migrating

Existing reels remain standalone and unchanged until the shared engine has
been visually compared against the reference reel. Migrate one project at a
time only after the reference motion passes a frame-by-frame comparison.
