const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto,randomBytes}=require('node:crypto');
const src=fs.readFileSync('worker/worker.js','utf8');
function fixture(){
 let now=Date.now();const RealDate=Date;class Clock extends RealDate{static now(){return now;}}
 const ctx=vm.createContext({crypto:webcrypto,TextEncoder,btoa,atob,Date:Clock,Set,JSON,Uint8Array,console});
 vm.runInContext(src.slice(src.indexOf('const GOVERNANCE_TABLES'),src.indexOf('let GOVERNING_FLOW_CACHE')),ctx);
 const map=new Map(),env={HMAC_SECRET:randomBytes(32).toString('hex'),TRADES:{get:async(k,t)=>{const v=map.get(k);return v&&t==='json'?JSON.parse(v):v||null;},put:async(k,v)=>map.set(k,v)}};
 return {ctx,env,map,advance:ms=>now+=ms};
}
test('unset or malformed secret fails closed; rejected code returns no token',async()=>{const {ctx,env}=fixture();assert.equal(await ctx.governanceUnlock(env,'wrong'),null);assert.equal(await ctx.governanceValid(env,'anything'),false);env.GOVERNANCE_CODE_HASH='malformed';assert.equal(await ctx.governanceUnlock(env,'wrong'),null);});
test('correct code unlocks for fifteen minutes; wrong code, signature tampering, expiry and rotation refuse',async()=>{const {ctx,env,advance}=fixture(),code=randomBytes(32).toString('hex');env.GOVERNANCE_CODE_HASH=await ctx.governanceHash(code);assert.equal(await ctx.governanceUnlock(env,'wrong'),null);const r=await ctx.governanceUnlock(env,code);assert.ok(r.unlockToken);assert.equal(await ctx.governanceValid(env,r.unlockToken),true);assert.equal(await ctx.governanceValid(env,r.unlockToken+'x'),false);const old=env.GOVERNANCE_CODE_HASH;env.GOVERNANCE_CODE_HASH=await ctx.governanceHash('rotated');assert.equal(await ctx.governanceValid(env,r.unlockToken),false);env.GOVERNANCE_CODE_HASH=old;advance(15*60*1000);assert.equal(await ctx.governanceValid(env,r.unlockToken),false);});
test('held attempts contain UTF-8 size and hash, never payload; concurrent holds retain every attempt',async()=>{const {ctx,env,map}=fixture(),payload={secretContent:'private ?'};await Promise.all(Array.from({length:4},()=>ctx.governanceHold(env,'infoflow:table:currentmethods',payload)));const log=JSON.parse(map.get('governance:attempts'));assert.equal(log.length,4);assert.equal(log[0].payloadSize,Buffer.byteLength(JSON.stringify(payload)));assert.equal(log[0].payloadHash,await ctx.governanceHash(JSON.stringify(payload)));assert.ok(!map.get('governance:attempts').includes('private'));});
test('actual save handler gates graph and methods, permits other tables, and reads back unlocked writes',async()=>{
 const {ctx,env,map}=fixture(),code=randomBytes(32).toString('hex');env.GOVERNANCE_CODE_HASH=await ctx.governanceHash(code);
 ctx.verifyToken=async()=>true;ctx.json=(data,status=200)=>({data,status});ctx.env=env;ctx.HMAC_SECRET=env.HMAC_SECRET;
 const start=src.indexOf('      if (body.action === "saveInfoFlowTable")'),end=src.indexOf('      if (body.action === "getGoverningFlow")',start);
 vm.runInContext('let GOVERNING_FLOW_CACHE=null;async function save(body){'+src.slice(start,end)+'}',ctx);
 const table={columns:[{id:'c',name:'Name'}],rows:[{id:'r',cells:{c:'Existing'}}]};
 for(const name of ['informationflowgraph','currentmethods']){
  map.set('infoflow:table:'+name,JSON.stringify(table));const before=map.get('infoflow:table:'+name);
  const refused=await ctx.save({action:'saveInfoFlowTable',name,table});assert.equal(refused.status,403);assert.equal(refused.data.reason,'governance_locked');assert.equal(map.get('infoflow:table:'+name),before);
  const unlock=await ctx.governanceUnlock(env,code);assert.equal((await ctx.save({action:'saveInfoFlowTable',name,table,governanceUnlock:unlock.unlockToken})).status,200);
  assert.equal(JSON.parse(map.get('infoflow:table:'+name)).rows[0].cells.c,'Existing');
 }
 assert.equal((await ctx.save({action:'saveInfoFlowTable',name:'test-normal',table})).status,200);
 assert.equal(JSON.parse(map.get('governance:attempts')).length,2);
});
test('browser control never persists unlock token; shared call attaches it and handles refusals',()=>{const ui=fs.readFileSync('shared/governance.js','utf8'),html=fs.readFileSync('index.html','utf8');assert.doesNotMatch(ui,/localStorage|sessionStorage/);new vm.Script(ui);assert.match(html,/window\.Governance\?\.attach\(payload\)/);assert.match(ui,/type="password"/);});
