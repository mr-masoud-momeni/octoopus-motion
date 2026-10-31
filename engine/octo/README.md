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

These functions are the first extracted layer. The existing approved reel is
left untouched while the values are verified. The next integration step is to
connect this module to the reference reel's SVG rig, then add semantic actions
(point, explain, react, think, wave) as layered pose tracks rather than
replacing the base motion.

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
