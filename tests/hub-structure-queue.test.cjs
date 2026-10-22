const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('a failing hub backs off and cannot starve the other queued hubs',async()=>{
 const source=fs.readFileSync('worker/worker.js','utf8'),start=source.indexOf('async function hubStructureDrain('),end=source.indexOf('// The canonical card',start),kv=new Map(),calls=[];
 kv.set('sync:enabled:v1',true);for(const cid of ['a','b','c'])kv.set('sync:queue:'+cid,{at:Date.now()-1000});
 const env={TRADES:{get:async k=>kv.get(k)||null,put:async(k,v)=>kv.set(k,JSON.parse(v))}},ctx=vm.createContext({Date,JSON,Math,HUB_SITES:['a','b','c'].map(campaignId=>({campaignId})),hierarchyId:x=>x,hubSitesMerge:async()=>{},hubStructureInvoke:async(e,b)=>{calls.push(b.campaignId);if(b.campaignId==='a')throw Error('Notion unavailable for a');return {success:true,placement:{pending:0}};}});
 vm.runInContext(source.slice(start,end),ctx);await ctx.hubStructureDrain(env);assert.deepEqual(calls,['a','b']);assert.ok(kv.get('sync:queue:a').nextAt>Date.now());await ctx.hubStructureDrain(env);assert.deepEqual(calls,['a','b','c']);assert.ok(kv.get('sync:queue:c').doneAt);
});
