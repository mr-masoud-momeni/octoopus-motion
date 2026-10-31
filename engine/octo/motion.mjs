/**
 * Octo's shared motion language.
 *
 * The numeric defaults intentionally preserve the movement character of
 * octo-reels/template/reel-01.html (REEL ENGINE v2). Keep this module
 * deterministic: the same timestamp must always produce the same pose.
 */

export const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export const lerp = (from, to, amount) => from + (to - from) * amount;

export const progress = (time, start, duration) =>
  clamp((time - start) / Math.max(0.000001, duration));

export const ease = {
  linear: t => t,
  inCubic: t => t * t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: (t, overshoot = 1.05) =>
    1 + (overshoot + 1) * Math.pow(t - 1, 3) +
    overshoot * Math.pow(t - 1, 2)
};

/**
 * Original soft rise from reel-01: a slightly overshooting entrance,
 * followed by a gentle landing/squash. Values are in SVG/local units.
 */
export function sampleEntrance(time, config = {}) {
  const start = config.start ?? 0.05;
  const duration = config.duration ?? 0.95;
  const from = config.from ?? 980;
  const p = progress(time, start, duration);
  const y = lerp(from, 0, ease.outBack(p, config.overshoot ?? 1.05));
  const landAt = start + duration * 0.82;
  const squash = 0.075 * Math.sin(Math.PI * progress(time, landAt, 0.4));

  return {
    progress: p,
    y,
    squash,
    scaleX: 1 + squash * 0.55,
    scaleY: (1 - squash) * (1 + Math.sin(time * 1.85) * 0.006)
  };
}

/** Subtle breathing and independent tentacle sway from the reference reel. */
export function sampleIdle(time, entranceProgress = 1) {
  const breathPhase = time * 1.85;
  const swayAmplitude = 1.4 + (1 - entranceProgress) * 5;
  const phases = [0, 0.6, 1.2, 1.8];
  const directions = [-1, -1, 1, 1];

  return {
    breathY: Math.sin(breathPhase) * 5,
    breathScale: 1 + Math.sin(breathPhase) * 0.006,
    tentacleAngles: phases.map((phase, index) =>
      Math.sin(time * 2.1 + phase) * swayAmplitude * directions[index]
    )
  };
}

/** Smoothly interpolate gaze between beat targets (normalized -1..1). */
export function sampleGaze(time, beats = [], transitionDuration = 0.45) {
  if (!beats.length) return [0, 0];

  let index = 0;
  for (let i = 0; i < beats.length; i++) {
    if (time >= beats[i].t0) index = i;
  }

  const current = beats[index].gaze ?? [0, 0];
  if (index === 0) return [...current];

  const previous = beats[index - 1].gaze ?? [0, 0];
  const amount = ease.inOutCubic(
    progress(time, beats[index].t0, transitionDuration)
  );

  return [
    lerp(previous[0], current[0], amount),
    lerp(previous[1], current[1], amount)
  ];
}

/** Deterministic blink envelope; useful both in preview and frame rendering. */
export function sampleBlink(time, blinkTimes = [], duration = 0.16) {
  let scaleY = 1;
  for (const blinkTime of blinkTimes) {
    const p = (time - blinkTime) / duration;
    if (p > 0 && p < 1) {
      scaleY = Math.min(scaleY, 1 - 0.94 * Math.sin(Math.PI * p));
    }
  }
  return scaleY;
}

/** Build the reference reel's beat-relative blink schedule. */
export function buildBlinkTimes(beats = [], explicitTimes = []) {
  const times = [...explicitTimes];
  for (const beat of beats) {
    const length = Math.max(0.6, beat.t1 - beat.t0);
    times.push(
      beat.t0 + Math.min(0.5, length * 0.18),
      beat.t0 + Math.min(0.85, length * 0.32),
      beat.t0 + length * 0.74
    );
  }
  return times;
}

/** Mouth expression weights crossfade at beat boundaries. */
export function sampleMouth(time, beats = []) {
  const weights = { happy: 0, sad: 0, surprise: 0 };
  if (!beats.length) return weights;

  let index = 0;
  for (let i = 0; i < beats.length; i++) {
    if (time >= beats[i].t0) index = i;
  }

  const current = beats[index];
  const amount = progress(time, current.t0, 0.1);
  if (current.mouth in weights) weights[current.mouth] = amount;

  if (index > 0) {
    const previous = beats[index - 1].mouth;
    if (previous in weights) weights[previous] += 1 - amount;
  }
  return weights;
}

/**
 * Complete pose sample consumed by any project renderer.
 * This deliberately returns data only; it never mutates DOM/SVG state.
 */
export function sampleOctoMotion(time, config = {}) {
  const beats = config.beats ?? [];
  const entrance = sampleEntrance(time, config.entrance);
  const idle = sampleIdle(time, entrance.progress);
  const gaze = sampleGaze(time, beats, config.gazeTransition ?? 0.45);
  const blinkTimes = buildBlinkTimes(beats, config.blinks ?? []);

  return {
    entrance,
    idle,
    gaze,
    pupilOffset: { x: gaze[0] * 9, y: gaze[1] * 7 },
    blinkScaleY: sampleBlink(time, blinkTimes),
    mouth: sampleMouth(time, beats)
  };
}
