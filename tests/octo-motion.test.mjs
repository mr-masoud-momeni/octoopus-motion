import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleEntrance,
  sampleIdle,
  sampleGaze,
  sampleBlink,
  sampleMouth,
  sampleOctoMotion
} from "../engine/octo/motion.mjs";

test("entrance starts below frame and settles at zero", () => {
  const config = { start: 0.05, duration: 0.95, from: 980 };
  assert.equal(sampleEntrance(0, config).y, 980);
  assert.ok(Math.abs(sampleEntrance(1.0, config).y) < 0.001);
});

test("entrance and idle samples are deterministic", () => {
  const a = sampleOctoMotion(1.25);
  const b = sampleOctoMotion(1.25);
  assert.deepEqual(a, b);
});

test("idle motion keeps four independently phased tentacles", () => {
  const pose = sampleIdle(2.1, 1);
  assert.equal(pose.tentacleAngles.length, 4);
  assert.ok(pose.tentacleAngles.every(Number.isFinite));
});

test("gaze reaches the next beat target smoothly", () => {
  const beats = [
    { t0: 0, t1: 2, gaze: [0, 0] },
    { t0: 2, t1: 4, gaze: [1, -1] }
  ];
  assert.deepEqual(sampleGaze(2.45, beats), [1, -1]);
});

test("blink returns to the resting eye scale outside a blink", () => {
  assert.equal(sampleBlink(0, [1]), 1);
  assert.equal(sampleBlink(1.2, [1]), 1);
});

test("mouth crossfades from previous to current beat", () => {
  const beats = [
    { t0: 0, mouth: "happy" },
    { t0: 2, mouth: "surprise" }
  ];
  const pose = sampleMouth(2.05, beats);
  assert.equal(pose.happy, 0.5);
  assert.equal(pose.surprise, 0.5);
});
