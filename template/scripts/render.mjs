/**
 * رندر فریم‌به‌فریم تمپلیت با Chrome (CDP) و تبدیل به MP4 با FFmpeg.
 *
 *   node scripts/render.mjs --video              → کل ریلز (out/octo-template.mp4)
 *   node scripts/render.mjs --stills 1,3,5       → چند عکس در زمان‌های مشخص (out/stills)
 *   node scripts/render.mjs --video --fps 60
 *   node scripts/render.mjs --video --html reel-01.html
 *   node scripts/render.mjs --video --audio audio/voice.wav --music audio/bed.mp3
 *   node scripts/render.mjs --video --timing timing.json
 *
 * هیچ پکیجی لازم نیست: فقط Chrome + Node 24 + FFmpeg.
 */
import { spawn } from "node:child_process";
import { writeFile, mkdir, rm, readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { buildSfxTrack } from "./sfx.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

/* ---------------- args ---------------- */
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf("--" + name);
  return i > -1 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : fallback;
};
const W = 1080, H = 1920;
const FPS = parseInt(flag("fps", "30"), 10);
const PORT = 9333 + Math.floor(Math.random() * 400);
const mode = argv.includes("--stills") ? "stills" : "video";
const FAST = argv.includes("--fast");            // فریم‌های JPEG → رندر سریع‌تر
const EXT = FAST ? "jpg" : "png";

// مسیرهای کمکی (نسبت به پوشهٔ template)
const rel = p => (isAbsolute(p) ? p : join(ROOT, p));
const HTML_FILE = rel(flag("html", "index.html"));
const AUDIO_FILE = flag("audio", null);
const MUSIC_FILE = flag("music", null);
const TIMING_FILE = flag("timing", null);
const SFX_ON = argv.includes("--sfx");
const MUX_ONLY = argv.includes("--mux-only");
const DUMP_TIMELINE = argv.includes("--dump-timeline");

function runFfmpeg(args) {
  return new Promise((res, rej) => {
    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
    ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg failed: " + args.join(" ")))));
  });
}

/* ---------------- tiny CDP client ---------------- */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("timeout: " + method));
        }
      }, 30000);
    });
  }
}

/* ---------------- launch browser ---------------- */
const userDir = join(tmpdir(), "octo-render-" + Date.now());

async function launch() {
  const proc = spawn(CHROME, [
    "--headless=new",
    "--remote-debugging-port=" + PORT,
    "--user-data-dir=" + userDir,
    "--window-size=" + W + "," + H,
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--force-device-scale-factor=1",
    "--disable-lcd-text",
    "--allow-file-access-from-files",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "about:blank",
  ], { stdio: "ignore" });

  let endpoint = null;
  for (let i = 0; i < 100 && !endpoint; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      endpoint = (await r.json()).webSocketDebuggerUrl;
    } catch {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  if (!endpoint) throw new Error("Chrome did not start");

  const ws = new WebSocket(endpoint);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  return { proc, cdp: new CDP(ws) };
}

/* ---------------- main ---------------- */
const { proc, cdp } = await launch();

const url = pathToFileURL(HTML_FILE).href + "?render=1";
const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });

await cdp.send("Page.enable", {}, sessionId);
await cdp.send("Runtime.enable", {}, sessionId);
await cdp.send("Emulation.setDeviceMetricsOverride",
  { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId);
await cdp.send("Emulation.setEmulatedMedia",
  { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);
await cdp.send("Page.navigate", { url }, sessionId);

// صبر تا آماده شدن فونت‌ها و اسکریپت
for (let i = 0; i < 200; i++) {
  const r = await cdp.send("Runtime.evaluate",
    { expression: "window.__ready === true", returnByValue: true }, sessionId);
  if (r.result?.value) break;
  await new Promise((r) => setTimeout(r, 100));
}
const meta = (await cdp.send("Runtime.evaluate",
  { expression: "JSON.stringify(window.OCTO_META)", returnByValue: true }, sessionId)).result.value;
const META = JSON.parse(meta || '{"duration":6}');
let DURATION = Number(flag("duration", META.duration)) || META.duration;
console.log("meta:", meta, "| duration:", DURATION);

// تزریق تایمینگ صدا (اختیاری) — بیت‌ها را با صدای ضبط‌شده هماهنگ می‌کند
if (TIMING_FILE) {
  try {
    const raw = await readFile(rel(TIMING_FILE), "utf8");
    const timing = JSON.parse(raw);
    await cdp.send("Runtime.evaluate", {
      expression: `window.applyTiming ? applyTiming(${JSON.stringify(timing)}) : 0`,
      returnByValue: true
    }, sessionId);
    const m2 = (await cdp.send("Runtime.evaluate",
      { expression: "JSON.stringify(window.OCTO_META)", returnByValue: true }, sessionId)).result.value;
    const M2 = JSON.parse(m2 || "{}");
    if (M2.duration) DURATION = M2.duration;
    console.log("timing applied:", TIMING_FILE, "| duration:", DURATION);
  } catch (e) {
    console.log("timing skipped:", e.message);
  }
}

// رویدادهای صوتی: لحظه‌هایی که موتور اعلام می‌کند (برای ساخت افکت)
let EVENTS = [];
if (SFX_ON) {
  try {
    const evJson = (await cdp.send("Runtime.evaluate",
      { expression: "JSON.stringify(window.OCTO_EVENTS || [])", returnByValue: true }, sessionId)).result.value;
    EVENTS = JSON.parse(evJson || "[]");
    console.log("sfx events:", EVENTS.length);
  } catch (e) {
    console.log("sfx events unavailable:", e.message);
  }
}

// ذخیرهٔ تایم‌لاین طراحی‌شده (برای حالت «بخوان روی ویدیو»)
if (DUMP_TIMELINE) {
  const tl = (await cdp.send("Runtime.evaluate",
    { expression: "JSON.stringify(window.OCTO_TIMELINE || {})", returnByValue: true }, sessionId)).result.value;
  const file = join(ROOT, "out", "timeline.json");
  await writeFile(file, tl || "{}", "utf8");
  console.log("timeline dumped:", file);
  await cdp.send("Browser.close").catch(() => {});
  proc.kill();
  await rm(userDir, { recursive: true, force: true }).catch(() => {});
  process.exit(0);
}

async function shot(t, file) {
  await cdp.send("Runtime.evaluate",
    { expression: `renderAt(${t}); requestAnimationFrame(()=>{});`, awaitPromise: false }, sessionId);
  await new Promise((r) => setTimeout(r, FAST ? 6 : 12));
  // گاهی اسکرین‌شات ناقص برمی‌گردد یا نوشتن روی دیسک ناقص انجام می‌شود؛
  // اگر فایل ناقص بود دوباره تلاش می‌کنیم
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data } = await cdp.send("Page.captureScreenshot",
      { format: FAST ? "jpeg" : "png", quality: FAST ? 94 : undefined,
        captureBeyondViewport: false, optimizeForSpeed: true }, sessionId);
    const buf = Buffer.from(data, "base64");
    if (buf.length < 5000) { await new Promise((r) => setTimeout(r, 60)); continue; }
    await writeFile(file, buf);
    const st = await stat(file);
    if (st.size >= buf.length - 512) return;      // کامل نوشته شد
    await new Promise((r) => setTimeout(r, 40));
  }
}

const outDir = join(ROOT, "out");
await mkdir(outDir, { recursive: true });

if (mode === "stills") {
  const times = String(flag("stills", "0.8,2.6,5.2")).split(",").map(Number);
  const dir = join(outDir, "stills");
  await mkdir(dir, { recursive: true });
  for (const t of times) {
    const f = join(dir, `t-${t.toFixed(2)}.png`);
    await shot(t, f);
    console.log("still:", f);
  }
} else {
  const framesDir = join(outDir, "frames");
  const outFile = join(outDir, flag("out", "octo-template.mp4"));
  const silentFile = (AUDIO_FILE || MUSIC_FILE || SFX_ON)
    ? join(outDir, ".silent.mp4")
    : outFile;

  if (MUX_ONLY) {
    if (!existsSync(silentFile)) {
      console.error("--mux-only: فایل " + silentFile + " پیدا نشد. اول یه رندر کامل بگیر.");
      process.exit(1);
    }
    console.log("mux only (فریم‌ها دوباره رندر نمی‌شوند):", silentFile);
  } else {
    await rm(framesDir, { recursive: true, force: true });
    await mkdir(framesDir, { recursive: true });

    const total = Math.round(DURATION * FPS);
    const startedAt = Date.now();
    for (let f = 0; f < total; f++) {
      await shot(f / FPS, join(framesDir, `f${String(f).padStart(4, "0")}.${EXT}`));
      if (f % 20 === 0) {
        const pct = ((f / total) * 100).toFixed(0);
        process.stdout.write(`\rframe ${f}/${total}  ${pct}%   `);
      }
    }
    console.log(`\nframes done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

    // اگر فریمی جا افتاده یا ناقص نوشته شده باشد، ffmpeg همان‌جا توالی را قطع می‌کند
    const files = await readdir(framesDir);
    const bad = [];
    for (let f = 0; f < total; f++) {
      const name = `f${String(f).padStart(4, "0")}.${EXT}`;
      if (!files.includes(name)) { bad.push(f); continue; }
      try {
        const st = await stat(join(framesDir, name));
        if (st.size < 5000) bad.push(f);
      } catch { bad.push(f); }
    }
    if (bad.length) {
      console.log(`فریم‌های خراب/جاافتاده: ${bad.length} → دوباره رندر می‌شوند`);
      for (const f of bad) {
        await shot(f / FPS, join(framesDir, `f${String(f).padStart(4, "0")}.${EXT}`));
      }
    }

    await runFfmpeg([
      "-y", "-framerate", String(FPS),
      "-i", join(framesDir, `f%04d.${EXT}`),
      "-c:v", "libx264", "-preset", "slow", "-crf", "17",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      silentFile,
    ]);
    console.log("video:", silentFile);
  }

  // ---------- صدا ----------
  // ورودی‌ها: 0=ویدیو  1=صدای گوینده  2=افکت‌ها  3=موسیقی
  let sfxFile = null;
  if (SFX_ON && EVENTS.length) {
    sfxFile = join(outDir, ".sfx.wav");
    try {
      // طول افکت باید به اندازهٔ ویدیو باشد، وگرنه -shortest ویدیو را می‌بُرد
      await buildSfxTrack(EVENTS, sfxFile, DURATION + 0.5);
      console.log("sfx track:", sfxFile);
    } catch (e) {
      console.log("sfx failed:", e.message);
      sfxFile = null;
    }
  }

  if (AUDIO_FILE || MUSIC_FILE || sfxFile) {
    const args = ["-y", "-i", silentFile];
    let idx = 0;
    if (AUDIO_FILE) { args.push("-i", rel(AUDIO_FILE)); idx++; }
    if (sfxFile) { args.push("-i", sfxFile); idx++; }
    if (MUSIC_FILE) { args.push("-i", rel(MUSIC_FILE)); idx++; }

    const vIdx = AUDIO_FILE ? 1 : 0;              // ایندکس صدای گوینده
    const sIdx = AUDIO_FILE ? 2 : 1;              // ایندکس افکت‌ها
    const mIdx = idx;                             // ایندکس موسیقی
    const chains = [];    // زنجیره‌های فیلتر (با ; جدا می‌شوند)
    const inputs = [];    // لیبل‌هایی که با هم میکس می‌شوند
    let audioLabel;

    if (AUDIO_FILE) {
      if (MUSIC_FILE) {
        chains.push(
          `[${mIdx}:a]volume=0.15[bed]`,
          `[${vIdx}:a]asplit=2[voice][sc]`,
          `[bed][sc]sidechaincompress=threshold=0.035:ratio=12:attack=10:release=320[ducked]`
        );
        inputs.push("[voice]", "[ducked]");
      } else {
        chains.push(`[${vIdx}:a]volume=1.0[voice]`);
        inputs.push("[voice]");
      }
    }
    if (sfxFile) {
      chains.push(`[${sIdx}:a]volume=0.9[sfx]`);
      inputs.push("[sfx]");
    }
    if (!AUDIO_FILE && MUSIC_FILE) {
      chains.push(`[${mIdx}:a]volume=0.18[bed]`);
      inputs.push("[bed]");
    }

    if (inputs.length > 1) {
      chains.push(`${inputs.join("")}amix=inputs=${inputs.length}:normalize=0:duration=first,` +
                 `loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);
      audioLabel = "[aout]";
    } else {
      audioLabel = inputs[0] || "0:a";
    }

    if (chains.length) args.push("-filter_complex", chains.join(";"));
    args.push("-map", "0:v", "-map", audioLabel,
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-shortest", outFile);
    await runFfmpeg(args);
    if (silentFile !== outFile) await rm(silentFile, { force: true });
    if (sfxFile) await rm(sfxFile, { force: true });
    console.log("audio mixed:", outFile);
  }
}

await cdp.send("Browser.close").catch(() => {});
proc.kill();
setTimeout(async () => {
  await rm(userDir, { recursive: true, force: true }).catch(() => {});
  process.exit(0);
}, 300);
