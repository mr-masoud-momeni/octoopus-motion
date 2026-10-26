/**
 * یک‌دستوری: از صدای ضبط‌شده تا ویدیوی نهایی.
 *
 *   node scripts/build.mjs
 *
 * کارهایی که انجام می‌دهد:
 *   ۱) فایل صدا را در پوشهٔ audio/ پیدا می‌کند (voice.wav یا هر فایل صوتی دیگر)
 *   ۲) ضبط را «فشرده» می‌کند: مکث‌های بلند حذف، صدا یکنواخت و کمی نزدیک‌تر
 *   ۳) با timing.mjs تایم‌لاین را از روی صدای فشرده می‌سازد
 *   ۴) با render.mjs ویدیوی نهایی را با صدا و افکت رندر می‌کند
 *
 * نتیجه: out/reel-01.mp4
 *
 * تنظیمات (اختیاری):
 *   node scripts/build.mjs --speed 1.08     سرعت صدا
 *   node scripts/build.mjs --cut 1.2        مکث‌های بیشتر از این حذف شوند
 *   node scripts/build.mjs --keep 0.4        این مقدار سکوت بین جمله‌ها بماند
 *   node scripts/build.mjs --raw             بدون فشرده‌سازی (صدای خام)
 */
import { spawn } from "node:child_process";
import { readdir, stat, access, mkdir } from "node:fs/promises";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectSpeech, compressVoice, denoiseVoice, duration } from "./audio.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIO_DIR = join(ROOT, "audio");
const AUDIO_EXT = [".wav", ".m4a", ".mp3", ".aac", ".ogg", ".flac", ".wma", ".opus"];
const SCRIPT_FILE = join(AUDIO_DIR, "script.txt");

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf("--" + name);
  return i > -1 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : fallback;
};
const HTML = argv.find(a => a.endsWith(".html")) || "reel-01.html";
const OUT = argv.find(a => a.endsWith(".mp4")) || "reel-01.mp4";
const SPEED = parseFloat(flag("speed", "1.0"));
const CUT = parseFloat(flag("cut", "0.8"));      // مکث‌های بلندتر از این بریده می‌شن
const KEEP = parseFloat(flag("keep", "0.4"));    // این مقدار سکوت بین جمله‌ها می‌مونه
const RAW = argv.includes("--raw");
const READALONG = argv.includes("--readalong");

function run(cmd, args, label) {
  return new Promise((res, rej) => {
    console.log(`\n── ${label} ──`);
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${label} failed (code ${c})`))));
  });
}

/* ---------- ۱) پیدا کردن فایل صدا ---------- */
let voice = null;
try {
  const files = await readdir(AUDIO_DIR);
  const cands = [];
  for (const f of files) {
    if (f === "script.txt" || f.startsWith("voice-clean")) continue;
    if (!AUDIO_EXT.includes(extname(f).toLowerCase())) continue;
    const s = await stat(join(AUDIO_DIR, f));
    cands.push({ f, mtime: s.mtimeMs });
  }
  cands.sort((a, b) => b.mtime - a.mtime);
  if (cands.length) {
    voice = join(AUDIO_DIR, cands[0].f);
    if (cands.length > 1) {
      console.log(`⚠ چند فایل صوتی پیدا شد؛ جدیدترین انتخاب شد: ${cands[0].f}`);
      console.log("   بقیه: " + cands.slice(1).map(c => c.f).join(", "));
    }
  }
} catch { }

if (!voice) {
  console.log(`
✗ فایل صدا پیدا نشد.

  اینجا بذارش:
    ${AUDIO_DIR}\\voice.wav

  (هر فرمتی: wav / m4a / mp3 / aac / ogg / flac)
  بعد دوباره این دستور رو بزن:
    node scripts/build.mjs
`);
  process.exit(1);
}
console.log("✓ فایل صدا:", voice);
try { await access(SCRIPT_FILE); }
catch { console.log("⚠ اسکریپت خواندن پیدا نشد:", SCRIPT_FILE); }

/* ---------- ۲) حذف نویز و فشرده‌سازی ضبط ---------- */
const outDir = join(ROOT, "out");
await mkdir(outDir, { recursive: true });
const denoisedFile = join(outDir, "voice-denoised.wav");
const cleanFile = join(outDir, "voice-clean.wav");
let audioForRender = voice;

// حذف نویز محیط (همیشه)
console.log("\n── ۰/۳ — حذف نویز ──");
await denoiseVoice(voice, denoisedFile, { amount: 14 });
console.log(`✓ نویز حذف شد → out/voice-denoised.wav  (${(await duration(denoisedFile)).toFixed(1)}s)`);
audioForRender = denoisedFile;

if (!RAW && !READALONG) {
  const lines = (await (await import("node:fs/promises")).readFile(SCRIPT_FILE, "utf8"))
    .split(/\r?\n/).map(s => s.replace(/\s*#.*$/, "").trim()).filter(Boolean);
  const res = await compressVoice(audioForRender, cleanFile, {
    cutAfter: CUT, keep: KEEP, speed: SPEED
  });
  console.log(`✓ ضبط فشرده شد: ${(await duration(audioForRender)).toFixed(1)}s → ${res.total.toFixed(1)}s` +
    (SPEED !== 1 ? `  (سرعت ${SPEED}×)` : ""));
  audioForRender = res.file;
}

/* ---------- ۳) تایم‌لاین ---------- */
const timingOut = join(ROOT, "timing.json");

if (READALONG) {
  // حالت «بخوان روی ویدیو»: تایم‌لاین ویدیو ثابت می‌ماند و صدا روی آن می‌نشیند
  console.log("\n── حالت: خواندن روی ویدیو ──");
  await run(process.execPath, [
    join(ROOT, "scripts", "render.mjs"),
    "--html", HTML,
    "--dump-timeline"
  ], "۱/۳ — برداشتن تایم‌لاین طراحی‌شده");

  const guide = [];
  const tl = JSON.parse(await (await import("node:fs/promises")).readFile(join(ROOT, "out", "timeline.json"), "utf8"));
  tl.beats.forEach((b, i) => guide.push({ key: `b${i}`, t0: b.t0 }));
  tl.cards.forEach(c => guide.push({ key: `c${c.i}`, t0: c.t }));
  tl.questions.forEach(q => guide.push({ key: `q${q.i}`, t0: q.t }));
  guide.sort((a, b) => a.t0 - b.t0);
  // هر جمله تا لحظهٔ جملهٔ بعدی وقت دارد
  const vidEnd = Math.max(...tl.beats.map(b => b.t1)) + 0.6;
  for (let i = 0; i < guide.length; i++) {
    guide[i].t1 = i < guide.length - 1 ? guide[i + 1].t0 - 0.05 : vidEnd;
  }
  const scriptLines = (await (await import("node:fs/promises")).readFile(SCRIPT_FILE, "utf8"))
    .split(/\r?\n/).map(s => s.replace(/\s*#.*$/, "").trim()).filter(Boolean);
  const pace = [
    "راهنمای ریتم خواندن — بین هر دو خط، متن درج‌شده را بخوان:",
    ""
  ];
  guide.forEach(g => {
    const ln = scriptLines.find(l => l.startsWith(g.key + " |"));
    const text = ln ? ln.split("|").slice(1).join("|").trim() : "";
    pace.push(`${g.t0.toFixed(1).padStart(5)}s → ${g.t1.toFixed(1).padStart(5)}s  (${(g.t1 - g.t0).toFixed(2)}s)  ${g.key.padEnd(3)} ${text}`);
  });
  await (await import("node:fs/promises")).writeFile(join(ROOT, "out", "pace-guide.txt"), pace.join("\n"), "utf8");
  console.log("راهنمای ریتم: out/pace-guide.txt");

  // نشاندن صدا روی تایم‌لاین
  await run(process.execPath, [
    join(ROOT, "scripts", "fit.mjs"),
    "--audio", voice,
    "--timeline", join(ROOT, "out", "timeline.json"),
    "--lines", SCRIPT_FILE,
    "--out", join(ROOT, "out", "voice-fitted.wav")
  ], "۲/۳ — نشاندن صدا روی تایم‌لاین ویدیو");
  audioForRender = join(ROOT, "out", "voice-fitted.wav");
} else {
  await run(process.execPath, [
    join(ROOT, "scripts", "timing.mjs"),
    "--audio", audioForRender,
    "--lines", SCRIPT_FILE,
    "--out", timingOut
  ], "۱/۲ — ساخت تایم‌لاین از روی صدا");
}

/* ---------- ۴) رندر ---------- */
const renderArgs = [
  join(ROOT, "scripts", "render.mjs"),
  "--html", HTML,
  "--video",
  "--audio", audioForRender,
  "--sfx",
  "--out", OUT
];
if (!READALONG) renderArgs.push("--timing", timingOut);
await run(process.execPath, renderArgs, READALONG ? "۳/۳ — رندر ویدیوی ثابت با صدای نشسته" : "۲/۲ — رندر ویدیو با صدا و افکت");

console.log(`\n✓ آماده شد: out/${OUT}`);
