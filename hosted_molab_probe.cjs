// Inspect the user's fresh viewer without authentication; test if accessible.
// Session credentials must never be written to this repository or CI logs.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const out = path.resolve('hosted-probe-output');
fs.mkdirSync(out, { recursive: true });
const url = 'https://sb-17962ab4c96906aa.sb.molab.run/?view-as=present';
const safeURL = value => { try { const u=new URL(value);return u.origin+u.pathname; } catch { return String(value).slice(0,100); } };
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  const report={scope:'fresh_hosted_viewer_without_credentials',requested:safeURL(url),errors:[],frames:[]};
  page.on('pageerror',e=>report.errors.push(String(e.message).slice(0,250)));
  try {
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    report.status=response?.status();
    await page.waitForTimeout(15000);
    report.title=await page.title();
    report.final=safeURL(page.url());
    for(const frame of page.frames()){
      const item={url:safeURL(frame.url())};
      try {
        item.text=(await frame.locator('body').innerText({timeout:5000})).slice(0,7000);
        item.buttons=await frame.locator('button').evaluateAll(nodes=>nodes.slice(0,25).map(el=>({
          text:el.innerText.trim().slice(0,120),aria:el.getAttribute('aria-label'),testid:el.getAttribute('data-testid'),disabled:el.disabled
        })));
        item.board=await frame.locator('.board').count();
        item.structures=await frame.locator('.board .card svg path').count();
        item.summary=await frame.locator('.board .metric strong').allTextContents();
      }catch(error){item.error=String(error.message).slice(0,300);}
      report.frames.push(item);
    }
    await page.screenshot({path:path.join(out,'fresh-viewer.png'),fullPage:false});
    report.live_board_accessible=report.frames.some(f=>f.board===1&&f.structures>0);
  }catch(error){report.error=String(error.message).slice(0,1000);}
  finally {
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    console.log('HOSTED_PROBE_REPORT '+JSON.stringify(report));
    await browser.close();
  }
  if(report.live_board_accessible){
    const result=spawnSync(process.execPath,['test_live_browser.cjs'],{stdio:'inherit',env:{
      ...process.env,MARIMO_URL:url,BROWSER_EVIDENCE_DIR:'hosted-probe-output/browser',
      BROWSER_PHASE:'fresh_molab_public_viewer',TEST_SCOPE:'final_notebook'
    },timeout:360000});
    process.exitCode=result.status===0?0:1;
  }
})().catch(e=>{console.error(String(e));process.exitCode=1;});
