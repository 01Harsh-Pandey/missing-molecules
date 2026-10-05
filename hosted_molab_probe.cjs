// Anonymous inspection of public molab entry points. No credentials used.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('hosted-probe-output');
fs.mkdirSync(out, { recursive: true });
function safeURL(value) {
  try { const u = new URL(value); return u.origin + u.pathname; }
  catch { return String(value).slice(0, 100); }
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = [];
  const targets = [
    ['github-mirror', 'https://molab.marimo.io/github/01Harsh-Pandey/missing-molecules/blob/main/missing_molecules.py'],
    ['previous-runtime', 'https://sb-bdb403412e5523ad.sb.molab.run/?view-as=present'],
  ];
  try {
    for (const [label, url] of targets) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const item = { label, requested: safeURL(url), errors: [] };
      page.on('pageerror', error => item.errors.push(String(error.message).slice(0, 250)));
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        item.status = response ? response.status() : null;
        await page.waitForTimeout(20000);
        item.final = safeURL(page.url());
        item.title = await page.title();
        item.frames = [];
        for (const frame of page.frames()) {
          const details = { name: frame.name(), url: safeURL(frame.url()) };
          try {
            details.text = (await frame.locator('body').innerText({timeout: 5000})).slice(0, 5500);
            details.buttons = await frame.locator('button').evaluateAll(nodes => nodes.slice(0, 35).map(el => ({
              text: el.innerText.trim().slice(0, 120),
              aria: el.getAttribute('aria-label'),
              testid: el.getAttribute('data-testid'),
              disabled: el.disabled,
            })));
            details.board = await frame.locator('.board').count();
            details.structures = await frame.locator('.board .card svg path').count();
          } catch (error) { details.error = String(error.message).slice(0, 300); }
          item.frames.push(details);
        }
        await page.screenshot({ path: path.join(out, label + '.png'), fullPage: false });
      } catch (error) { item.error = String(error.message).slice(0, 800); }
      report.push(item);
      await page.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log('HOSTED_PROBE_REPORT ' + JSON.stringify(report));
  }
})().catch(error => { console.error(String(error)); process.exitCode = 1; });
