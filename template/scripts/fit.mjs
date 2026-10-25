/**
 * نشاندن صدای ضبط‌شده روی تایم‌لاین طراحی‌شدهٔ ویدیو.
 *
 *   node scripts/fit.mjs --audio audio/voice.m4a --timeline out/timeline.json \
 *                         --lines audio/script.txt --out out/voice-fitted.wav
 *
 * چطور کار می‌کند:
 *   ۱) جمله‌های ضبط‌شده پیدا می‌شوند (تشخیص مکث)
 *   ۲) هر جمله به پنجرهٔ زمانی خودش در ویدیو می‌نشیند:
 *        - اگر زودتر تمام شود، سکوت تا شروع پنجرهٔ بعدی پر می‌شود
 *        - اگر طولانی‌تر باشد، کمی تندتر می‌شود تا جا شود (حداکثر ۲۰٪)
 *   ۳) خروجی یک فایل صوتی هم‌طول با ویدیو است که فقط باید میکس شود
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { detectSilences, duration, runFfmpeg } from "./audio.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf("--" + name);
  return i > -1 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : fallback;
};
const rel = p => (isAbsolute(p) ? p : join(ROOT, p));

const AUDIO = flag("audio");
const TIMELINE = flag("timeline", "out/timeline.json");
const LINES = flag("lines", "audio/script.txt");
const OUT = flag("out", "out/voice-fitted.wav");
const PAD = 0.08;

if (!AUDIO) {
  console.error("usage: node scripts/fit.mjs --audio voice.m4a [--timeline out/timeline.json] [--out out/voice-fitted.wav]");
  process.exit(1);
}

/* ---------- ۱) اسکریپت و تایم‌لاین ---------- */
const lines = (await readFile(rel(LINES), "utf8"))
  .split(/\r?\n/).map(s => s.replace(/\s*#.*$/, "").trim()).filter(Boolean)
  .map(s => {
    const i = s.indexOf("|");
    if (i < 0) return { key: null, text: s.trim() };
    return { key: s.slice(0, i).trim(), text: s.slice(i + 1).trim() };
  });
const timeline = JSON.parse(await readFile(rel(TIMELINE), "utf8"));

// پنجرهٔ زمانی هر جمله: بیت‌ها برای b*، و برای c*/q* از تایم کارت/سوال
const wins = [];
timeline.beats.forEach((b, i) => {
  const ln = lines.find(l => l.key === `b${i}`);
  if (ln) wins.push({ key: ln.key, text: ln.text, t0: b.t0 });
});
timeline.cards.forEach(c => {
  const ln = lines.find(l => l.key === `c${c.i}`);
  if (ln) wins.push({ key: ln.key, text: ln.text, t0: c.t });
});
timeline.questions.forEach(q => {
  const ln = lines.find(l => l.key === `q${q.i}`);
  if (ln) wins.push({ key: ln.key, text: ln.text, t0: q.t });
});
wins.sort((a, b) => a.t0 - b.t0);
// هر جمله تا لحظهٔ جملهٔ بعدی وقت دارد (و آخری تا پایان ویدیو)
const videoEnd = Math.max(...timeline.beats.map(b => b.t1)) + 0.6;
for (let i = 0; i < wins.length; i++) {
  wins[i].t1 = i < wins.length - 1 ? wins[i + 1].t0 - 0.05 : videoEnd;
}
console.log(`پنجره‌های ویدیو: ${wins.length} | جمله‌های اسکریپت: ${lines.length}`);
wins.forEach(w => console.log(`  ${w.t0.toFixed(1).padStart(5)} → ${w.t1.toFixed(1).padStart(5)}  ${w.key}`));

/* ---------- ۲) پیدا کردن جمله‌ها در ضبط ---------- */
const N = lines.length;
const det = await detectSilences(rel(AUDIO), { minSilence: 0.35, expected: N });
console.log(`آستانه: ${det.th}dB | مکث‌ها: ${det.inner.length}`);

let bounds = [...det.inner].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, N - 1)
  .sort((a, b) => a[0] - b[0]);
if (det.inner.length < N - 1) {
  const spans = []; let cur = 0;
  for (const b of bounds) { spans.push([cur, b[0]]); cur = b[1]; }
  spans.push([cur, det.total]);
  let si = 0;
  for (let i = 1; i < spans.length; i++) {
    if (spans[i][1] - spans[i][0] > spans[si][1] - spans[si][0]) si = i;
  }
  const mid = (spans[si][0] + spans[si][1]) / 2;
  bounds.push([mid - 0.01, mid + 0.01]);
  bounds.sort((a, b) => a[0] - b[0]);
}

const segs = [];
let cur = 0;
for (const b of bounds) { segs.push([cur, b[0]]); cur = b[1]; }
segs.push([cur, det.total]);

/* ---------- ۳) جفت کردن با پنجره‌ها ---------- */
// ضبط ممکن است کمی جلوتر/عقب‌تر از ترتیب ویدیو باشد؛ با ترتیب برچسب‌ها جفت می‌کنیم
const recs = wins.map((w, i) => {
  const s = segs[i] || [0, 0];
  return { ...w, a: s[0], b: s[1] };
});

/* ---------- ۴) ساخت-track هم‌طول با ویدیو ---------- */
const total = Math.max(...timeline.beats.map(b => b.t1)) + 0.6;
const inputs = [];
const chains = [];
const labels = [];

for (let i = 0; i < recs.length; i++) {
  const r = recs[i];
  const dur = Math.max(0.15, r.b - r.a);
  const win = Math.max(0.4, r.t1 - r.t0 - 0.12);
  let speed = 1;
  if (dur > win) speed = Math.min(1.2, dur / win);

  // برش دقیق بخش مربوطه + تغییر سرعت
  const seg = join(ROOT, "out", `.seg${i}.wav`);
  const filt = speed > 1.001
    ? `atrim=${r.a.toFixed(3)}:${r.b.toFixed(3)},asetpts=N/SR/TB,atempo=${speed.toFixed(4)}`
    : `atrim=${r.a.toFixed(3)}:${r.b.toFixed(3)},asetpts=N/SR/TB`;
  await runFfmpeg(["-y", "-i", rel(AUDIO), "-af", filt, "-ar", "48000", "-ac", "1", seg]);

  const ms = Math.max(0, Math.round(r.t0 * 1000));
  inputs.push(seg);
  chains.push(`[${i}:a]adelay=${ms}|${ms},volume=1.0[v${i}]`);
  labels.push(`[v${i}]`);

  if (speed > 1.001) {
    console.log(`⚠ «${r.key}» ${dur.toFixed(1)}s بود ولی ${win.toFixed(1)}s جا داشت → ${(speed * 100 - 100).toFixed(0)}٪ تندتر شد`);
  }
}

// سکوتِ انتهایی + باقیمانده تا طول ویدیو
const args = ["-y"];
inputs.forEach(f => args.push("-i", f));
args.push(
  "-filter_complex",
  chains.join(";") + ";" + labels.join("") +
  `amix=inputs=${labels.length}:normalize=0:duration=longest[mix];` +
  `[mix]apad=whole_dur=${total.toFixed(2)}[aout]`,
  "-map", "[aout]", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "1", rel(OUT)
);
await runFfmpeg(args);

// پاک کردن فایل‌های موقت
for (const f of inputs) {
  await import("node:fs/promises").then(fs => fs.rm(f, { force: true }));
}

console.log(`\n✓ صدا روی تایم‌لاین نشست: ${rel(OUT)}  (${(await duration(rel(OUT))).toFixed(1)}s / ویدیو ${total.toFixed(1)}s)`);
