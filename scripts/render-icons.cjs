// Renders the SVG app icons to PNG (used once; PNGs are committed). Usage: node scripts/render-icons.cjs
(async () => {
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const browser = await chromium.launch();
const page = await browser.newPage();
const jobs = [
  ["public/icons/icon.svg", "public/icons/icon-192.png", 192],
  ["public/icons/icon.svg", "public/icons/icon-512.png", 512],
  ["public/icons/maskable.svg", "public/icons/maskable-512.png", 512],
  ["public/icons/maskable.svg", "src/app/apple-icon.png", 180],
];
for (const [src, out, size] of jobs) {
  const svg = readFileSync(src, "utf8");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
})();
