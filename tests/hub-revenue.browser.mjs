import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {revenueAction} from '../worker/hub-revenue.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const hubs=vm.runInNewContext(html.match(/const HUB_SITES = (\[[\s\S]*?\n\]);/)[1]);
// Parse every dashboard inline script to catch integration syntax errors.
for(const [,attrs,code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=|type="(?:module|application\/)/.test(attrs))new vm.Script(code);
const sql=new DatabaseSync(':memory:');
const db={prepare(query){let args=[];return {bind(...values){args=values;return this;},async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:r.changes}};},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1400,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('revenueCall',async(action,body={})=>{try{return await revenueAction({KWDB:db},{...body,action},hubs);}catch(e){return {error:e.message};}});
 async function mount(slug='owners-rep'){
  await page.goto('about:blank');
  await page.setContent(`<style>:root{--border:#444;--border2:#555;--surface2:#222;--text:#eee;--text3:#aaa;--danger:red}body{background:#181818;color:#eee;font-family:Arial;padding:16px}button{cursor:pointer}</style><div class="hub-revenue" data-slug="${slug}"></div>`);
  await page.evaluate(hubs=>{window.HUB_SITES=hubs;window.esc=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');window.call=window.revenueCall;},hubs);
  await page.addScriptTag({path:new URL('../shared/hub-revenue.js',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  await page.evaluate(()=>hrLoad());
 }
 const cell=name=>page.getByLabel('Build Watcher — '+name,{exact:true});
 async function saveCell(name,value){await cell(name).fill(value);await cell(name).press('Tab');await page.evaluate(()=>hubRevenue.queue);}
 await mount();assert.equal(await page.locator('tbody tr').count(),1);
 await saveCell('Notes','Browser edit\nSecond line');
 await mount();assert.equal(await cell('Notes').inputValue(),'Browser edit\nSecond line');
 await cell('Status').selectOption('Testing');await page.evaluate(()=>hubRevenue.queue);
 await page.getByRole('button',{name:'Portfolio View',exact:true}).click();assert.equal(await page.locator('tbody tr').count(),hubs.length);
 assert.equal(await page.locator('tbody tr').first().locator('td').nth(1).innerText(),'Build Watcher');
 await page.getByLabel('Status',{exact:true}).selectOption('Testing');assert.equal(await page.locator('tbody tr').count(),1);
 await page.getByLabel('Status',{exact:true}).selectOption('');
 await page.getByLabel('Priority',{exact:true}).fill('2');await page.getByLabel('Priority',{exact:true}).press('Tab');assert.equal(await page.locator('tbody tr').count(),1);
 await page.getByLabel('Priority',{exact:true}).fill('');await page.getByLabel('Priority',{exact:true}).press('Tab');
 await page.getByLabel('Acquisition channel',{exact:true}).fill('YouTube');await page.getByLabel('Acquisition channel',{exact:true}).press('Tab');assert.equal(await page.locator('tbody tr').count(),3);
 await page.getByLabel('Acquisition channel',{exact:true}).fill('');await page.getByLabel('Acquisition channel',{exact:true}).press('Tab');
 await page.getByLabel('Hub',{exact:true}).selectOption('Build Watcher');assert.equal(await page.locator('tbody tr').count(),1);
 await page.getByLabel('Hub',{exact:true}).selectOption('');
 await page.getByRole('button',{name:'Priority ↑',exact:true}).click();assert.equal(await page.locator('tbody tr').last().locator('td').nth(1).innerText(),'Build Watcher');
 await page.getByRole('button',{name:'Individual Hub View',exact:true}).click();
 await page.getByRole('button',{name:'Custom columns',exact:true}).click();
 await page.getByLabel('New column name').fill('Experiment');await page.getByLabel('Column type').selectOption('multiline');
 await page.getByRole('button',{name:'Add column',exact:true}).click();await cell('Experiment').waitFor();
 await saveCell('Experiment','Preserve this');
 await page.getByLabel('Rename custom column').fill('Renamed experiment');await page.getByRole('button',{name:'Rename',exact:true}).click();await cell('Renamed experiment').waitFor();assert.equal(await cell('Renamed experiment').inputValue(),'Preserve this');
 await page.getByRole('button',{name:'←',exact:true}).click();await page.waitForFunction(()=>hubRevenue.data.columns.at(-2).name==='Renamed experiment');
 await mount();assert.equal(await cell('Renamed experiment').inputValue(),'Preserve this');
 await page.getByRole('button',{name:'Custom columns',exact:true}).click();
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Delete',exact:true}).click();assert.equal(await cell('Renamed experiment').count(),1);
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete',exact:true}).click();await cell('Renamed experiment').waitFor({state:'detached'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 assert.equal(await page.locator('table').evaluate(el=>el.parentElement.scrollWidth>el.parentElement.clientWidth),true);
 assert.deepEqual(errors,[]);
 console.log('Browser checks passed: refresh persistence, both views, sorting, all filters, custom add/rename/reorder/delete confirmation, mobile scrolling, inline dashboard syntax.');
} finally {await browser.close();}
