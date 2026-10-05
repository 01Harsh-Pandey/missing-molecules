// Inspect current live UI, then run cells through the UI if its control is available.
// Never edit source or use/print pairing credentials.
const { chromium }=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const crypto=require('node:crypto');
const out=path.resolve('hosted-probe-output');fs.mkdirSync(out,{recursive:true});
const url='https://sb-17962ab4c96906aa.sb.molab.run/';
const safeURL=x=>{try{const u=new URL(x);return u.origin+u.pathname;}catch{return String(x).slice(0,100);}};
async function inspect(page){
 return {title:await page.title(),url:safeURL(page.url()),
  text:(await page.locator('body').innerText()).slice(0,1800),
  controls:await page.locator('button,[role=button]').evaluateAll(nodes=>nodes.filter(el=>!['Copy code','Hide code'].includes(el.getAttribute('aria-label'))).slice(0,35).map(el=>({
    text:el.innerText.trim().slice(0,100),aria:el.getAttribute('aria-label'),testid:el.getAttribute('data-testid'),title:el.getAttribute('title'),disabled:!!el.disabled
  }))),
  cells:await page.locator('[data-cell-id]').count(),editors:await page.locator('.cm-editor').count(),
  board:await page.locator('.board').count(),structures:await page.locator('.board .card svg path').count(),
  summary:await page.locator('.board .metric strong').allTextContents(),
  bodyclasses:await page.locator('body').getAttribute('class'),
  websocket_ops:ops
 };
}
const ops={};
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 const report={scope:'fresh_hosted_editor_inspection',steps:[],errors:[]};
 page.on('pageerror',e=>report.errors.push(String(e.message).slice(0,250)));
 page.on('websocket',s=>s.on('framereceived',e=>{try{const m=JSON.parse(e.payload.toString());if(m.op)ops[m.op]=(ops[m.op]||0)+1;}catch{}}));
 try{
  const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});report.status=r?.status();
  await page.waitForTimeout(15000);
  report.steps.push({phase:'initial',...(await inspect(page))});
  const takeover=page.getByTestId('takeover-button');
  if(await takeover.count()){
    const response=page.waitForResponse(r=>r.url().includes('/kernel/takeover')&&r.request().method()==='POST',{timeout:30000});
    await takeover.click();
    report.takeover_status=(await response).status();
    if(report.takeover_status!==200)throw Error('Writer control was not granted');
    await takeover.waitFor({state:'detached',timeout:30000});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForTimeout(8000);
  }
  report.steps.push({phase:'writer',...(await inspect(page))});
  const run=page.getByRole('button',{name:/^(?:Re-)?Run all(?: cells| stale cells)?$/i}).first();
  if(await run.count()&&await run.isVisible()){
    await run.click();report.action='clicked Run all';
  }else{
    await page.getByTestId('command-palette-button').click();
    await page.waitForTimeout(500);
    const search=page.getByRole('combobox').last();
    if(await search.count())await search.fill('Re-run all cells');
    await page.waitForTimeout(500);
    const command=page.getByRole('option',{name:/Re.run all cells/i}).first();
    if(await command.count()&&await command.isVisible()){
      await command.click();report.action='command palette: Re-run all cells';
    }else{
      report.steps.push({phase:'palette',...(await inspect(page))});
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+Shift+r');
      report.action='documented Run all stale cells shortcut';
    }
  }
  await page.locator('.board .card svg path').first().waitFor({state:'attached',timeout:120000}).catch(e=>report.wait_error=String(e.message).slice(0,250));
  if(await page.locator('.cm-editor').count())await page.keyboard.press('Control+.');
  await page.waitForTimeout(1000);
  report.steps.push({phase:'final',...(await inspect(page))});
  report.live_board_accessible=await page.locator('.board .card svg path').count()>0;
  await page.screenshot({path:path.join(out,'editor-final.png'),fullPage:false});
 }catch(e){report.error=String(e.message).slice(0,1000);}
 finally{
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log('HOSTED_PROBE_REPORT '+JSON.stringify(report));
  await browser.close();
 }
 if(report.live_board_accessible){
  const result=spawnSync(process.execPath,['test_live_browser.cjs','--app-view','--takeover'],{stdio:'inherit',env:{...process.env,
   MARIMO_URL:url,BROWSER_EVIDENCE_DIR:'hosted-probe-output/browser',BROWSER_PHASE:'fresh_molab_runtime',TEST_SCOPE:'final_notebook'},timeout:360000});
  process.exitCode=result.status===0?0:1;
 }
})().catch(e=>{console.error(String(e));process.exitCode=1;});
