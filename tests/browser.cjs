/* Run with PLAYWRIGHT_MODULE and optionally BROWSER_EXECUTABLE. No project install needed. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/qa');

(async () => {
  await fs.mkdir(output, { recursive:true });
  const server = http.createServer(async (req,res) => {
    try {
      const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const relative=route.replace(/^\/uat-browser\//,'');
      const file=path.resolve(root,relative || 'index.html');
      if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
      const body=await fs.readFile(file);
      res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'application/javascript','.ttf':'font/ttf'})[path.extname(file)] || 'application/octet-stream');
      res.end(body);
    } catch {res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/uat-browser/`;
  let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
    const context=await browser.newContext({viewport:{width:1440,height:1100}});
    const errors=[];
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.request().url().startsWith(url) ? route.continue() : route.abort());
    await page.goto(url);
    await page.waitForSelector('.scenario-card');
    assert.equal(await page.locator('.scenario-card').count(),107);
    assert.equal(await page.locator('#completed-count').textContent(),'0');
    assert(await page.locator('#download').isDisabled());
    assert(await page.locator('#previous').isDisabled());
    // Every rendered source field must equal the original data, including whitespace.
    const source=await page.evaluate(()=>window.UAT_DATA);
    const allocations=await page.evaluate(()=>window.UAT_ALLOCATIONS);
    const assignmentName=s=>String(allocations.assignments[s.id] || '').trim() || 'Unassigned';
    assert.deepEqual(await page.locator('#tester option').allTextContents(),['All scenarios','Colin','Lanre','Mustafa','Phil','Tvisha','Unassigned']);
    for(const s of source.scenarios){
      await page.locator(`.scenario-card[data-id="${s.id}"]`).click();
      for(const [id,key] of Object.entries({'scenario-heading':'title','scenario-code':'scenarioId',goal:'goal',preconditions:'preconditions',steps:'steps',expected:'expected'}))assert.equal(await page.locator('#'+id).textContent(),s[key],`${s.id} ${key}`);
      assert.equal(await page.locator('#assigned-tester').textContent(),assignmentName(s),`${s.id} allocation`);
    }
    assert(await page.locator('#next').isDisabled());
    await page.locator('.scenario-card').first().click();
    await page.locator('#completing-tester').fill('Review tester');
    const comment='Observed “quoted” text — café £10; Ελληνικά. <script>alert("test")</script>\nSecond paragraph.\n'+('LongCommentToken'.repeat(70))+'\n'+('Detailed observation with punctuation. '.repeat(160))+'\nEND OF LONG COMMENT';
    await page.locator('#comments').fill(comment);
    assert(await page.locator('#download').isDisabled());
    await page.getByRole('radio',{name:'Pass',exact:true}).check();
    await page.locator('#next').click();
    await page.getByRole('radio',{name:'Fail',exact:true}).check();
    await page.locator('#comments').fill('Failure observed; defect TEST-42.');
    await page.locator('#next').click();
    await page.getByRole('radio',{name:'Partially Passed',exact:true}).check();
    assert.equal(await page.locator('#completed-count').textContent(),'3');
    await page.reload();
    assert.equal(await page.locator('#completed-count').textContent(),'3');
    assert.equal(await page.locator('#comments').inputValue(),comment);
    assert.equal(await page.locator('#completing-tester').inputValue(),'Review tester');
    assert.equal(await page.locator('#completed-by').textContent(),'Review tester');
    assert(await page.getByRole('radio',{name:'Pass',exact:true}).isChecked());
    await page.locator('#clear-result').click();
    assert.equal(await page.locator('#completed-count').textContent(),'2');
    assert.equal(await page.locator('#comments').inputValue(),comment);
    await page.getByRole('radio',{name:'Pass',exact:true}).check();
    await page.locator('#suite').selectOption('Bulk');
    assert.equal(await page.locator('.scenario-card').count(),17);
    assert(await page.locator('#previous').isDisabled());
    await page.locator('#search').fill('BULK IMPORT UAT 18');
    assert.equal(await page.locator('.scenario-card').count(),1);
    assert(await page.locator('#next').isDisabled());
    await page.locator('#search').fill('there are no matches for this phrase');
    assert(await page.locator('#empty-detail').isVisible());
    await page.locator('#clear-filters').click();
    // Each tester scopes counts and navigation independently of outcome/search filters.
    for(const name of ['Lanre','Mustafa','Tvisha','Phil','Colin']) {
      await page.locator('#tester').selectOption('tester:'+name);
      const assigned=source.scenarios.filter(s=>assignmentName(s)===name);
      assert.equal(await page.locator('.scenario-card').count(),assigned.length);
      assert.equal(await page.locator('#total-copy').textContent(),`of ${assigned.length} scenarios completed`);
      assert.equal(await page.locator('#completed-count').textContent(),name==='Lanre'?'3':'0');
      assert.equal(await page.locator('#download').isDisabled(),name!=='Lanre');
      assert.deepEqual(await page.locator('.scenario-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.id)),assigned.map(s=>s.id));
    }
    await page.locator('#tester').selectOption('tester:Lanre');
    await page.locator('#outcome-filter').selectOption('Fail');
    const testerDownloadEvent=page.waitForEvent('download');
    await page.locator('#download').click();
    await (await testerDownloadEvent).saveAs(path.join(output,'tester-results.pdf'));
    await page.waitForFunction(()=>!document.getElementById('download').disabled);
    await page.locator('#clear-filters').click();
    await page.locator('#tester').selectOption('__unassigned__');
    assert.equal(await page.locator('#total-copy').textContent(),'of 0 scenarios completed');
    assert(await page.locator('#empty-detail').isVisible());
    await page.locator('#tester').selectOption('');
    await page.locator('#outcome-filter').selectOption('Fail');
    assert.equal(await page.locator('.scenario-card').count(),1);
    // Export includes all three completed cases even while only Fail is shown.
    const downloadEvent=page.waitForEvent('download');
    await page.locator('#download').click();
    const download=await downloadEvent;
    await download.saveAs(path.join(output,'sample-results.pdf'));
    await page.waitForFunction(()=>document.getElementById('export-message').textContent.includes('3 completed'));
    await fs.writeFile(path.join(output,'sample-expected.json'),JSON.stringify({source,allocations,comment},null,2));
    // Filter changes caused by an outcome update must update the detail selection.
    await page.getByRole('radio',{name:'Pass',exact:true}).check();
    assert(await page.locator('#empty-detail').isVisible());
    await page.locator('#clear-filters').click();
    await page.locator('.scenario-card').first().click();
    await page.locator('#comments').fill('The application list saved successfully.');
    await page.locator('#tester').selectOption('tester:Lanre');
    await page.evaluate(()=>{document.activeElement.blur();window.scrollTo(0,0);});
    await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
    // Keyboard focus and responsive document width.
    await page.keyboard.press('Control+Home');
    await page.locator('#search').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'suite');
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
    // Full pack stress fixture exercises every scenario and source punctuation.
    const allPdf=await page.evaluate(async()=>Array.from(await window.createResultsPdf(window.UAT_DATA,window.UAT_DATA.scenarios.map((s,i)=>({...s,result:{outcome:['Pass','Fail','Partially Passed'][i%3],comments:'Fixture for '+s.id}})))));
    await fs.writeFile(path.join(output,'all-scenarios.pdf'),Buffer.from(allPdf));
    // Existing result shape and namespace survive allocation changes and name entry.
    const legacy=await browser.newContext();
    const legacyValue=JSON.stringify({outcome:'Fail',comments:'Existing saved comment — preserve exactly.'});
    await legacy.addInitScript(({version,value})=>{
      const key=`appreg-uat:${version}:CORE-01`;
      if(!localStorage.getItem(key))localStorage.setItem(key,value);
    },{version:source.version,value:legacyValue});
    const legacyPage=await legacy.newPage();await legacyPage.goto(url);await legacyPage.waitForSelector('.scenario-card');
    assert.equal(await legacyPage.locator('#comments').inputValue(),'Existing saved comment — preserve exactly.');
    assert.equal(await legacyPage.locator('#completed-by').textContent(),'Not recorded');
    await legacyPage.locator('#tester').selectOption('tester:Colin');
    await legacyPage.locator('#completing-tester').fill('Another tester');
    await legacyPage.locator('#tester').selectOption('tester:Lanre');
    await legacyPage.reload();
    assert.equal(await legacyPage.evaluate(version=>localStorage.getItem(`appreg-uat:${version}:CORE-01`),source.version),legacyValue);
    await legacyPage.getByRole('radio',{name:'Pass',exact:true}).check();
    assert.equal(await legacyPage.locator('#comments').inputValue(),'Existing saved comment — preserve exactly.');
    assert.equal(await legacyPage.locator('#completed-by').textContent(),'Another tester');
    // Blank workbook assignments are displayed and filtered as Unassigned.
    const blanks=await browser.newContext();
    await blanks.route('**/assets/allocations.js',route=>route.fulfill({contentType:'application/javascript',body:`window.UAT_ALLOCATIONS = ${JSON.stringify({...allocations,assignments:{...allocations.assignments,'CORE-01':null}})};`}));
    const blankPage=await blanks.newPage();await blankPage.goto(url);await blankPage.waitForSelector('.scenario-card');
    assert.equal(await blankPage.locator('#assigned-tester').textContent(),'Unassigned');
    await blankPage.locator('#tester').selectOption('__unassigned__');
    assert.equal(await blankPage.locator('.scenario-card').count(),1);
    assert.equal(await blankPage.locator('#total-copy').textContent(),'of 1 scenarios completed');
    await blankPage.locator('#completing-tester').fill('Unassigned case tester');
    await blankPage.getByRole('radio',{name:'Partially Passed',exact:true}).check();
    assert.equal(await blankPage.locator('#completed-count').textContent(),'1');
    const blankDownload=blankPage.waitForEvent('download');await blankPage.locator('#download').click();
    await (await blankDownload).saveAs(path.join(output,'unassigned-results.pdf'));
    const blocked=await browser.newContext();
    await blocked.addInitScript(()=>{Storage.prototype.getItem=function(){throw new Error('Disabled storage');};Storage.prototype.setItem=function(){throw new Error('Disabled storage');};});
    const failed=await blocked.newPage();await failed.goto(url);
    await failed.waitForSelector('.scenario-card');
    assert(await failed.locator('#storage-warning').isVisible());
    await failed.getByRole('radio',{name:'Pass',exact:true}).check();
    assert.equal(await failed.locator('#completed-count').textContent(),'1');
    assert(await failed.locator('#download').isEnabled());
    const bad=await browser.newContext();
    await bad.addInitScript(({version})=>localStorage.setItem(`appreg-uat:${version}:CORE-01`,'broken-json'),{version:source.version});
    const corrupted=await bad.newPage();await corrupted.goto(url);await corrupted.waitForSelector('.scenario-card');
    assert(await corrupted.locator('#storage-warning').isVisible());
    assert.equal(await corrupted.locator('#completed-count').textContent(),'0');
    // Clean review preview uses the real allocation data and no fabricated results.
    const review=await browser.newContext({viewport:{width:1440,height:1100}});
    const reviewPage=await review.newPage();await reviewPage.goto(url);await reviewPage.waitForSelector('.scenario-card');
    await reviewPage.locator('#tester').selectOption('tester:Lanre');
    await reviewPage.locator('#scenario-heading').focus();await reviewPage.evaluate(()=>{document.activeElement.blur();window.scrollTo(0,0);});
    await reviewPage.screenshot({path:path.join(output,'review.png'),fullPage:false});
    assert.deepEqual(errors,[]);
    console.log('PASS: 107 exact scenario displays and ID-matched allocations; tester filters and progress, Unassigned cases, completer attribution, legacy saved results, outcomes, comments, navigation, filters, persistence, failed/corrupt storage, keyboard, mobile, subpath hosting and PDF downloads.');
    console.log(`QA fixtures: ${output}`);
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
