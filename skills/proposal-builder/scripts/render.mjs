// Render a Nexor proposal HTML into a shareable PDF (plus PNG previews).
//
//   node render.mjs <input.html> [outdir]
//
// - Replaces {{NEXOR_LOGO_DARK}} / {{NEXOR_LOGO_WHITE}} tokens with the inline
//   SVGs from ../assets, and writes the resolved, self-contained HTML to
//   <outdir>/<name>.html (this is the file you share or host).
// - Prints it to <outdir>/<name>.pdf via Playwright Chromium (Letter, no
//   margins, backgrounds on).
// - If `pdftoppm` (poppler) is on PATH, writes <name>-1.png, <name>-2.png ...
//   page previews so you can eyeball overflow before sending.
//
// Requires: `npm i playwright` + `npx playwright install chromium` somewhere
// resolvable. Fallback without Playwright: open the resolved HTML in Chrome,
// Print, Save as PDF, paper Letter, margins None, Background graphics ON.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const input = process.argv[2];
if (!input) {
  console.error("Usage: node render.mjs <input.html> [outdir]");
  process.exit(1);
}
const outdir = process.argv[3] ?? path.dirname(path.resolve(input));
mkdirSync(outdir, { recursive: true });

const name = path.basename(input).replace(/\.html?$/i, "");
let html = readFileSync(input, "utf8");

for (const [token, file] of [
  ["{{NEXOR_LOGO_DARK}}", "nexor-logo-dark.svg"],
  ["{{NEXOR_LOGO_WHITE}}", "nexor-logo-white.svg"],
]) {
  if (html.includes(token)) {
    const svg = readFileSync(path.join(here, "..", "assets", file), "utf8");
    html = html.split(token).join(svg);
  }
}

const htmlOut = path.join(outdir, `${name}.html`);
writeFileSync(htmlOut, html);
console.log(`html  ${htmlOut}`);

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "playwright not installed — rendered HTML only.\n" +
      "Either `npm i playwright && npx playwright install chromium`, or open the\n" +
      "HTML in Chrome and print to PDF (Letter, margins None, backgrounds ON).",
  );
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${path.resolve(htmlOut)}`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const pdfOut = path.join(outdir, `${name}.pdf`);
await page.pdf({
  path: pdfOut,
  width: "8.5in",
  height: "11in",
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  printBackground: true,
});
await browser.close();
console.log(`pdf   ${pdfOut}`);

try {
  execFileSync("pdftoppm", ["-png", "-r", "110", pdfOut, path.join(outdir, name)]);
  console.log(`png   ${path.join(outdir, `${name}-*.png`)}`);
} catch {
  console.log("pdftoppm not found — skipped PNG previews (brew install poppler).");
}
