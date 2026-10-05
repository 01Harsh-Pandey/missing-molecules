// Anonymous hosted molab launch probe. No credentials used.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('hosted-probe-output');
fs.mkdirSync(out, { recursive: true });
const safeURL = value => { try { const u = new URL(value); return u.origin + u.pathname; } catch { return String(value).slice(0,100); } };
const url = 'https://molab.marimo.io/github/01Harsh-Pandey/missing-molecules/blob/main/missing_molecules.py';
async function inspect(page, textLimit=4500) {
  const frames = [];
  for (const frame of page.frames()) {
    const item = {url: safeURL(frame.url())};
    try {
      item.text = (await frame.locator('body').innerText({timeout:3000})).slice(0,textLimit);
      item.buttons = await frame.locator('button,[role=menuitem],[role=option]').evaluateAll(nodes => nodes.slice(0,30).map(el=>({
        text:el.innerText.trim().slice(0,120),role:el.getAttribute('role'),aria:el.getAttribute('aria-label'),disabled:!!el.disabled
      })));
      item.board = await frame.locator('.board').count();
      item.structures = await frame.locator('.board .card svg path').count();
      item.summary = await frame.locator('.board .metric strong').allTextContents();
    } catch(error) {item.error=String(error.message).slice(0,200);}
    frames.push(item);
  }
  return {title:await page.title(),url:safeURL(page.url()),frames};
}
(async()=>{
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const report = {scope:'anonymous_native_launch',errors:[],steps:[]};
  page.on('pageerror',e=>report.errors.push(String(e.message).slice(0,250)));
  try {
    const response = await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    report.status=response?.status();
    await page.waitForTimeout(10000);
    const menu=page.getByRole('button',{name:'View mode: Preview',exact:true});
    await menu.click();
    await page.waitForTimeout(1000);
    report.steps.push({phase:'mode_menu',...(await inspect(page,1400))});
    const server = page.getByText('Server',{exact:true});
    if(await server.count() && await server.first().isVisible()) {
      await server.first().click();
      report.action='selected Server';
    } else {
      const run=page.getByRole('button',{name:'Run it now',exact:true});
      if(await run.count() && await run.isVisible()) {await page.keyboard.press('Escape');await run.click();report.action='clicked Run it now';}
      else report.action='no visible native launch control';
    }
    await page.waitForTimeout(5000);
    report.steps.push({phase:'after_launch',...(await inspect(page,1800))});
    const deadline=Date.now()+180000;
    while(Date.now()<deadline){
      let ready=false;
      for(const frame of page.frames()) {if(await frame.locator('.board .card svg path').count()>0)ready=true;}
      if(ready){report.result='structure_board_visible';break;}
      const text=await page.locator('body').innerText().catch(()=> '');
      if(/sign in to|log in to|unable to start|failed to start|please sign in|something went wrong/i.test(text)){report.result='launch_blocked';break;}
      await page.waitForTimeout(5000);
    }
    report.steps.push({phase:'final',...(await inspect(page,5000))});
    if(!report.result)report.result='no_live_structure_board_after_wait';
    await page.screenshot({path:path.join(out,'launch-final.png'),fullPage:false});
  }catch(error){report.result='probe_error';report.error=String(error.message).slice(0,1500);}
  finally {
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    console.log('HOSTED_PROBE_REPORT '+JSON.stringify(report));
    await browser.close();
  }
  if(report.result==='probe_error')process.exitCode=1;
})().catch(e=>{console.error(String(e));process.exitCode=1;});
