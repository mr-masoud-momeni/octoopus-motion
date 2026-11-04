/**
 * ساخت افکت‌های صوتی و چسباندنشان به لحظه‌های درست.
 *
 * همهٔ افکت‌ها با ffmpeg ساخته می‌شوند (هیچ فایل صوتی لازم نیست):
 *   pop    = ضربهٔ ورود کارت‌ها
 *   sweep  = صدای عبور خط اسکن بین صحنه‌ها
 *   whoosh = ورود مانیتور
 *   zap    = روشن/خاموش شدن صفحه و باز شدن لاگ
 *   tick   = تیک خوردن سوال‌ها
 *   click  = کلیک کرسر روی خط لاگ
 *   ding   = چیپ CTA
 *   rise   = بالا آمدن اکتو از اعماق
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export const SFX = {
  rise: {
    src: "aevalsrc=0.62*sin(2*PI*(190-72*t)*t)*exp(-3.8*t):d=0.95:s=44100", vol: 1.0
  },
  pop: {
    src: "aevalsrc=0.62*sin(2*PI*880*t)*exp(-12*t)+0.22*sin(2*PI*145*t)*exp(-20*t):d=0.28:s=44100", vol: 1.0
  },
  sweep: {
    src: "anoisesrc=d=0.62:c=pink:r=44100, highpass=f=280, lowpass=f=6500, volume=0.72, afade=t=in:st=0:d=0.1, afade=t=out:st=0.28:d=0.34",
    vol: 0.72
  },
  whoosh: {
    src: "anoisesrc=d=0.68:c=white:r=44100, highpass=f=260, lowpass=f=8500, volume=0.66, afade=t=in:st=0.01:d=0.12, afade=t=out:st=0.25:d=0.42",
    vol: 0.78
  },
  zap: {
    src: "aevalsrc=0.48*sin(2*PI*(1800-1050*t)*t)*exp(-8*t):d=0.38:s=44100", vol: 0.9
  },
  tick: {
    src: "aevalsrc=0.4*sin(2*PI*1750*t)*exp(-20*t):d=0.18:s=44100", vol: 0.9
  },
  click: {
    src: "aevalsrc=0.48*sin(2*PI*2600*t)*exp(-42*t):d=0.1:s=44100", vol: 0.95
  },
  ding: {
    src: "aevalsrc=0.3*(sin(2*PI*1046*t)+0.62*sin(2*PI*1568*t)+0.28*sin(2*PI*2093*t))*exp(-5.5*t):d=0.72:s=44100",
    vol: 0.95
  }
};

function runFfmpeg(args) {
  return new Promise((res, rej) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
    p.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg failed: " + args.join(" ")))));
  });
}

/**
 * @param events  [{ name, t }]
 * @param outPath فایل wav خروجی
 * @param total   طول نهایی (ثانیه) — تا -shortest ویدیو را بی‌دلیل بُر��
 */
export async function buildSfxTrack(events, outPath, total = 0) {
  if (!events || !events.length) return null;
  await mkdir(dirname(outPath), { recursive: true });

  const args = ["-y"];
  const chains = [];
  events.forEach((e, i) => {
    const r = SFX[e.name];
    if (!r) return;
    const ms = Math.max(0, Math.round(e.t * 1000));
    args.push("-f", "lavfi", "-i", r.src);
    chains.push(`[${i}:a]adelay=${ms}|${ms},volume=${r.vol}[s${i}]`);
  });
  if (!chains.length) return null;

  const n = chains.length;
  let mix = chains.join(";") + `;${chains.map((_, i) => `[s${i}]`).join("")}amix=inputs=${n}:normalize=0:duration=longest`;
  if (total > 0) mix += `,apad=whole_dur=${total.toFixed(3)}`;
  mix += ",alimiter=limit=0.92[aout]";
  args.push("-filter_complex", mix, "-map", "[aout]", "-c:a", "pcm_s16le", "-ar", "48000");
  if (total > 0) args.push("-t", total.toFixed(3));
  args.push(outPath);

  await runFfmpeg(args);
  return outPath;
}
