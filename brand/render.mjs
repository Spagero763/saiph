import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const jobs = [
  { html: "logo.html", out: "saiph-logo.png", w: 1024, h: 1024 },
  { html: "banner.html", out: "saiph-banner.png", w: 1500, h: 500 },
];

const browser = await chromium.launch();
for (const j of jobs) {
  const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 2 });
  await page.goto("file://" + join(dir, j.html));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(dir, j.out) });
  await page.close();
  console.log("wrote", j.out);
}
await browser.close();
