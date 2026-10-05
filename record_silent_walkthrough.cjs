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


const mediaOut = path.resolve('video-output');
fs.mkdirSync(mediaOut, {recursive:true});
const timeline=[];
let context,anchor;
async function at(seconds) {
  const delay=seconds*1000-(Date.now()-anchor);
  if(delay < -2500) throw Error('Recording overran scene '+seconds+' by '+(-delay)+'ms');
  if(delay>0)await page.waitForTimeout(delay);
}
async function camera(locator) {
  await locator.first().evaluate(el=>el.scrollIntoView({block:'center',behavior:'smooth'}));
  await page.waitForTimeout(650);
}
async function cameraSection(title) {
  const section=page.locator('.mm-section').filter({hasText:title}).first();
  await section.evaluate(el=>el.scrollIntoView({block:'start',behavior:'smooth'}));
  await page.waitForTimeout(650);
  await section.evaluate(el=>{
    for(let parent=el.parentElement;parent;parent=parent.parentElement){
      const style=getComputedStyle(parent);
      if(/auto|scroll/.test(style.overflowY)&&parent.scrollHeight>parent.clientHeight+10){
        parent.scrollBy({top:-60,behavior:'smooth'});
        return;
      }
    }
    window.scrollBy({top:-60,behavior:'smooth'});
  });
  await page.waitForTimeout(400);
  const bounds=await section.boundingBox();
  assert(bounds && bounds.y>=0 && bounds.y<260,
    'Section heading is not framed near the top: '+title+' '+JSON.stringify(bounds));
}
async function chapter(seconds,label) {
  await at(seconds);
  await page.evaluate(label=>document.querySelector('#recording-chapter').textContent=label,label);
  timeline.push({start_seconds:seconds,label,actual_seconds:Math.round((Date.now()-anchor)/10)/100});
  console.log('VIDEO_SCENE '+seconds+' '+label);
}
async function point(locator) {
  await locator.first().scrollIntoViewIfNeeded();
  const box=await locator.first().boundingBox();
  if(!box)return;
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y,{steps:12});
  await page.evaluate(({x,y})=>{
    const cursor=document.querySelector('#recording-cursor');
    cursor.style.left=(x/1.25)+'px';cursor.style.top=(y/1.25)+'px';cursor.style.opacity='0.8';
    setTimeout(()=>{cursor.style.opacity='0.25';},1300);
  },{x,y});
}
async function click(locator,why,reactive=true) {
  await point(locator);
  if(reactive)await react(()=>locator.first().click(),why);
  else await locator.first().click();
}
async function videoEndpoint(label) {
  await react(async()=>{
    const opener=page.locator('marimo-multiselect').getByRole('button');
    await point(opener);await opener.click();
    const option=page.getByRole('option',{name:label,exact:true});
    await point(option);await option.click();await page.keyboard.press('Escape');
  },'endpoint '+label);
}
async function summaryEquals(expected) {
  assert.deepEqual(await visibleSummary(),expected);
}
async function run() {
  browser=await chromium.launch({headless:true});
  context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,
    recordVideo:{dir:path.join(mediaOut,'raw'),size:{width:1920,height:1080}},acceptDownloads:true});
  page=await context.newPage();
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

  await page.goto(report.url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('.board .card svg path').first().waitFor({state:'attached',timeout:120000});
  await stable();
  const baseline=await downloadQuestion('baseline');
  assert.deepEqual(baseline.summary,verifiedFindings.settings['ksol+hlm+papp'].interval);
  assert.equal(baseline.source_sha256,verifiedFindings.source.sha256);
  assert.equal(await page.locator('.cm-editor').count(),0,'Record the native application, with code hidden');
  await page.addStyleTag({content:[
    'html{zoom:1.25}',
    '#recording-chapter{position:fixed;right:20px;bottom:16px;z-index:2147483645;background:rgba(18,61,67,.95);color:#eff7ef;border:1px solid #a9cbc4;border-radius:10px;padding:11px 16px;font:600 14px/1.4 system-ui;pointer-events:none;max-width:350px}',
    '#recording-cursor{position:fixed;z-index:2147483646;width:18px;height:18px;border-radius:50%;border:2px solid #dc9b37;background:#ffca5d50;transform:translate(-50%,-50%);transition:opacity .3s;pointer-events:none;opacity:0}'
  ].join('\n')});
  await page.evaluate(()=>{
    for(const id of ['recording-chapter','recording-cursor']){const el=document.createElement('div');el.id=id;document.body.append(el);}
    document.querySelector('#recording-chapter').textContent='01 · The question';
  });
  await camera(page.locator('.mm-hero'));
  await page.evaluate(()=>{
    const marker=document.createElement('div');marker.id='recording-sync-marker';
    marker.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgb(255,0,255)';
    document.body.append(marker);
  });
  await page.waitForTimeout(800);
  await page.evaluate(()=>document.querySelector('#recording-sync-marker').remove());
  anchor=Date.now();

  await chapter(0,'01 · The question');
  await at(11);await camera(page.getByText(/Live source audit:/).first());
  await chapter(20,'02 · The same screening goals');
  await camera(page.locator('.mm-section').filter({hasText:'Define the screening question'}));
  await at(30);await camera(page.locator('.board .metrics'));
  await summaryEquals({pass:1844,fail:2548,unresolved:3226});
  await page.screenshot({path:path.join(mediaOut,'baseline.png'),fullPage:false});

  await chapter(45,'03 · A bound can establish a pass');
  await setSearch('E-0018881');
  await camera(page.locator('.board .card'));
  await click(page.locator('.board .gate .name').filter({hasText:'HLM'}),'focus HLM');
  await camera(page.locator('.mm-details'));
  const passing=await downloadQuestion('bound_can_pass');
  assert.equal(passing.molecule_decisions.find(x=>x.id==='E-0018881').status,'pass');
  await at(58);await point(page.locator('.mm-details tbody tr').filter({hasText:'Human microsomal clearance'}).locator('td').nth(1));
  await page.screenshot({path:path.join(mediaOut,'bound-pass.png'),fullPage:false});

  await chapter(72,'04 · Same observation, different decision');
  await setSearch('E-0002337');
  await videoEndpoint('Kinetic solubility');
  await videoEndpoint('Caco-2 permeability A→B');
  await camera(page.locator('.mm-details'));
  const broad=await downloadQuestion('clearance_50');
  assert.deepEqual(broad.enabled_endpoints,['hlm']);
  assert.equal(broad.molecule_decisions.find(x=>x.id==='E-0002337').status,'pass');
  const clearance=page.locator('marimo-slider').filter({hasText:'HLM clearance ≤ (mL/min/kg)'}).getByRole('slider');
  await at(81);await point(clearance);await setSliderKeys(clearance,['Home','ArrowRight'],'HLM threshold 5');
  await camera(page.locator('.mm-details'));
  const narrow=await downloadQuestion('clearance_5');
  assert.equal(narrow.thresholds.hlm.value,5);
  assert.equal(narrow.molecule_decisions.find(x=>x.id==='E-0002337').status,'unresolved');
  await page.screenshot({path:path.join(mediaOut,'bound-unresolved.png'),fullPage:false});
  await at(89);await point(clearance);await setSliderKeys(clearance,['Home','PageUp'],'restore HLM50');
  await videoEndpoint('Kinetic solubility');
  await videoEndpoint('Caco-2 permeability A→B');
  if((await page.locator('.board .gate .name').allTextContents())[0].includes('HLM')){
    await click(page.getByRole('button',{name:'Move KSOL earlier',exact:true}),'restore default ordering');
  }

  await chapter(98,'05 · Missing does not mean failing');
  await setSearch('E-0011215');await camera(page.locator('.mm-details'));
  const fail=await downloadQuestion('one_failure_is_enough');
  assert.equal(fail.molecule_decisions.find(x=>x.id==='E-0011215').status,'fail');
  await at(112);await setSearch('E-0001829');await camera(page.locator('.mm-details'));
  const missing=await downloadQuestion('missing_is_unresolved');
  assert.equal(missing.molecule_decisions.find(x=>x.id==='E-0001829').status,'unresolved');

  await chapter(128,'06 · 262 decisions already in the evidence');
  await setSearch('');await camera(page.locator('.board .metrics'));
  const censored=page.locator('marimo-checkbox').getByRole('checkbox');
  await at(134);await point(censored);await react(()=>censored.check(),'discard censored observations');
  await camera(page.locator('.board .metrics'));
  await summaryEquals({pass:1682,fail:2448,unresolved:3488});
  const discarded=await downloadQuestion('discard_limits');
  assert.equal(discarded.discard_censored,true);
  await at(144);await cameraSection('What did cleaning the data erase?');
  await page.screenshot({path:path.join(mediaOut,'policy-comparison.png'),fullPage:false});
  await at(153);await point(censored);await react(()=>censored.uncheck(),'restore bounds');
  await camera(page.locator('.board .metrics'));
  await summaryEquals({pass:1844,fail:2548,unresolved:3226});

  await chapter(163,'07 · Order changes the accounting');
  await setSearch('E-0011211');await camera(page.locator('.mm-details'));
  const before=await downloadQuestion('attribution_before');
  assert.equal(before.molecule_decisions.find(x=>x.id==='E-0011211').status,'fail');
  await at(175);await cameraSection('A liability waterfall can tell several stories');
  await at(182);await click(page.getByRole('button',{name:'Move KSOL later',exact:true}),'change first-failure order');
  await cameraSection('A liability waterfall can tell several stories');
  const after=await downloadQuestion('attribution_after');
  assert.deepEqual(after.summary,before.summary);
  assert.notDeepEqual(after.first_failure_attribution,before.first_failure_attribution);
  await page.screenshot({path:path.join(mediaOut,'attribution.png'),fullPage:false});
  await at(193);await click(page.getByRole('button',{name:'Move KSOL earlier',exact:true}),'restore first-failure order');

  await chapter(198,'08 · Save the question and its evidence');
  await setSearch('');
  await click(page.locator('.board .gate .name').filter({hasText:'Papp'}),'focus Papp opportunity');
  await cameraSection('Which measurement could settle a decision?');
  await at(211);await camera(page.getByText('Download this question and its results',{exact:true}));
  await point(page.getByText('Download this question and its results',{exact:true}));
  const final=await downloadQuestion('final_defaults');
  assert.deepEqual(final.summary,baseline.summary);
  assert.deepEqual(final.gate_order,['ksol','hlm','papp']);

  await chapter(220,'09 · Provenance and limitations');
  const provenance=page.getByRole('button',{name:'Data provenance and chemistry audit',exact:true});
  await click(provenance,'show provenance',false);
  await camera(page.getByText(/Distinct canonical isomeric structures:/).first());
  await at(230);
  const disclosure=page.getByRole('button',{name:'AI use, contribution, and reproduce this notebook',exact:true});
  await click(disclosure,'show AI disclosure',false);
  await camera(page.getByText(/AI disclosure:/).first());
  await at(241);await camera(page.locator('.mm-hero'));
  await at(245);await page.waitForTimeout(800);
  assert.deepEqual(report.page_errors,[],'Recording page errors');
  assert.deepEqual(report.console_errors,[],'Recording console errors');
  const video=page.video();
  await context.close();
  const videoPath=await video.path();
  fs.writeFileSync(path.join(mediaOut,'capture.json'),JSON.stringify({
    status:'PASSED',raw_video:videoPath,requested_duration_seconds:245,
    notebook_sha256:report.tested_notebook_sha256,
    recording_runtime:'native Python 3.13 with declared dependencies; not the molab editor',
    source_sha256:baseline.source_sha256,baseline:baseline.summary,
    discard_policy:discarded.summary,scenes:timeline,
    page_errors:report.page_errors,console_errors:report.console_errors,
    recorded_at:new Date().toISOString()
  },null,2));
  await browser.close();
  console.log('SILENT_RECORDING_CAPTURED '+JSON.stringify({scenes:timeline.length,raw_video:videoPath}));
}
run().catch(async error=>{
  fs.writeFileSync(path.join(mediaOut,'recording_failure.json'),JSON.stringify({error:String(error.stack),timeline},null,2));
  console.error(error);
  if(page)await page.screenshot({path:path.join(mediaOut,'failure.png'),fullPage:false}).catch(()=>{});
  if(context)await context.close().catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
  process.exitCode=1;
});
