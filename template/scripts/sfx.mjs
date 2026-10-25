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
    src: "aevalsrc=0.42*sin(2*PI*(170-95*t)*t)*exp(-5*t):d=0.85:s=44100", vol: 0.9
  },
  pop: {
    src: "aevalsrc=0.40*sin(2*PI*720*t)*exp(-15*t):d=0.24:s=44100", vol: 0.85
  },
  sweep: {
    src: "anoisesrc=d=0.55:c=pink:r=44100, volume=0.42, afade=t=in:st=0:d=0.2, afade=t=out:st=0.3:d=0.25",
    vol: 0.45
  },
  whoosh: {
    src: "anoisesrc=d=0.6:c=white:r=44100, highpass=f=320, lowpass=f=6500, volume=0.38, afade=t=in:st=0.04:d=0.2, afade=t=out:st=0.24:d=0.36",
    vol: 0.5
  },
  zap: {
    src: "aevalsrc=0.30*sin(2*PI*(1500-900*t)*t)*exp(-11*t):d=0.32:s=44100", vol: 0.65
  },
  tick: {
    src: "aevalsrc=0.26*sin(2*PI*1500*t)*exp(-26*t):d=0.16:s=44100", vol: 0.7
  },
  click: {
    src: "aevalsrc=0.34*sin(2*PI*2400*t)*exp(-55*t):d=0.08:s=44100", vol: 0.8
  },
  ding: {
    src: "aevalsrc=0.20*(sin(2*PI*1046*t)+0.55*sin(2*PI*1568*t))*exp(-7*t):d=0.6:s=44100",
    vol: 0.8
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
  mix += "[aout]";
  args.push("-filter_complex", mix, "-map", "[aout]", "-c:a", "pcm_s16le", "-ar", "48000");
  if (total > 0) args.push("-t", total.toFixed(3));
  args.push(outPath);

  await runFfmpeg(args);
  return outPath;
}
