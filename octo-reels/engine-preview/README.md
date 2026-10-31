# Octo Motion Engine Preview

A standalone browser preview for the shared Octo motion engine.

## Run locally

From the repository root, start a local static server:

```bash
py -m http.server 8000
```

Then open:

`http://localhost:8000/octo-reels/engine-preview/`

Use the controls to play/pause, scrub the timeline, change playback speed, and inspect gaze/expression presets.

The page imports `engine/octo/motion.mjs` and embeds the same SVG rig used by `octo-reels/template/reel-01.html`. It is a motion-engine test scene, not a finished reel.
