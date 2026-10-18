import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {columns, initialRecord, revenueAction} from '../worker/hub-revenue.mjs';
const worker=readFileSync(new URL('../worker/worker.js',import.meta.url),'utf8');
const hubs=vm.runInNewContext(worker.match(/const HUB_SITES = (\[[\s\S]*?\n\]);/)[1]);
function setup(){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE sentinel_keywords (name TEXT); INSERT INTO sentinel_keywords VALUES (\'untouched\')');
 const db={prepare(query){let values=[];return {bind(...args){values=args;return this;},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:r.changes}};},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
 const api=body=>revenueAction({KWDB:db},body,hubs);
 const save=(id,columnId,value)=>api({action:'saveHubRevenueCell',hubId:id,columnId,value});
 const change=body=>api({action:'changeHubRevenueColumn',...body});
 return {sql,api,save,change};
}
test('one seed per existing hub, correct priorities, safe repeat initialization',async()=>{
 const {api,save,sql}=setup();
 const first=await api({action:'getHubRevenue'});
 assert.equal(first.rows.length,hubs.length);assert.equal(new Set(first.rows.map(r=>r.hubId)).size,hubs.length);
 assert.deepEqual(first.rows.filter(r=>r.cells.priority).map(r=>r.cells.priority).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);
 const build=first.rows.find(r=>r.cells.priority===1);
 assert.equal(build.cells.price,'$1,500–$3,000');assert.match(build.cells.funnel,/Construction owner →/);
 await save(build.hubId,'funnel','');await save(build.hubId,'priority',0);await save(build.hubId,'notes','New plan\nSecond line');
 const second=await api({action:'getHubRevenue'}),row=second.rows.find(r=>r.hubId===build.hubId);
 assert.equal(row.cells.funnel,'');assert.equal(row.cells.priority,0);assert.equal(row.cells.notes,'New plan\nSecond line');
 assert.equal(sql.prepare('SELECT name FROM sentinel_keywords').get().name,'untouched');
});
test('atomic updates retain independent concurrent edits',async()=>{
 const {api,save}=setup();const {rows}=await api({action:'getHubRevenue'});const id=rows[0].hubId;
 await Promise.all([save(id,'notes','A'),save(id,'price','B'),save(id,'status','Testing')]);
 const row=(await api({action:'getHubRevenue'})).rows.find(r=>r.hubId===id);
 assert.equal(row.cells.notes,'A');assert.equal(row.cells.price,'B');assert.equal(row.cells.status,'Testing');
});
test('all custom types; stable IDs preserve values on rename and reorder; deletion confirmation',async()=>{
 const {api,save,change}=setup();const {rows}=await api({action:'getHubRevenue'});const id=rows[0].hubId;
 for(const type of ['text','multiline','number','select']){
  let r=await change({operation:'add',name:'Custom '+type,type,options:['One','Two']});const col=r.columns.at(-1);
  const value=type==='number'?0:type==='select'?'Two':'Editable\ntext';await save(id,col.id,value);
  r=await change({operation:'rename',columnId:col.id,name:'Renamed'});assert.equal(r.columns.at(-1).id,col.id);
  r=await change({operation:'move',columnId:col.id,direction:-1});assert.equal(r.columns.at(-2).id,col.id);
  assert.equal((await api({action:'getHubRevenue'})).rows.find(r=>r.hubId===id).cells[col.id],value);
  r=await change({operation:'delete',columnId:col.id});assert.equal(r.needsConfirmation,true);
  assert.ok((await api({action:'getHubRevenue'})).columns.some(c=>c.id===col.id));
  r=await change({operation:'delete',columnId:col.id,confirmDelete:true});assert.ok(!r.columns.some(c=>c.id===col.id));
 }
});
test('invalid hub, read-only relation, invalid select and numbers are rejected',async()=>{
 const {api,save,change}=setup();const {rows}=await api({action:'getHubRevenue'});const id=rows[0].hubId;
 await assert.rejects(save('unknown','notes','bad'));
 await assert.rejects(save(id,'hub','bad'));
 await assert.rejects(save(id,'status','Invalid'));
 await assert.rejects(save(id,'priority','NaN'));
 await assert.rejects(change({operation:'delete',columnId:'priority',confirmDelete:true}));
 await assert.rejects(change({operation:'add',name:'Empty select',type:'select',options:[]}));
});
test('delete empty custom column needs no confirmation',async()=>{
 const {change}=setup();const added=await change({operation:'add',name:'Empty',type:'text'});
 const removed=await change({operation:'delete',columnId:added.columns.at(-1).id});assert.equal(removed.success,true);
});
test('planner rendering shares records, filters, priority sorts and escapes text',async()=>{
 const {api}=setup();const data=await api({action:'getHubRevenue'});
 const host={dataset:{slug:'owners-rep'},innerHTML:''};
 const context=vm.createContext({HUB_SITES:hubs,document:{querySelectorAll:selector=>selector==='.hub-revenue'?[host]:[]},window:{addEventListener(){}},esc:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),call:async()=>data,confirm:()=>false});
 vm.runInContext(readFileSync(new URL('../shared/hub-revenue.js',import.meta.url),'utf8'),context);
 await vm.runInContext('hrLoad()',context);
 assert.equal((host.innerHTML.match(/data-col="priority"/g)||[]).length,1);
 vm.runInContext("hubRevenue.views['owners-rep']={portfolio:true};hrPaint()",context);
 assert.equal((host.innerHTML.match(/data-col="priority"/g)||[]).length,hubs.length);
 assert.ok(host.innerHTML.indexOf('Build Watcher — Priority')<host.innerHTML.indexOf('AI Implementation — Priority'));
 for(const [key,value] of [['hub','Build Watcher'],['priority','1'],['channel','outbound']]){
  vm.runInContext(`hubRevenue.views['owners-rep']={portfolio:true,${key}:${JSON.stringify(value)}};hrPaint()`,context);
  assert.equal((host.innerHTML.match(/data-col="priority"/g)||[]).length,1);
 }
 vm.runInContext("hubRevenue.views['owners-rep']={portfolio:true,status:'Active'};hrPaint()",context);assert.match(host.innerHTML,/No matching hubs/);
 data.rows.find(r=>r.cells.priority===1).cells.notes='<script>alert(1)</script>';
 vm.runInContext("hubRevenue.views['owners-rep']={};hrPaint()",context);assert.match(host.innerHTML,/&lt;script&gt;/);
});
