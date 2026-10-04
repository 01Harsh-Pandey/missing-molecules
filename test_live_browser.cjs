// Actual marimo server integration tests. No mocked model or synthetic dataset.
// Run with NODE_PATH pointing at the bundled Playwright package and MARIMO_URL.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { chromium } = require('playwright');

const destination = path.resolve(__dirname, process.env.BROWSER_EVIDENCE_DIR || 'evidence/browser');
fs.mkdirSync(destination, { recursive: true });
const report = { url: process.env.MARIMO_URL || 'http://127.0.0.1:2718',
  scope: process.env.TEST_SCOPE || 'final_notebook', notebook: process.env.TEST_NOTEBOOK || 'missing_molecules.py',
  chemistry_validated: false,
  phase: process.env.BROWSER_PHASE || 'main_existing_session',
  limitation: process.env.TEST_SCOPE === 'diagnostic_chemistry_disabled' ?
    'Actual marimo Python↔anywidget path on a diagnostic copy using real raw molecule IDs; RDKit disabled, source-ID denominator unvalidated and no molecular drawings. This does not establish final notebook execution or chemistry.' : null,
  started_at: new Date().toISOString(), checks: [], snapshots: {}, console_errors: [], page_errors: [] };

const findingsPath = path.resolve(__dirname, process.env.VERIFIED_FINDINGS || 'verified_findings.json');
const verifiedFindings = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
const isDiagnostic = report.scope === 'diagnostic_chemistry_disabled';
const inspectHost = process.argv.includes('--inspect-host');
if (!isDiagnostic && !inspectHost) {
  assert.equal(report.scope, 'final_notebook', 'Use final_notebook scope for full validation');
  assert.equal(verifiedFindings.validation_mode, 'full', 'Run normal validate_full.py before testing the final notebook');
  assert.equal(verifiedFindings.chemistry_audit.status, 'PASSED', 'Chemistry audit must pass first');
  assert.equal(verifiedFindings.full_data_logic_checks, 'PASSED', 'Full valid-ID logic audit must pass first');
  report.chemistry_validated = true;
  report.verified_findings_sha256 = crypto.createHash('sha256').update(fs.readFileSync(findingsPath)).digest('hex');
}

let browser, page;
const kernel = { ready: false, completed_runs: 0, busy_cells: new Set(), last_notification_at: Date.now() };
report.tested_notebook_sha256 = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(__dirname, report.notebook))).digest('hex');
const checkpoint = (name, data) => {
  report.checks.push({ name, status: 'PASSED', ...(data ? { evidence: data } : {}) });
  console.log('PASS ' + name);
};
const writeReport = () => fs.writeFileSync(path.join(destination, 'live_browser_report.json'), JSON.stringify(report, null, 2));
async function visibleSummary() {
  const values = await page.locator('.board .metric strong').allTextContents();
  assert.equal(values.length, 3);
  return Object.fromEntries(['pass', 'fail', 'unresolved'].map((key, index) => [key, Number(values[index].replaceAll(',', ''))]));
}
async function downloadQuestion(name) {
  await stable();
  const pending = page.waitForEvent('download', { timeout: 30000 });
  await page.getByText('Download this question and its results', { exact: true }).click();
  const download = await pending;
  assert.equal(download.suggestedFilename(), 'my_evidence_question.json');
  const file = path.join(destination, name + '.json');
  await download.saveAs(file);
  assert.equal(await download.failure(), null);
  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  let shown = await visibleSummary();
  // Widget comms can settle after Python output; allow transport latency, then fail stale state.
  const deadline = Date.now() + 10000;
  while (Object.keys(shown).some(key => result.summary[key] !== shown[key]) && Date.now() < deadline) {
    await page.waitForTimeout(200);
    shown = await visibleSummary();
  }
  report.snapshots[name] = { path: file, rendered_summary: shown, python_summary: result.summary };
  for (const key of Object.keys(shown)) assert.equal(result.summary[key], shown[key], 'Python export and widget disagree: ' + key);
  assert.equal(result.summary.pass + result.summary.fail + result.summary.unresolved, result.summary.n);
  assert.equal(result.summary.lower, result.summary.pass);
  assert.equal(result.summary.upper, result.summary.pass + result.summary.unresolved);
  assert.ok(Array.isArray(result.molecule_decisions), 'Download must include actual molecule decisions');
  assert.equal(result.molecule_decisions.length, result.summary.n);
  const tally = { pass: 0, fail: 0, unresolved: 0 };
  for (const molecule of result.molecule_decisions) {
    tally[molecule.status] += 1;
    assert.deepEqual(Object.keys(molecule.gates).sort(), [...result.enabled_endpoints].sort());
  }
  assert.deepEqual(tally, shown, 'Exported per-molecule decisions do not reproduce widget population counts');
  assert.deepEqual([...result.gate_order].sort(), [...result.enabled_endpoints].sort());
  report.snapshots[name] = { path: file, summary: result.summary, enabled_endpoints: result.enabled_endpoints,
    thresholds: result.thresholds, discard_censored: result.discard_censored, gate_order: result.gate_order,
    first_failure_attribution: result.first_failure_attribution };
  return result;
}
async function stable() {
  // Observe actual server run completion, then allow the frontend to render the final outputs.
  // A fixed delay can click a download from an intermediate run after rapid slider key presses.
  await page.waitForTimeout(300);
  const deadline = Date.now() + 60000;
  while ((!kernel.ready && kernel.completed_runs === 0) || kernel.busy_cells.size || Date.now() - kernel.last_notification_at < 750) {
    assert.ok(Date.now() < deadline, 'marimo execution did not settle: ' + JSON.stringify({
      completed_runs: kernel.completed_runs, busy_cells: [...kernel.busy_cells] }));
    await page.waitForTimeout(100);
  }
  await page.locator('.board').waitFor({ state: 'visible', timeout: 60000 });
}
async function react(action, description) {
  // A hosted UI event can reach Python after an already-idle connection was inspected.
  // Wait for a *new* real kernel run from each actual changed value, then settle outputs.
  const before = kernel.completed_runs;
  await action();
  const deadline = Date.now() + 60000;
  while (kernel.completed_runs <= before) {
    assert.ok(Date.now() < deadline, 'No new Python run after ' + description);
    await page.waitForTimeout(100);
  }
  await stable();
}
async function setSearch(value) {
  const search = page.getByPlaceholder('e.g. E-001', { exact: true });
  if (await search.inputValue() !== value) {
    await react(async () => { await search.fill(value); await search.press('Tab'); }, 'molecule-ID search ' + value);
  }
  if (value && value !== 'NO-SUCH-MOLECULE-ID-TEST') {
    await page.locator('.board .card .id').filter({ hasText: value }).waitFor({ state: 'visible', timeout: 60000 });
    const deadline = Date.now() + 60000;
    while (await page.locator('.board .card').count() !== 1) {
      assert.ok(Date.now() < deadline, 'Exact molecule search did not produce one card');
      await page.waitForTimeout(100);
    }
    await page.locator('.mm-details strong').filter({ hasText: value }).waitFor({ timeout: 60000 });
  } else if (!value) {
    const deadline = Date.now() + 60000;
    while (await page.locator('.board .card').count() !== 12) {
      assert.ok(Date.now() < deadline, 'Clearing molecule search did not restore 12 cards');
      await page.waitForTimeout(100);
    }
  }
  await stable();
}
async function setSliderKeys(slider, keys, description) {
  // Let Python accept each changed value before dispatching the next keyboard value.
  // Native slider key events can otherwise race the hosted debounce/command queue.
  await slider.focus();
  for (const key of keys) {
    const oldValue = await slider.getAttribute('aria-valuenow');
    const before = kernel.completed_runs;
    await slider.press(key);
    if (await slider.getAttribute('aria-valuenow') !== oldValue) {
      const deadline = Date.now() + 60000;
      while (kernel.completed_runs <= before) {
        assert.ok(Date.now() < deadline, 'No Python run after slider key ' + key + ': ' + description);
        await page.waitForTimeout(100);
      }
      await stable();
    }
  }
}
async function pythonTable(index) {
  const attribute = await page.locator('marimo-table').nth(index).getAttribute('data-data');
  const parsed = JSON.parse(attribute);
  return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
}
async function toggleEndpoint(label) {
  await react(async () => {
    await page.locator('marimo-multiselect').getByRole('button').click();
    await page.getByRole('option', { name: label, exact: true }).click();
    await page.locator('.mm-hero').click({ position: { x: 10, y: 10 } });
  }, 'endpoint toggle ' + label);
}
async function dumpDOM(name) {
  const dom = await page.locator('body').evaluate(body => {
    const collect = root => Array.from(root.querySelectorAll('*')).flatMap(element => [element,
      ...(element.shadowRoot ? collect(element.shadowRoot) : [])]);
    const nodes = collect(body);
    return {
      text: body.innerText,
      controls: nodes.filter(x => ['INPUT', 'BUTTON', 'SELECT', 'A'].includes(x.tagName) || ['slider', 'combobox', 'checkbox', 'option'].includes(x.getAttribute('role')))
        .map(x => {
          const sensitive = x.type === 'password' || /token|auth|password/i.test([x.name, x.id, x.getAttribute('aria-label')].join(' '));
          return { tag: x.tagName, role: x.getAttribute('role'), type: x.type, text: sensitive ? '[REDACTED]' : x.innerText,
            label: x.getAttribute('aria-label'), labelledby: x.getAttribute('aria-labelledby'), value: sensitive ? '[REDACTED]' : x.value,
            classes: x.className, outer: sensitive ? '[REDACTED AUTH FIELD]' : x.outerHTML.slice(0, 1200) };
        }),
      custom: nodes.filter(x => x.tagName.toLowerCase().includes('marimo') && !/SERVER-TOKEN|USER-CONFIG/.test(x.tagName))
        .map(x => ({tag:x.tagName, outer:x.outerHTML.slice(0, 1600)}))
    };
  });
  fs.writeFileSync(path.join(destination, name + '_dom.json'), JSON.stringify(dom, null, 2));
}

async function run() {
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  report.browser_version = browser.version();
  page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  page.on('pageerror', error => report.page_errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.console_errors.push(message.text()); });
  page.on('websocket', socket => {
    const connectionURL = new URL(socket.url());
    const consumer = connectionURL.searchParams.get('session_id');
    if (consumer) report.consumer_session_id = consumer;
    socket.on('framereceived', event => {
    let message;
    try { message = JSON.parse(event.payload.toString()); } catch { return; }
    if (message.op === 'kernel-ready') {
      kernel.ready = true;
      kernel.last_notification_at = Date.now();
    } else if (message.op === 'cell-op') {
      kernel.last_notification_at = Date.now();
      if (['running', 'queued', 'stale'].includes(message.data.status)) kernel.busy_cells.add(message.data.cell_id);
      else if (message.data.status) kernel.busy_cells.delete(message.data.cell_id);
    } else if (message.op === 'completed-run') {
      kernel.completed_runs += 1;
      kernel.last_notification_at = Date.now();
    }
    });
  });
  const initialResponse = await page.goto(report.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (inspectHost) {
    await page.waitForTimeout(5000);
    await dumpDOM('host_initial');
    await page.screenshot({ path: path.join(destination, 'host_initial.png'), fullPage: true });
    report.host = { status: initialResponse?.status(), title: await page.title(),
      url: page.url().split('?')[0], frames: page.frames().map(frame => ({ name: frame.name(), url: frame.url().split('?')[0] })) };
    report.status = 'HOST_INSPECTED_ONLY';
    writeReport();
    console.log(JSON.stringify(report.host, null, 2));
    await browser.close();
    return;
  }
  if (process.argv.includes('--takeover')) {
    await page.waitForTimeout(1000);
    const takeover = page.getByTestId('takeover-button');
    if (await takeover.count()) {
      const responsePromise = page.waitForResponse(response => response.url().includes('/kernel/takeover') && response.request().method() === 'POST');
      await takeover.click();
      const response = await responsePromise;
      assert.equal(response.status(), 200, 'Hosted writer takeover failed; authentication/permission must be supplied through the authorized client');
      await takeover.waitFor({ state: 'detached', timeout: 30000 });
      report.hosted_writer_takeover = 'PASSED';
      await page.reload({ waitUntil: 'domcontentloaded' });
    } else report.hosted_writer_takeover = 'ALREADY_WRITER_OR_APP';
  }
  report.hosted_frames = page.frames().map(frame => ({ name: frame.name(), url: frame.url().split('?')[0] }));
  console.log('HOST_BROWSER_CONNECTED: ' + (report.consumer_session_id || 'session ID pending') + '; waiting for rendered notebook.');
  await page.locator('.board').waitFor({ state: 'visible', timeout: 120000 });
  assert.equal(await page.locator('.board').count(), 1, 'Exactly one EvidenceBoard must be rendered');
  await stable();
  if (new URL(report.url).searchParams.get('view-as') === 'present') {
    assert.equal(await page.locator('.cm-editor').count(), 0, 'Present view must avoid mounting editor components');
    report.hosted_view = 'present';
  }
  if (process.argv.includes('--wait-root')) {
    console.log('FRESH_BROWSER_READY: ' + (report.consumer_session_id || 'session ID pending') + '; waiting for root first-help confirmation; send {"mode":"continue"}.');
    await new Promise((resolve, reject) => {
      process.stdin.resume();
      process.stdin.once('data', chunk => {
        process.stdin.pause();
        try { assert.equal(JSON.parse(chunk.toString().trim()).mode, 'continue'); resolve(); }
        catch (error) { reject(error); }
      });
    });
    await stable();
  }
  if (process.argv.includes('--app-view')) {
    // Wait for registered global shortcuts; issuing this during startup can be ignored.
    if (await page.locator('.cm-editor:visible').count()) {
      await page.locator('.board .metrics').click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('Control+.');
      await page.waitForTimeout(700);
    }
    assert.equal(await page.locator('.cm-editor:visible').count(), 0, 'Hosted notebook must be in app view');
    report.hosted_view = 'app';
  }
  if (process.argv.includes('--takeover')) await normalizeHostedDefaults();
  await dumpDOM('initial');
  await page.screenshot({ path: path.join(destination, 'live_desktop.png'), fullPage: true });
  // marimo uses an internal scrolling pane; increase only capture height to avoid clipping cards.
  await page.setViewportSize({ width: 1280, height: 1800 });
  await page.locator('.board').screenshot({ path: path.join(destination, 'live_desktop_board.png') });
  await page.setViewportSize({ width: 1280, height: 1000 });
  if (process.argv.includes('--inspect-select')) {
    await page.locator('marimo-multiselect').getByRole('button').click();
    await dumpDOM('multiselect');
    report.status = 'INSPECTED';
    writeReport();
    await browser.close();
    return;
  }
  if (process.argv.includes('--inspect')) {
    report.status = 'INSPECTED';
    writeReport();
    await browser.close();
    return;
  }

  const baseline = await downloadQuestion('baseline');
  if (!isDiagnostic) {
    assert.equal(baseline.source_sha256, verifiedFindings.source.sha256, 'Browser export uses unexpected source bytes');
    assert.deepEqual(baseline.summary, verifiedFindings.settings['ksol+hlm+papp'].interval,
      'Browser baseline must match the independently audited full valid-ID population');
    assert.ok(await page.locator('.board .card svg path').count() > 0, 'RDKit molecule drawings must render actual paths');
    assert.equal(await page.getByText('Structure audit BLOCKED', { exact: true }).count(), 0,
      'A chemistry-disabled diagnostic is not the final notebook');
    checkpoint('Full chemistry findings match the live baseline and molecule structures render');
  }

  const policies = await pythonTable(0);
  assert.equal(policies[0]['Established passes'], baseline.summary.pass);
  assert.equal(policies[0]['Established failures'], baseline.summary.fail);
  assert.equal(policies[0].Unresolved, baseline.summary.unresolved);
  checkpoint('Initial widget summary equals downloaded Python result', baseline.summary);
  if (process.argv.includes('--supplemental-sliders')) {
    await exerciseRemainingSliders(baseline);
    assert.equal(report.page_errors.length, 0, 'Supplemental browser JavaScript errors');
    assert.equal(report.console_errors.length, 0, 'Supplemental browser console errors');
    assert.equal(await page.locator('.cm-editor').count(), 0);
    assert.equal(await page.getByText('An exception was raised', { exact: false }).count(), 0);
    assert.equal(kernel.busy_cells.size, 0);
    checkpoint('Supplemental present-view threshold checks have no browser or notebook exception errors');
    report.status = 'PASSED';
    report.completed_at = new Date().toISOString();
    report.marimo_transport = {kernel_ready:kernel.ready, completed_runs:kernel.completed_runs, busy_cells_at_end:[...kernel.busy_cells]};
    writeReport();
    await browser.close();
    return;
  }
  const cards = page.locator('.board .card');
  assert.ok(await cards.count() >= 2, 'Need two real molecule cards for selection check');
  const secondId = (await cards.nth(1).getAttribute('aria-label')).split(':')[0];
  await cards.nth(1).click();
  await page.locator('.mm-details strong').filter({ hasText: secondId }).waitFor();
  assert.equal(await page.locator('.board .card[aria-pressed="true"] .id').innerText(), secondId);
  checkpoint('Molecule selection reaches Python evidence detail', { molecule_id: secondId });

  const initialFocused = await page.locator('.mm-details tbody tr').filter({ hasText: 'focused' }).innerText();
  await page.locator('.board .gate .name').filter({ hasText: 'HLM CLint' }).click();
  await page.locator('.mm-details tbody tr').filter({ hasText: 'Human microsomal clearance · focused' }).waitFor();
  const focused = await page.locator('.mm-details tbody tr').filter({ hasText: 'focused' }).innerText();
  assert.notEqual(initialFocused, focused);
  await stable();
  const opportunities = await pythonTable(2);
  assert.equal(opportunities.find(row => row['Focused on board']).Assay, 'Human microsomal clearance');
  checkpoint('Endpoint focus reaches Python evidence detail', { focused });

  await react(() => page.getByRole('button', { name: 'Move KSOL later', exact: true }).click(), 'gate reorder');
  const reordered = await downloadQuestion('reordered');
  assert.notDeepEqual(reordered.gate_order, baseline.gate_order);
  assert.deepEqual(reordered.summary, baseline.summary);
  assert.ok(reordered.first_failure_attribution, 'JSON must expose actual Python first-failure attribution');
  assert.deepEqual(reordered.first_failure_attribution.map(row => row.endpoint), reordered.gate_order);
  assert.notDeepEqual(reordered.first_failure_attribution, baseline.first_failure_attribution);
  const waterfall = await pythonTable(1);
  assert.equal(waterfall[0].Assay, 'Human microsomal clearance');
  assert.deepEqual(waterfall.map(row => row['Attributed first failures']), reordered.first_failure_attribution.map(row => row.first_fail));
  checkpoint('Gate reorder reaches Python attribution and JSON without changing final decisions');

  // UI controls are selected by their rendered labels. Implemented after live DOM inspection.
  await exerciseNativeControls(baseline);
  await exerciseDisplayControls(baseline);
  await page.setViewportSize({ width: 390, height: 850 });
  await stable();
  const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(widths.document <= widths.viewport, 'Whole page overflows at 390px: ' + JSON.stringify(widths));
  await page.locator('marimo-multiselect').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(destination, 'live_mobile_controls.png') });
  const nativeBounds = {
    endpoints: await page.locator('marimo-multiselect').getByRole('button').boundingBox(),
    search: await page.getByPlaceholder('e.g. E-001', { exact: true }).boundingBox(),
    sliders: await page.locator('marimo-slider').getByRole('slider').evaluateAll(thumbs => thumbs.map(thumb => {
      let track = thumb.parentElement;
      while (track && track.getAttribute('data-orientation') !== 'horizontal') track = track.parentElement;
      const bounds = (track || thumb).getBoundingClientRect();
      return { x: bounds.x, width: bounds.width, right: bounds.right };
    }))
  };
  report.native_mobile_bounds = nativeBounds;
  assert.ok(nativeBounds.endpoints.x >= 0 && nativeBounds.endpoints.x + nativeBounds.endpoints.width <= 390,
    'Mobile endpoint control is clipped: ' + JSON.stringify(nativeBounds.endpoints));
  assert.ok(nativeBounds.search.width >= 120, 'Mobile molecule-ID search input is too narrow: ' + JSON.stringify(nativeBounds.search));
  assert.ok(nativeBounds.sliders.every(track => track.x >= 0 && track.right <= 390),
    'Mobile slider tracks are clipped: ' + JSON.stringify(nativeBounds.sliders));
  checkpoint('390px native controls fit and molecule-ID input stays usable', nativeBounds);
  await page.locator('.board .metrics').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(destination, 'live_mobile_board_viewport.png') });
  await page.setViewportSize({ width: 390, height: 2400 });
  await page.locator('.board').screenshot({ path: path.join(destination, 'live_mobile_board.png') });
  await page.setViewportSize({ width: 390, height: 850 });
  const region = page.getByRole('region', { name: 'Molecule evidence table; scroll horizontally on narrow screens' });
  await region.scrollIntoViewIfNeeded();
  const scroll = await region.evaluate(element => {
    const before = element.scrollLeft;
    element.scrollLeft = element.scrollWidth;
    return { before, after: element.scrollLeft, width: element.clientWidth, content: element.scrollWidth };
  });
  assert.ok(scroll.content > scroll.width && scroll.after > scroll.before, 'Evidence table does not scroll horizontally');
  await region.evaluate(element => { element.scrollLeft = 0; });
  await page.screenshot({ path: path.join(destination, 'live_mobile_390.png'), fullPage: true });
  await region.screenshot({ path: path.join(destination, 'live_mobile_details.png') });
  checkpoint('390px layout fits viewport and evidence table scrolls', { widths, scroll });
  await dumpDOM('final');
  const body = await page.locator('body').evaluate(element => {
    const deepText = root => Array.from(root.childNodes).map(node =>
      node.nodeType === Node.TEXT_NODE ? node.textContent :
      (node.shadowRoot ? deepText(node.shadowRoot) : '') + deepText(node)).join(' ');
    return deepText(element);
  });
  assert.ok(!/MarimoExceptionRaisedError|Traceback \(most recent call last\)|An exception was raised|Cell.*raised an exception/.test(body), 'Notebook has an exception output');
  assert.equal(report.page_errors.length, 0, 'Browser JavaScript errors: ' + report.page_errors.join('\n'));
  assert.equal(report.console_errors.length, 0, 'Browser console errors: ' + report.console_errors.join('\n'));
  assert.ok(kernel.completed_runs > 0, 'No actual marimo completed-run notifications observed');
  assert.equal(kernel.busy_cells.size, 0, 'Notebook cells remain queued/running');
  report.marimo_transport = { kernel_ready: kernel.ready, completed_runs: kernel.completed_runs, busy_cells_at_end: [...kernel.busy_cells],
    synchronization: 'WebSocket cell-op statuses plus completed-run notifications and final rendered outputs' };
  checkpoint('No browser JavaScript/console or notebook exception outputs');
  report.status = report.scope === 'diagnostic_chemistry_disabled' ? 'PASSED_DIAGNOSTIC' : 'PASSED';
  report.completed_at = new Date().toISOString();
  fs.writeFileSync(path.join(destination, 'visual_qa.json'), JSON.stringify({
    status: 'AUTOMATED_GEOMETRY_PASSED', scope: report.scope, captured_at: report.completed_at,
    note: isDiagnostic ? 'Diagnostic geometry only; chemistry is disabled. Screenshots require visual inspection.' : 'Full-notebook automated geometry and SVG presence checks passed. Screenshots still require visual inspection of molecular structures and layout.',
    evidence: ['live_desktop.png', 'live_desktop_board.png', 'live_mobile_controls.png',
      'live_mobile_board_viewport.png', 'live_mobile_board.png', 'live_mobile_details.png']
  }, null, 2));
  writeReport();
  if (process.argv.includes('--hold-open')) {
    console.log('HOST_BROWSER_HOLDING: writer browser remains open; send {"mode":"snapshot"} or {"mode":"quit"} over stdin.');
    const readline = require('readline').createInterface({ input: process.stdin, terminal: false });
    for await (const line of readline) {
      let command;
      try { command = JSON.parse(line); } catch { console.log('HOST_BROWSER_COMMAND_ERROR: expected JSON'); continue; }
      if (command.mode === 'quit') break;
      if (command.mode === 'snapshot') {
        await dumpDOM('held_browser');
        console.log('HOST_BROWSER_SNAPSHOT_SAVED');
      } else console.log('HOST_BROWSER_COMMAND_ERROR: unsupported mode');
    }
    readline.close();
  }
  await browser.close();
}

async function exerciseNativeControls(baseline) {
  const solubility = page.locator('marimo-slider').filter({ hasText: 'Solubility ≥ (µM)' }).getByRole('slider');
  await setSliderKeys(solubility, ['End'], 'solubility threshold 200');
  const tightened = await downloadQuestion('solubility_200');
  assert.equal(tightened.thresholds.ksol.value, 200);
  assert.notDeepEqual(tightened.summary, baseline.summary);
  assert.ok((await page.locator('.mm-details tbody tr').first().innerText()).includes('≥ 200 µM'));
  assert.equal((await pythonTable(0))[0]['Established passes'], tightened.summary.pass);
  checkpoint('Threshold slider updates Python detail, native comparison table, widget and JSON');
  await setSliderKeys(solubility, ['Home', 'PageUp'], 'restore solubility threshold 10');
  const restored = await downloadQuestion('restored_threshold');
  assert.equal(restored.thresholds.ksol.value, 10);
  assert.deepEqual(restored.summary, baseline.summary);

  const search = page.getByPlaceholder('e.g. E-001', { exact: true });
  const demo = verifiedFindings.demo_cases.censor_bound_certifies_pass;
  assert.ok(demo && demo.id, 'The full audit must supply a valid censored-pass demo');
  const censoredId = demo.id;
  const censorKey = baseline.enabled_endpoints.find(key =>
    demo.using_bounds.gates[key] === 'pass' && demo.discarding_bounds.gates[key] === 'unresolved');
  assert.ok(censorKey, 'Demo needs a pass established by a censored gate');
  const endpointLabels = {ksol: 'Kinetic solubility', hlm: 'Human microsomal clearance',
    papp: 'Caco-2 permeability A\u2192B', efflux: 'Caco-2 efflux ratio'};
  await setSearch(censoredId);
  assert.equal(await page.locator('.board .card').count(), 1);
  await page.locator('.mm-details strong').filter({ hasText: censoredId }).waitFor();
  const rawRow = page.locator('.mm-details tbody tr').filter({ hasText: endpointLabels[censorKey] });
  assert.equal((await rawRow.locator('td').allTextContents())[1], demo.evidence[censorKey].raw);
  assert.equal((await rawRow.locator('td').allTextContents())[4], 'pass');
  assert.ok((await page.locator('.board .card').getAttribute('aria-label')).endsWith(': Evidence pass'));
  const searched = await downloadQuestion('search_real_id');
  assert.deepEqual(searched.summary, baseline.summary);
  if (!isDiagnostic) {
    const svg = page.locator('.board .card svg');
    assert.ok(await svg.locator('path').count() > 0);
    fs.writeFileSync(path.join(destination, 'rdkit_stereo_' + censoredId + '.svg'), await svg.evaluate(element => element.outerHTML));
    await svg.screenshot({ path: path.join(destination, 'rdkit_stereo_' + censoredId + '.png') });
    report.stereochemistry_demo = { id: censoredId, audit: demo.stereochemistry,
      published_smiles: demo.published_smiles, depiction: 'rdkit_stereo_' + censoredId + '.png',
      visual_inspection: 'PENDING' };
  }
  checkpoint('Exact real molecule-ID search updates board and Python detail without changing population', { molecule_id: censoredId });

  await react(() => page.locator('marimo-checkbox').getByRole('checkbox').check(), 'discard censored evidence');
  const discarded = await downloadQuestion('discard_censored');
  assert.equal(discarded.discard_censored, true);
  assert.ok(discarded.summary.unresolved > baseline.summary.unresolved);
  assert.equal((await rawRow.locator('td').allTextContents())[4], 'unresolved');
  assert.ok((await page.locator('.board .card').getAttribute('aria-label')).endsWith(': Unresolved'));
  assert.ok((await rawRow.innerText()).includes('Discarded in this experiment'));
  const policies = await pythonTable(0);
  assert.equal(policies[1]['Established passes'], discarded.summary.pass);
  assert.equal(policies[1]['Established failures'], discarded.summary.fail);
  assert.equal(policies[1].Unresolved, discarded.summary.unresolved);
  checkpoint('Censor-discard control updates Python detail, widget, policy comparison and JSON', discarded.summary);
  await react(() => page.locator('marimo-checkbox').getByRole('checkbox').uncheck(), 'restore censored evidence');

  await setSearch('NO-SUCH-MOLECULE-ID-TEST');
  await page.locator('.board .empty').waitFor({ state: 'visible' });
  await stable();
  assert.equal(await page.locator('.board .card').count(), 0);
  await page.getByText('Choose a displayed molecule to inspect its evidence.', { exact: true }).waitFor();
  const empty = await downloadQuestion('no_matching_cards');
  assert.deepEqual(empty.summary, baseline.summary);
  checkpoint('No-match search clears Python molecule detail while keeping full-population JSON');
  await setSearch('');

  await toggleEndpoint('Caco-2 permeability A→B');
  const two = await downloadQuestion('two_endpoints');
  assert.deepEqual(two.enabled_endpoints, ['ksol', 'hlm']);
  assert.equal(await page.locator('.mm-details tbody tr').count(), 2);
  assert.equal((await pythonTable(1)).length, 2);
  assert.equal((await pythonTable(2)).length, 2);
  assert.notDeepEqual(two.summary, baseline.summary);
  checkpoint('Disabling an endpoint updates Python detail, attribution/opportunity tables and JSON', two.summary);
  await toggleEndpoint('Caco-2 efflux ratio');
  const efflux = await downloadQuestion('efflux_enabled');
  assert.ok(efflux.enabled_endpoints.includes('efflux'));
  await page.locator('.mm-details tbody tr').filter({ hasText: 'Caco-2 efflux ratio' }).waitFor();
  assert.equal(efflux.thresholds.efflux.value, 3);
  assert.equal((await pythonTable(1)).length, 3);
  checkpoint('Enabling an endpoint updates Python evidence, tables and JSON');

  await page.locator('marimo-multiselect').getByRole('button').click();
  await page.getByRole('option', { name: 'Deselect all', exact: true }).click();
  await page.locator('.mm-hero').click({ position: { x: 10, y: 10 } });
  await page.getByText('Select at least one endpoint to define a screening question.', { exact: true }).waitFor();
  await page.locator('.board').waitFor({ state: 'detached' });
  assert.equal(await page.getByText('Download this question and its results', { exact: true }).count(), 0);
  await page.screenshot({ path: path.join(destination, 'zero_endpoints.png'), fullPage: true });
  checkpoint('Zero enabled endpoints stops downstream board and export with explicit guidance');
  for (const label of ['Kinetic solubility', 'Human microsomal clearance', 'Caco-2 permeability A→B']) {
    await toggleEndpoint(label);
  }
  const final = await downloadQuestion('restored_defaults');
  assert.deepEqual(final.enabled_endpoints, baseline.enabled_endpoints);
  assert.deepEqual(final.summary, baseline.summary);
  checkpoint('Restoring endpoints recovers default Python result after zero-endpoint stop');
  if (!isDiagnostic) await exerciseAuditedDemonstrations(baseline);
}

async function normalizeHostedDefaults() {
  // Existing hosted kernels retain UI state between browser contexts and failed test attempts.
  const search = page.getByPlaceholder('e.g. E-001', { exact: true });
  if (await search.inputValue()) await setSearch('');
  const censor = page.locator('marimo-checkbox').getByRole('checkbox');
  if (await censor.isChecked()) await react(() => censor.uncheck(), 'reset censor control');
  const statusSelect = page.locator('marimo-dropdown select');
  if (await statusSelect.locator('option:checked').innerText() !== 'All statuses') {
    await react(() => statusSelect.selectOption({ label: 'All statuses' }), 'reset status filter');
  }
  const labelMap = {
    'Kinetic solubility': 'ksol', 'Human microsomal clearance': 'hlm',
    'Caco-2 permeability A→B': 'papp', 'Caco-2 efflux ratio': 'efflux'
  };
  await page.locator('marimo-multiselect').getByRole('button').click();
  const selected = [];
  for (const label of Object.keys(labelMap)) {
    if (await page.getByRole('option', { name: label, exact: true }).locator('svg.lucide-check').count()) selected.push(labelMap[label]);
  }
  await page.locator('.mm-hero').click({ position: { x: 10, y: 10 } });
  if (selected.join(',') !== 'ksol,hlm,papp') {
    await page.locator('marimo-multiselect').getByRole('button').click();
    await page.getByRole('option', { name: 'Deselect all', exact: true }).click();
    await page.locator('.mm-hero').click({ position: { x: 10, y: 10 } });
    for (const label of ['Kinetic solubility', 'Human microsomal clearance', 'Caco-2 permeability A→B']) await toggleEndpoint(label);
  }
  for (const [label, target, keys] of [
    ['Solubility ≥ (µM)', 10, ['Home', 'PageUp']],
    ['HLM clearance ≤ (mL/min/kg)', 50, ['Home', 'PageUp']],
    ['Permeability ≥ (10⁻⁶ cm/s)', 1, ['Home', 'ArrowRight', 'ArrowRight']],
    ['Efflux ratio ≤', 3, ['Home', ...Array(6).fill('ArrowRight')]],
    ['Cards shown', 12, ['Home', 'ArrowRight']]
  ]) {
    const slider = page.locator('marimo-slider').filter({ hasText: label }).getByRole('slider');
    if (Number(await slider.getAttribute('aria-valuenow')) !== target) {
      await setSliderKeys(slider, keys, 'reset slider ' + label);
    }
  }
  while ((await page.locator('.board .gate .name').first().innerText()) !== '1. KSOL') {
    await react(() => page.getByRole('button', { name: 'Move KSOL earlier', exact: true }).click(), 'reset KSOL order');
  }
  while ((await page.locator('.board .gate .name').nth(1).innerText()) !== '2. HLM CLint') {
    await react(() => page.getByRole('button', { name: 'Move HLM CLint earlier', exact: true }).click(), 'reset HLM order');
  }
  await page.locator('.board .gate .name').filter({ hasText: 'KSOL' }).click();
  await stable();
  report.hosted_initial_controls = 'Notebook defaults restored through actual browser UI; this existing-session run is not itself fresh validation';
}

async function exerciseAuditedDemonstrations(baseline) {
  const search = page.getByPlaceholder('e.g. E-001', { exact: true });
  const multi = verifiedFindings.demo_cases.fails_multiple_default_gates;
  await setSearch(multi.id);
  const multiResult = await downloadQuestion('audited_multiple_failures');
  const molecule = multiResult.molecule_decisions.find(row => row.id === multi.id);
  assert.deepEqual(molecule.gates, multi.using_bounds.gates);
  assert.equal(molecule.status, 'fail');
  assert.ok(Object.values(molecule.gates).filter(value => value === 'fail').length >= 2);
  await react(() => page.getByRole('button', { name: 'Move KSOL later', exact: true }).click(), 'multiple-failure attribution reorder');
  const reordered = await downloadQuestion('audited_multiple_failures_reordered');
  assert.deepEqual(reordered.summary, multiResult.summary);
  assert.deepEqual(reordered.molecule_decisions.find(row => row.id === multi.id), molecule);
  assert.notDeepEqual(reordered.first_failure_attribution, multiResult.first_failure_attribution);
  await react(() => page.getByRole('button', { name: 'Move KSOL earlier', exact: true }).click(), 'multiple-failure attribution restore');
  checkpoint('Audited multi-failure molecule keeps its decision while attribution changes', { id: multi.id, gates: molecule.gates });

  const transition = verifiedFindings.demo_cases.same_observation_threshold_transition;
  await toggleEndpoint('Kinetic solubility');
  await toggleEndpoint('Caco-2 permeability A→B');
  await setSearch(transition.id);
  const clearance = page.locator('marimo-slider').filter({ hasText: 'HLM clearance ≤ (mL/min/kg)' }).getByRole('slider');
  const broad = await downloadQuestion('hlm_bound_threshold_50');
  assert.deepEqual(broad.enabled_endpoints, ['hlm']);
  assert.equal(broad.thresholds.hlm.value, transition.certifying_threshold);
  assert.equal(broad.molecule_decisions.find(row => row.id === transition.id).gates.hlm, 'pass');
  await setSliderKeys(clearance, ['Home', 'ArrowRight'], 'HLM threshold 5');
  const narrow = await downloadQuestion('hlm_bound_threshold_5');
  assert.equal(narrow.thresholds.hlm.value, transition.inconclusive_threshold);
  assert.equal(narrow.molecule_decisions.find(row => row.id === transition.id).gates.hlm, 'unresolved');
  const detail = await page.locator('.mm-details tbody tr').first().locator('td').allTextContents();
  assert.equal(detail[1], transition.reported);
  assert.equal(detail[4], 'unresolved');
  checkpoint('Audited HLM-only bound changes from pass50 to unresolved5 with unchanged reported inequality', { id: transition.id, reported: transition.reported });
  await setSliderKeys(clearance, ['Home', 'PageUp'], 'restore HLM threshold 50');
  await page.locator('marimo-multiselect').getByRole('button').click();
  await page.getByRole('option', { name: 'Deselect all', exact: true }).click();
  await page.locator('.mm-hero').click({ position: { x: 10, y: 10 } });
  for (const label of ['Kinetic solubility', 'Human microsomal clearance', 'Caco-2 permeability A→B']) await toggleEndpoint(label);
  await setSearch('');
  const final = await downloadQuestion('audited_demo_defaults_restored');
  assert.deepEqual(final.summary, baseline.summary);
  assert.deepEqual(final.enabled_endpoints, baseline.enabled_endpoints);
}

async function exerciseDisplayControls(baseline) {
  // These controls filter the visible cards, while the scientific question retains all IDs.
  const select = page.locator('marimo-dropdown select');
  await react(() => select.selectOption({ label: 'Evidence pass' }), 'Evidence pass display filter');
  assert.equal(await page.locator('.board .card').count(), 12);
  const statusLabels = await page.locator('.board .card').evaluateAll(cards => cards.map(card => card.getAttribute('aria-label')));
  assert.ok(statusLabels.every(label => label.endsWith(': Evidence pass')));
  const filtered = await downloadQuestion('display_pass_only');
  assert.deepEqual(filtered.summary, baseline.summary);
  await react(() => select.selectOption({ label: 'All statuses' }), 'restore all status display');
  checkpoint('Status dropdown filters displayed molecules while preserving all-ID Python decisions and export');
  const limit = page.locator('marimo-slider').filter({ hasText: 'Cards shown' }).getByRole('slider');
  await setSliderKeys(limit, ['End'], 'show 36 molecule cards');
  const deadline = Date.now() + 60000;
  while (await page.locator('.board .card').count() !== 36) {
    assert.ok(Date.now() < deadline, 'Cards shown slider did not render 36 actual molecules');
    await page.waitForTimeout(100);
  }
  const expanded = await downloadQuestion('display_36_cards');
  assert.deepEqual(expanded.summary, baseline.summary);
  await setSliderKeys(limit, ['Home', 'ArrowRight'], 'restore 12 molecule cards');
  checkpoint('Cards shown slider changes the actual board while preserving scientific population and export');
  await toggleEndpoint('Caco-2 efflux ratio');
  const four = await downloadQuestion('all_four_endpoints');
  assert.deepEqual(four.enabled_endpoints, ['ksol', 'hlm', 'papp', 'efflux']);
  assert.deepEqual(four.summary, verifiedFindings.settings['ksol+hlm+papp+efflux'].interval);
  assert.equal((await pythonTable(1)).length, 4);
  assert.equal((await pythonTable(2)).length, 4);
  assert.equal(await page.locator('.mm-details tbody tr').count(), 4);
  await toggleEndpoint('Caco-2 efflux ratio');
  const restored = await downloadQuestion('all_four_restored_defaults');
  assert.deepEqual(restored.summary, baseline.summary);
  checkpoint('All four endpoints together match full-mode findings in widget, Python tables and JSON');
}

async function exerciseRemainingSliders(baseline) {
  const papp = page.locator('marimo-slider').filter({hasText:'Permeability ≥ (10⁻⁶ cm/s)'}).getByRole('slider');
  const pappRule = page.locator('.mm-details tbody tr').filter({hasText:'Caco-2 permeability A→B'}).locator('td').nth(3);
  await setSliderKeys(papp, ['End'], 'Papp threshold 20');
  await pappRule.filter({hasText:'≥ 20 '}).waitFor();
  const changedPapp = await downloadQuestion('papp_threshold_20');
  assert.equal(changedPapp.thresholds.papp.value, 20);
  assert.notDeepEqual(changedPapp.summary, baseline.summary);
  assert.equal((await pythonTable(0))[0]['Established passes'], changedPapp.summary.pass);
  for(const key of ['Home','ArrowRight','ArrowRight']) {
    await setSliderKeys(papp, [key], 'restore Papp threshold');
    const value = await papp.getAttribute('aria-valuenow');
    await pappRule.filter({hasText:'≥ ' + value + ' '}).waitFor();
  }
  const restoredPapp = await downloadQuestion('papp_threshold_restored');
  assert.equal(restoredPapp.thresholds.papp.value, 1);
  assert.deepEqual(restoredPapp.summary, baseline.summary);
  checkpoint('Papp slider changes Python detail, widget, policy table and downloaded decisions, then restores defaults');
  await toggleEndpoint('Caco-2 efflux ratio');
  const broad = await downloadQuestion('efflux_slider_baseline_3');
  const efflux = page.locator('marimo-slider').filter({hasText:'Efflux ratio ≤'}).getByRole('slider');
  const effluxRule = page.locator('.mm-details tbody tr').filter({hasText:'Caco-2 efflux ratio'}).locator('td').nth(3);
  await setSliderKeys(efflux, ['Home'], 'efflux threshold 0');
  await effluxRule.filter({hasText:'≤ 0 '}).waitFor();
  const changedEfflux = await downloadQuestion('efflux_threshold_0');
  assert.equal(changedEfflux.thresholds.efflux.value, 0);
  assert.notDeepEqual(changedEfflux.summary, broad.summary);
  assert.equal((await pythonTable(0))[0]['Established passes'], changedEfflux.summary.pass);
  for(const key of Array(6).fill('ArrowRight')) {
    await setSliderKeys(efflux, [key], 'restore efflux threshold');
    const value = await efflux.getAttribute('aria-valuenow');
    await effluxRule.filter({hasText:'≤ ' + value + ' '}).waitFor();
  }
  const restoredEfflux = await downloadQuestion('efflux_threshold_restored');
  assert.equal(restoredEfflux.thresholds.efflux.value, 3);
  assert.deepEqual(restoredEfflux.summary, broad.summary);
  await toggleEndpoint('Caco-2 efflux ratio');
  const final = await downloadQuestion('supplemental_defaults_restored');
  assert.deepEqual(final.summary, baseline.summary);
  assert.deepEqual(final.enabled_endpoints, baseline.enabled_endpoints);
  checkpoint('Efflux slider changes Python detail, widget, policy table and downloaded decisions, then restores default question');
}

run().catch(async error => {
  report.status = 'FAILED';
  report.failure = error.stack;
  report.completed_at = new Date().toISOString();
  if (page) {
    await dumpDOM('failure').catch(() => {});
    await page.screenshot({ path: path.join(destination, 'failure.png'), fullPage: true }).catch(() => {});
  }
  writeReport();
  console.error(error);
  if (browser) await browser.close();
  process.exitCode = 1;
});
