/**
 * ساخت تایم‌لاین از روی صدای ضبط‌شده.
 *
 *   node scripts/timing.mjs --audio out/voice-clean.wav --lines audio/script.txt --out timing.json
 *
 * روش کار:
 *   ۱) با ffmpeg silencedetect مکث‌های فایل صوتی را پیدا می‌کند
 *      (چند آستانه امتحان می‌شود تا با نویز ضبط گوشی هم درست کار کند)
 *   ۲) مکث‌های بین جمله‌ها را به‌عنوان مرز استفاده می‌کند:
 *      اگر مکث‌ها بیشتر از تعداد جمله‌ها بود، کوتاه‌ترین‌ها حذف می‌شوند
 *      (مکث کوتاه = مکث داخل جمله) و اگر کمتر بودند، بلندترین سکوت نصف می‌شود
 *   ۳) timing.json می‌سازد: هر خط با برچسب خودش زمان می‌گیرد
 *      (b0..b5 = تیترها، c0..c2 = کارت‌های علت، q0..q1 = سوال‌ها)
 *
 * فرمت فایل متنی — هر خط:
 *      برچسب | متنی که می‌خوانی
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { detectSilences, duration } from "./audio.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf("--" + name);
  return i > -1 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : fallback;
};
const rel = p => (isAbsolute(p) ? p : join(ROOT, p));

const AUDIO = flag("audio");
const LINES = flag("lines");
const OUT = flag("out", "timing.json");
const MIN_SIL = parseFloat(flag("minSilence", "0.4"));
const PAD = parseFloat(flag("pad", "0.06"));

if (!AUDIO || !LINES) {
  console.error("usage: node scripts/timing.mjs --audio voice.wav --lines script.txt [--out timing.json]");
  process.exit(1);
}

/* ---------- ۱) اسکریپت ---------- */
const raw = await readFile(rel(LINES), "utf8");
const lines = raw.split(/\r?\n/)
  .map(s => s.replace(/\s*#.*$/, "").trim())
  .filter(Boolean)
  .map(s => {
    const i = s.indexOf("|");
    if (i < 0) return { key: null, text: s.trim() };
    return { key: s.slice(0, i).trim(), text: s.slice(i + 1).trim() };
  });
const N = lines.length;
const total = await duration(rel(AUDIO));
console.log(`مدت فایل: ${total.toFixed(2)}s | جمله‌ها: ${N}`);

/* ---------- ۲) تشخیص مکث با چند آستانه ---------- */
const det = await detectSilences(rel(AUDIO), { minSilence: MIN_SIL, expected: N });
console.log(`→ آستانهٔ انتخاب‌شده: ${det.th}dB  (${det.inner.length} مکث)`);

/* ---------- ۳) مرزهای جمله‌ها ---------- */
let bounds = [...det.inner].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, N - 1)
  .sort((a, b) => a[0] - b[0]);
if (det.inner.length < N - 1) {
  // مرز کم است: بلندترین بخش گفتار را نصف می‌کنیم
  const spans = [];
  let cur = 0;
  for (const b of bounds) { spans.push([cur, b[0]]); cur = b[1]; }
  spans.push([cur, total]);
  let si = 0;
  for (let i = 1; i < spans.length; i++) {
    if (spans[i][1] - spans[i][0] > spans[si][1] - spans[si][0]) si = i;
  }
  const [a, b] = spans[si];
  const mid = (a + b) / 2;
  bounds.push([mid - 0.01, mid + 0.01]);
  bounds.sort((x, y) => x[0] - y[0]);
  console.log("  یک مرز داخل گفتار ساخته شد");
}

/* ---------- ۴) زمان هر جمله ---------- */
const marks = {};
const rows = [];
let cursor = 0;
for (let i = 0; i < N; i++) {
  const t0 = cursor;
  const t1 = i < bounds.length ? bounds[i][0] : total;
  cursor = i < bounds.length ? bounds[i][1] : total;
  const key = lines[i].key || `l${i}`;
  marks[key] = { t0: +Math.max(0, t0 - PAD).toFixed(3), t1: +Math.min(total, t1 + PAD).toFixed(3) };
  rows.push({ "#": i, "برچسب": key, "شروع": marks[key].t0, "پایان": marks[key].t1, "متن": lines[i].text.slice(0, 44) });
}

const last = rows.length ? rows[rows.length - 1].پایان : total;
const timing = { duration: +(last + 0.5).toFixed(3), marks };

await writeFile(rel(OUT), JSON.stringify(timing, null, 2), "utf8");
console.log(`\nنوشته شد: ${OUT}  (مدت کل: ${timing.duration}s)`);
console.table(rows);
console.log(`\nحالا رندر بگیر:\n  node scripts/build.mjs`);
