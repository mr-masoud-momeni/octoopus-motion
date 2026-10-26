// Downloads the Arabic/Persian subsets of Vazirmatn so the template works offline.
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fontDir = join(root, "fonts");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const cssUrl =
  "https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;900&display=swap";

const css = await fetch(cssUrl, { headers: { "User-Agent": UA } }).then((r) => r.text());

// Split into @font-face blocks, keep only the ones covering Persian (U+0600-06FF).
const blocks = css.split("@font-face").slice(1);
const wanted = [];
for (const b of blocks) {
  if (!b.includes("U+0600-06FF")) continue;
  const weight = /font-weight:\s*(\d+)/.exec(b)?.[1];
  const url = /url\((https:[^)]+\.woff2)\)/.exec(b)?.[1];
  if (weight && url) wanted.push({ weight, url });
}

await mkdir(fontDir, { recursive: true });

let outCss = "";
for (const { weight, url } of wanted) {
  const file = `vazirmatn-${weight}.woff2`;
  const buf = Buffer.from(await fetch(url, { headers: { "User-Agent": UA } }).then((r) => r.arrayBuffer()));
  await writeFile(join(fontDir, file), buf);
  console.log(`saved ${file} (${buf.length} bytes)`);
  outCss += `@font-face{font-family:'Vazirmatn';font-style:normal;font-weight:${weight};font-display:block;src:url('./fonts/${file}') format('woff2');}\n`;
}

await writeFile(join(root, "fonts.css"), outCss, "utf8");
console.log("wrote fonts.css");
