import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSfxTrack } from "./sfx.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "out", "clinic-showcase-sfx.wav");

// افکت‌ها دقیقاً مطابق تایم‌لاین ریلز کلینیک؛ خروجی مستقل برای After Effects
const EVENTS = [
  { name: "whoosh", t: 0.2 },
  { name: "pop", t: 3.5 },
  { name: "sweep", t: 4.2 },
  { name: "sweep", t: 9.6 },
  { name: "sweep", t: 15.0 },
  { name: "sweep", t: 20.4 },
  { name: "sweep", t: 25.8 },
  { name: "reveal", t: 31.2 },
  { name: "rise", t: 41.35 },
  { name: "pop", t: 42.25 },
  { name: "ding", t: 43.1 },
];

await buildSfxTrack(EVENTS, OUT, 49.2);
console.log("افکت‌های صوتی آماده شد:");
console.log(OUT);
