const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8'),worker=fs.readFileSync('worker/worker.js','utf8');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src=|application\/json/.test(m[1]))new vm.Script(m[2]);
const statsCode=worker.match(/^function hubProductAssetStats\([\s\S]*?^}/m)[0];
const ctx=vm.createContext({});vm.runInContext(statsCode,ctx);
const product=(id,out=false,archived=false)=>({id,properties:{'Keywords Out of Sync':{checkbox:out},Archived:{checkbox:archived}}});
const title=(id,ids)=>({id,properties:{product:{relation:ids.map(id=>({id}))}}});
const asset=(id,status,ids,extra={})=>({id,...extra,properties:{'Asset Status':{select:{name:status}},'Content Strategy':{relation:ids.map(id=>({id}))},Product:{relation:[{id:'p1'}]}}});
const stats=ctx.hubProductAssetStats([product('p-1'),product('p2',true),product('p3'),product('gone',false,true)],
 [title('t1',['p1','p2']),title('t2',['p1']),title('t3',['gone'])],
 [asset('a1','Development',['t1','t2']),asset('a2','Published',['t2']),asset('a3','Published',[]),asset('a4','Publish',['t1']),asset('a5','Published',['t1'],{archived:true}),asset('a6','Published',['t3'])]);
assert.deepEqual(JSON.parse(JSON.stringify(stats)),{p1:{development:1,published:1,synced:'Synced'},p2:{development:1,published:0,synced:'Out of sync'},p3:{development:0,published:0,synced:'Synced'}});
const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{style:{display:'none'},innerHTML:'',textContent:'',value:''});return elements.get(id);};
get('hubProductsAuditData').textContent=html.match(/<script id="hubProductsAuditData" type="application\/json">([\s\S]*?)<\/script>/)[1];
const storage=new Map();const ui=vm.createContext({document:{getElementById:get},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),setTimeout:()=>{}});
const code=html.slice(html.indexOf('// Hub Products: independent'),html.indexOf('// Flat, cross-campaign'));
vm.runInContext(code,ui);const run=code=>vm.runInContext(code,ui);
run('hpInit()');assert.equal(run('HP_ROWS.length'),269);assert.equal(run('HP_COLS.length'),11);
assert.equal(run('hpCmp({development:2,product:"a"},{development:10,product:"b"})'),-1); // default hub blank ties by product
run('HP_SORT=[{col:"development",asc:true}]');assert.ok(run('hpCmp({development:2},{development:10})')<0);
run('HP_SORT=[{col:"development",asc:false}]');assert.ok(run('hpCmp({development:2},{development:10})')>0);assert.ok(run('hpCmp({development:null},{development:0})')>0);
run('HP_F=[{col:"hub",val:"Surf Vacations"},{col:"published",val:"0"}];hpApplyLive({})');assert.match(get('hpContent').innerHTML,/No matching/);
run('HP_F=[{col:"hub",val:"Surf Vacations"},{col:"",val:""}];HP_SORT=[{col:"hub",asc:true},{col:"product",asc:true}];renderHp()');
assert.match(get('hpContent').innerHTML,/Surf Vacations/);assert.doesNotMatch(get('hpContent').innerHTML,/Build Watcher/);
run('hpCollapseAll(false)');assert.match(get('hpContent').innerHTML,/Show keywords/);run('hpCollapseAll(true)');assert.doesNotMatch(get('hpContent').innerHTML,/Show keywords/);
run('hpSaveClick({textContent:"Save"});HP_F=[{col:"",val:""},{col:"",val:""}];hpLoadSaved()');assert.equal(run('HP_F[0].val'),'Surf Vacations');
run("const HUB_SITES=[...new Set(HP_ROWS.map(r=>r.hub))].map((name,i)=>({name,slug:'test-'+i}));");
const allSort=run('JSON.stringify(HP_SORT)'),allFilters=run('JSON.stringify(HP_F)');
for(let i=0;i<12;i++){
 assert.equal(run(`hpWithHub('test-${i}',()=>HP_ROWS.every(r=>r.hub===HUB_SITES[${i}].name))`),true);
 run(`hpWithHub('test-${i}',()=>{HP_SORT=[{col:'published',asc:false}];HP_F=[{col:'synced',val:'Synced'},{col:'',val:''}];})`);
 assert.equal(run(`hpWithHub('test-${i}',()=>HP_F[0].val)`),'Synced');
}
assert.equal(run('HP_ROWS.length'),269);assert.equal(run('JSON.stringify(HP_SORT)'),allSort);assert.equal(run('JSON.stringify(HP_F)'),allFilters);
assert.throws(()=>run("hpWithHub('test-0',()=>{throw new Error('scope test')})"),/scope test/);assert.equal(run('HP_SCOPE'),'all');
assert.equal(run("hpWithHub('test-0',()=>hpStorageKey('hpView'))"),'hpView:test-0');
assert.equal(run("hpStorageKey('hpView')"),'hpView');
run("const deferredScope=hpWithHub('test-0',()=>hpInScope(HP_SCOPE,()=>HP_SCOPE));");assert.equal(run('deferredScope()'),'test-0');assert.equal(run('HP_SCOPE'),'all');
console.log('PASS: asset stats, sync, sorting, filters, headings, saved views, 12 locked hub scopes, independent state, and deferred drag scope.');
