// Browser tests for Task Planner. Run:  node tests/run_tests.js
// Requires Playwright (npm i playwright). Screenshots are written to ./screenshots
const { chromium } = require('playwright');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const shots = path.resolve(__dirname, '..', 'screenshots');

const results = [];
function check(id, desc, ok, detail = '') {
  results.push({ id, desc, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${desc}${detail ? '  -> ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  const fresh = async () => { await page.goto(url); };
  const add = async (name, hours, pr) => {
    await page.fill('#task-name', name);
    await page.fill('#task-hours', String(hours));
    await page.selectOption('#task-priority', String(pr));
    await page.click('#task-form button[type=submit]');
  };
  const setPlan = async (len, cap) => {
    await page.selectOption('#plan-length', String(len));
    await page.fill('#daily-hours', String(cap));
  };
  const plan = async () => { await page.click('#build-plan'); };
  const dayText = async () => page.$$eval('#plan-output .day', ds => ds.map(d => d.innerText.replace(/\n+/g, ' | ')));
  const err = async sel => (await page.textContent(sel)).trim();

  // TC-01 validation
  await fresh();
  await add('', 1, 2);
  let e1 = await err('#form-error');
  await add('Bad task', -2, 2);
  let e2 = await err('#form-error');
  await page.screenshot({ path: path.join(shots, '03_validation.png'), clip: { x: 0, y: 0, width: 1100, height: 520 } });
  await add('Bad task', 0, 2);
  let e3 = await err('#form-error');
  await add('Bad task', 25, 2);
  let e4 = await err('#form-error');
  await add('Bad task', 0.3, 2);
  let e5 = await err('#form-error');
  const n1 = await page.textContent('#task-count');
  check('TC-01', 'Empty name, negative, zero, >24 and non-0.25 hours are rejected',
    e1 && e2 && e3 && e4 && e5 && n1 === '0', `tasks added=${n1}`);

  // TC-02 sample weekly output (matches report)
  await fresh();
  await page.click('#load-sample');
  await setPlan(5, 8);
  await plan();
  const d = await dayText();
  const ok2 = d.length === 5 && /Monday.*3 of 8 hours.*Prepare presentation/.test(d[0])
    && /Tuesday.*2 of 8 hours.*Code review/.test(d[1]) && /Wednesday.*1 of 8 hours.*Email cleanup/.test(d[2])
    && /Thursday.*0 of 8 hours.*No tasks/.test(d[3]) && /Friday.*0 of 8 hours.*No tasks/.test(d[4]);
  check('TC-02', 'Sample tasks produce the expected 5-day plan', ok2, d.join(' // '));
  await page.screenshot({ path: path.join(shots, '01_weekly_plan.png'), fullPage: true });

  // TC-03 priority ordering (Low entered first) on a daily plan
  await fresh();
  await add('Low job', 1, 1); await add('Medium job', 1, 2); await add('High job', 1, 3);
  await setPlan(1, 8); await plan();
  const order = await page.$$eval('#plan-output .day li', li => li.map(l => l.firstChild.textContent));
  check('TC-03', 'High priority is scheduled before Medium and Low regardless of entry order',
    order.join(',') === 'High job,Medium job,Low job', order.join(','));
  await page.screenshot({ path: path.join(shots, '04_daily_plan.png'), fullPage: true });

  // TC-04 overflow (daily, 3 x 4h into 8h)
  await fresh();
  await add('Report', 4, 3); await add('Study', 4, 2); await add('Gym', 4, 1); await add('Laundry', 2, 1);
  await setPlan(1, 8); await plan();
  const ovHidden = await page.$eval('#overflow-message', el => el.hidden);
  const ovText = await page.textContent('#overflow-message');
  check('TC-04', 'Tasks beyond daily capacity are listed as overflow (lowest priority dropped)',
    !ovHidden && /Gym/.test(ovText) && /Laundry/.test(ovText) && !/Report/.test(ovText), ovText.replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: path.join(shots, '02_overflow.png'), fullPage: true });

  // TC-05 task larger than daily capacity
  await fresh();
  await add('Huge task', 10, 3);
  await setPlan(5, 8); await plan();
  check('TC-05', 'A task longer than one day\'s capacity goes to overflow',
    !(await page.$eval('#overflow-message', el => el.hidden)) && /Huge task/.test(await page.textContent('#overflow-message')));

  // TC-06 no tasks
  await fresh(); await plan();
  check('TC-06', 'Creating a plan with no tasks shows a helpful message',
    /Add at least one task/.test(await page.textContent('#plan-placeholder')));

  // TC-07 invalid capacity
  await fresh(); await add('A', 1, 2);
  await setPlan(5, 30); await plan();
  const e7 = await err('#settings-error');
  const e7b = (await dayText()).length;
  check('TC-07', 'Invalid daily hours (30) are rejected and no plan is drawn', e7.length > 0 && e7b === 0, e7);

  // TC-08 XSS-style input rendered as text
  await fresh();
  await add('<img src=x onerror="window.__x=1"><b>hi</b>', 1, 2);
  await setPlan(1, 8); await plan();
  const xss = await page.evaluate(() => window.__x);
  const rendered = await page.textContent('#plan-output');
  check('TC-08', 'HTML in a task name is shown as plain text, not executed', xss === undefined && rendered.includes('<img'));

  // TC-09 remove task
  await fresh(); await page.click('#load-sample');
  await page.click('#task-list li:first-child button');
  check('TC-09', 'Remove button deletes only that task', (await page.textContent('#task-count')) === '2');

  // TC-10 plan lengths / day names
  await fresh(); await add('A', 1, 2);
  await setPlan(1, 8); await plan(); const n10a = (await dayText()).length; const t10 = (await dayText())[0].startsWith('Today');
  await setPlan(7, 8); await plan(); const n10b = (await dayText()); 
  check('TC-10', 'Plan lengths 1/5/7 give Today / Mon-Fri / Mon-Sun', n10a === 1 && t10 && n10b.length === 7 && /Sunday/.test(n10b[6]));

  // TC-11 ties keep entry order & fractional hours
  await fresh();
  await add('First', 0.25, 2); await add('Second', 0.25, 2); await add('Third', 0.5, 2);
  await setPlan(1, 1); await plan();
  const o11 = await page.$$eval('#plan-output .day li', li => li.map(l => l.firstChild.textContent));
  const cap11 = await page.$eval('#plan-output .day .cap', c => c.textContent);
  check('TC-11', 'Equal priorities keep entry order; 0.25 h steps sum exactly (fills 1 of 1 h)',
    o11.join(',') === 'First,Second,Third' && cap11 === '1 of 1 hours', cap11);

  // TC-12 known limitation of the greedy "least-filled day" rule
  await fresh();
  for (let i = 1; i <= 5; i++) await add('Block ' + i, 4, 3);
  await add('Long task', 5, 2);
  await setPlan(5, 8); await plan();
  const lim = await page.textContent('#overflow-message');
  const totalIn = 5 * 4 + 5;
  check('TC-12', `LIMITATION: ${totalIn} h of work vs 40 h capacity, yet 'Long task' (5 h) is reported as not fitting`,
    /Long task/.test(lim), 'greedy least-filled placement fragments free time');
  await page.screenshot({ path: path.join(shots, '05_limitation.png'), fullPage: true });

  // TC-13 suggested-plan label always visible
  await fresh();
  const lab = await page.textContent('.label-chip'); const disc = await page.textContent('.disclaimer');
  check('TC-13', 'Output is clearly labelled as a suggested plan', /SUGGESTED PLAN/.test(lab) && /suggested plan/i.test(disc));

  // TC-14 responsive 375px
  const m = await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2 });
  const mp = await m.newPage(); await mp.goto(url);
  await mp.click('#load-sample'); await mp.click('#build-plan');
  const sw = await mp.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth,
    cols: getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length }));
  await mp.screenshot({ path: path.join(shots, '06_mobile.png'), fullPage: true });
  check('TC-14', 'At 375 px width layout is single-column with no horizontal scroll', sw.cols === 1 && sw.s <= sw.c, JSON.stringify(sw));

  check('TC-15', 'No JavaScript errors in console during tests', errors.length === 0, errors.join('; '));

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  require('fs').writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})();
