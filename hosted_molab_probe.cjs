// Hosted presentation validation. Bootstrap writer control through the real UI,
// then test only the presentation page. No credentials are used or printed.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const out=path.resolve('hosted-probe-output');fs.mkdirSync(out,{recursive:true});
let suite=fs.readFileSync('test_live_browser.cjs','utf8');
const initial="await page.goto(report.url, { waitUntil: 'domcontentloaded', timeout: 60000 });";
if(!suite.includes(initial))throw Error('Initial navigation point missing');
suite=suite.replace(initial,"await page.goto(new URL(report.url).origin + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });");
const anchor='  report.hosted_frames = page.frames().map(';
if(!suite.includes(anchor))throw Error('Presentation navigation point missing');
suite=suite.replace(anchor,
"  report.bootstrap_editor_console_errors = report.console_errors.splice(0);\n"+
"  report.bootstrap_editor_page_errors = report.page_errors.splice(0);\n"+
"  await page.goto(report.url, { waitUntil: 'domcontentloaded', timeout: 60000 });\n"+
"  report.presentation_editor_count = await page.locator('.cm-editor').count();\n"+anchor);
const local='test_hosted_present.generated.cjs';fs.writeFileSync(local,suite);
const result=spawnSync(process.execPath,[local,'--takeover'],{stdio:'inherit',env:{
 ...process.env,MARIMO_URL:'https://sb-17962ab4c96906aa.sb.molab.run/?view-as=present',
 BROWSER_EVIDENCE_DIR:'hosted-probe-output/browser',BROWSER_PHASE:'fresh_molab_presentation',TEST_SCOPE:'final_notebook'
},timeout:360000});
const reportPath=path.join(out,'browser','live_browser_report.json');
if(fs.existsSync(reportPath)){
 const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
 // Retain complete test evidence as an artifact; emit only bounded metadata.
 const summary={status:report.status,scope:report.scope,phase:report.phase,
  tested_notebook_sha256:report.tested_notebook_sha256,
  presentation_editor_count:report.presentation_editor_count,
  checks:report.checks,console_errors:report.console_errors,page_errors:report.page_errors,
  bootstrap_editor_console_errors:report.bootstrap_editor_console_errors,
  started_at:report.started_at,completed_at:report.completed_at,
  failure:report.failure?.slice(0,1600)};
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
 console.log('HOSTED_PRESENTATION_REPORT '+JSON.stringify(summary));
}
process.exitCode=result.status===0?0:1;
