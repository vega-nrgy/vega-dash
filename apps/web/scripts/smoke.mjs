// Manual smoke test for the Vega Charge dashboard — not part of CI, just a
// quick "did I break the golden path" check to run by hand during dev.
//
// Prereqs: dev server running (`npm run dev`) and local Supabase seeded.
// Usage:   node scripts/smoke.mjs [baseUrl]   (defaults to http://localhost:3000)
//
// Formalized from ad hoc exploratory scripts used to verify the Phase 1
// build end-to-end (map, search, side panels, right-click predict, history
// and pipeline pages) — kept here instead of a throwaway temp file so it can
// be re-run after future changes.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "smoke-output");
await mkdir(outDir, { recursive: true });
const shot = (name) => path.join(outDir, name);

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

async function step(label, fn) {
  process.stdout.write(`${label}... `);
  await fn();
  console.log("ok");
}

await step("1. Load dashboard", async () => {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".leaflet-container", { timeout: 15000 });
  await page.waitForTimeout(1500); // let markers/clusters render
  await page.screenshot({ path: shot("01-initial-map.png") });
});

await step('2. Search "Suryapet" (area mode)', async () => {
  await page.fill('input[placeholder*="Search"]', "Suryapet");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: shot("02-area-search.png") });
});

await step("3. Click a station in the area list", async () => {
  const firstStationBtn = page.locator("aside ul button").first();
  if (!(await firstStationBtn.count())) throw new Error("no station button in area panel");
  await firstStationBtn.click();
  await page.waitForSelector("text=Estimated Consumption", { timeout: 8000 });
  await page.screenshot({ path: shot("03-station-detail.png") });
});

await step("4. Right-click the map (predict-new-site panel)", async () => {
  const mapBox = await page.locator(".leaflet-container").boundingBox();
  await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2, {
    button: "right",
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: shot("04-predict-panel.png") });
});

await step("5. Click a marker directly on the map", async () => {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".leaflet-container", { timeout: 15000 });
  await page.waitForTimeout(1500);
  const visibleCenter = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll(".vc-dot"));
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.top > 60 && r.left > 220 && r.bottom < window.innerHeight) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  });
  if (!visibleCenter) throw new Error("no visible unclustered marker found on screen");
  await page.mouse.click(visibleCenter.x, visibleCenter.y);
  await page.waitForSelector("text=Estimated Consumption", { timeout: 8000 });
  await page.screenshot({ path: shot("05-marker-click.png") });
});

await step("6. History page", async () => {
  await page.goto(`${baseUrl}/station/115127795/history`, { waitUntil: "networkidle" });
  await page.screenshot({ path: shot("06-history-page.png"), fullPage: true });
});

await step("7. Pipeline status page", async () => {
  await page.goto(`${baseUrl}/admin/pipeline`, { waitUntil: "networkidle" });
  await page.screenshot({ path: shot("07-pipeline-page.png"), fullPage: true });
});

await browser.close();

console.log(`\nScreenshots written to ${outDir}`);
if (consoleErrors.length) {
  console.error("\nConsole errors detected:");
  for (const e of consoleErrors) console.error(" -", e);
  process.exit(1);
}
console.log("Console errors: none");
