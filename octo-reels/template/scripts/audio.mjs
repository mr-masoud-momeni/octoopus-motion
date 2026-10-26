/**
 * ابزارهای صوتی:
 *   - پیدا کردن آستانهٔ مناسب سکوت برای هر فایل (ضبط گوشی نویز داره)
 *   - «فشرده کردن» ضبط: حذف مکث‌های بلند و (اختیاری) کمی تندتر کردن صدا
 */
import { spawn } from "node:child_process";

export function ff(args) {
  return new Promise((res, rej) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", d => { err += d.toString(); });
    p.on("close", c => (c === 0 ? res(err) : rej(new Error(err.slice(-1200)))));
  });
}

export function runFfmpeg(args) {
  return new Promise((res, rej) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
    p.on("close", c => (c === 0 ? res() : rej(new Error("ffmpeg failed: " + args.join(" ")))));
  });
}

export async function duration(file) {
  const out = await ff(["-i", file, "-f", "null", "-"]);
  const m = out.match(/time=(\d+):(\d+):(\d+\.\d+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0;
}

/**
 * مکث‌های فایل صوتی را پیدا می‌کند.
 * معیار انتخاب آستانه: آستانه‌ای که «بلندترین مکث‌ها» بیشترین مجموع سکوت را بدهد
 * (مکث بلند بین جمله‌ها = مرز واقعی).
 */
export async function detectSilences(file, { minSilence = 0.4, expected = 0 } = {}) {
  const candidates = [-24, -26, -28, -30, -32, -34, -36, -38];
  const total = await duration(file);
  let best = null;
  for (const th of candidates) {
    const out = await ff([
      "-i", file,
      "-af", `silencedetect=noise=${th}dB:d=${minSilence}`,
      "-f", "null", "-"
    ]);
    const sil = [];
    let ps = null;
    for (const line of out.split(/\r?\n/)) {
      let mm = line.match(/silence_start:\s*(-?[\d.]+)/);
      if (mm) { ps = parseFloat(mm[1]); continue; }
      mm = line.match(/silence_end:\s*([\d.]+)/);
      if (mm && ps != null) { sil.push([Math.max(0, ps), parseFloat(mm[1])]); ps = null; }
    }
    if (ps != null) sil.push([ps, total]);

    const inner = sil.filter(([s, e]) => s > 0.15 && e < total - 0.15);
    const want = Math.max(0, (expected || 1) - 1);
    const keep = [...inner].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, want);
    const sum = keep.reduce((acc, s) => acc + (s[1] - s[0]), 0);
    if (!best || sum > best.sum) best = { th, sil, inner, sum, total, keep };
  }
  return best;
}

/** بخش‌های حرف زدن را با چند آستانه پیدا می‌کند و بهترین آستانه را برمی‌گرداند */
export async function detectSpeech(file, opts = {}) {
  const det = await detectSilences(file, opts);
  const sp = [];
  let cur = 0;
  for (const [s, e] of det.sil) {
    if (s - cur > 0.12) sp.push([cur, s]);
    cur = Math.max(cur, e);
  }
  if (det.total - cur > 0.12) sp.push([cur, det.total]);
  return { ...det, sp };
}

/**
 * حذف نویز محیط:
 *   - حذف ز rumble (زیر ۸۰ هرتز) و هیس بالای ۱۲ کیلوهرتز
 *   - کاهش نویز پس‌زمینه با afftdn (میزان قابل تنظیم)
 *   - یکسان‌سازی بلندی صدا
 */
export async function denoiseVoice(input, output, {
  amount = 14, floor = -30, normalize = true
} = {}) {
  const f = [
    "highpass=f=80",
    "lowpass=f=12000",
    `afftdn=nr=${amount}:nf=${floor}:tn=1`
  ];
  if (normalize) f.push("dynaudnorm=f=151:g=6:p=0.92:m=8");
  await runFfmpeg([
    "-y", "-i", input,
    "-af", f.join(","),
    "-ar", "48000", "-ac", "1",
    output
  ]);
  return output;
}

/**
 * فشرده‌سازی ضبط با محافظ:
 *   مکث‌های بلند بریده می‌شوند، ولی اگر آستانه آن‌قدر تند باشد که بخشی از
 *   کلمات هم بریده شود، آستانه پله‌پله ملایم‌تر می‌شود تا صدا سالم بماند.
 */
export async function compressVoice(input, output, {
  keep = 0.4, cutAfter = 0.8, speed = 1.0, startThreshold = null
} = {}) {
  const det = await detectSilences(input, { minSilence: 0.4, expected: 0 });
  const silSum = det.inner.reduce((a, s) => a + (s[1] - s[0]), 0);
  const origSpeech = det.total - silSum;
  console.log(`   صدای گفتار: ${origSpeech.toFixed(1)}s | سکوت: ${silSum.toFixed(1)}s`);

  let th = startThreshold ?? det.th;
  let best = null;
  for (let i = 0; i < 5; i++) {
    const tmp = output + ".tmp.wav";
    await cleanVoice(input, tmp, { threshold: th, cutAfter, keep, speed });
    const d2 = await detectSilences(tmp, { minSilence: 0.4, expected: 0 });
    const s2 = d2.inner.reduce((a, s) => a + (s[1] - s[0]), 0);
    const newSpeech = d2.total - s2;
    const lost = origSpeech - newSpeech;
    if (lost > origSpeech * 0.04) {
      console.log(`   آستانه ${th}dB زیادی تند بود (${lost.toFixed(1)}s از کلمات بریده شد) — ملایم‌تر می‌کنم`);
      th -= 2;
      continue;
    }
    best = { tmp, th, total: d2.total, speech: newSpeech };
    break;
  }
  if (!best) {
    console.log("   فشرده‌سازی انجام نشد (صدای اصلی استفاده می‌شود)");
    return { file: input, threshold: det.th, total: det.total };
  }
  const { rename } = await import("node:fs/promises");
  await rename(best.tmp, output);
  console.log(`   آستانهٔ نهایی: ${best.th}dB | گفتار ${origSpeech.toFixed(1)}s → ${best.speech.toFixed(1)}s` +
    ` | کل ${det.total.toFixed(1)}s → ${best.total.toFixed(1)}s`);
  return { file: output, threshold: best.th, total: best.total };
}
export async function cleanVoice(input, output, {
  threshold = -32, cutAfter = 0.9, keep = 0.35, speed = 1.0, fade = 0.06
} = {}) {
  const filters = [];
  filters.push(
    `silenceremove=start_periods=0:stop_periods=-1:stop_duration=${cutAfter}` +
    `:stop_threshold=${threshold}dB:stop_silence=${keep}`
  );
  if (speed && Math.abs(speed - 1) > 0.001) filters.push(`atempo=${speed}`);
  filters.push(`afade=t=in:st=0:d=${fade}`);
  filters.push(`afade=t=out:st=${Math.max(0, (await duration(input)) - fade).toFixed(2)}:d=${fade}`);

  await runFfmpeg([
    "-y", "-i", input,
    "-af", filters.join(","),
    "-ar", "48000", "-ac", "1",
    output
  ]);
  return output;
}
