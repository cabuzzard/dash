import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import * as rules from '../worker/digest-memory.mjs';
const source=fs.readFileSync('worker/worker.js','utf8');
const block=source.slice(source.indexOf('// WEEKLY RESEARCH MEMORY —'),source.indexOf('// END WEEKLY RESEARCH MEMORY'));
const kv=()=>{const data=new Map();return {data,get:async(k,t)=>data.has(k)?t==='json'?JSON.parse(data.get(k)):data.get(k):null,put:async(k,v)=>data.set(k,v)};};
function context(extra={}){const c=vm.createContext({...rules,JSON,Date,URL,String,Set,Map,Array,Number,Object,crypto:webcrypto,TextEncoder,hubAssetId:x=>String(x||'').replaceAll('-',''),governanceHash:async s=>Buffer.from(await webcrypto.subtle.digest('SHA-256',Buffer.from(s))).toString('hex'),...extra});vm.runInContext(block,c);return c;}
test('Care Gap first run persists findings; next run confirms old claim, adds new claim, preserves changed history',async()=>{
 const store=kv(),c=context(),env={TRADES:store};const first={url:'https://example.org/housing?utm_source=x',claim:'Fund provides stable housing',topicId:'housing',publisher:'Foundation',date:'2026-10-23'};
 let run=await c.digestMemoryCommit(env,'hub','run1',[first,first]);assert.equal(run.new,1);let m=await c.digestMemory(env,'hub');const id=m.items[0].id;
 const immutable=await store.get('digest:memory:finding:hub:'+id);
 run=await c.digestMemoryCommit(env,'hub','run2',[{...first,url:'https://example.org/housing'},{...first,url:'https://example.org/report',claim:'Fund opened a second housing placement'},{...first,claim:'Fund now provides three placements',changes:id}]);
 assert.equal(run.new,1);assert.equal(run.confirmed,1);assert.equal(run.changed,1);assert.equal(run.shareNew,2/3);
 m=await c.digestMemory(env,'hub');assert.equal(m.items.length,3);assert.equal(m.items[0].claim,first.claim);assert.equal(m.items[0].lastConfirmedRun,'run2');assert.equal(await store.get('digest:memory:finding:hub:'+id),immutable);
 assert.equal((await c.digestMemoryCommit(env,'hub','run2',[first])).new,1);assert.equal((await c.digestMemory(env,'hub')).items.length,3);
 const preview=await c.digestMemoryTest(env,'hub');assert.equal(preview.excludeUrls.length,2);assert.match(await c.digestMemoryBrief(env,'hub'),/ALREADY KNOWN/);
});
test('same URL with a separate claim is new; only explicit supported references link changes',()=>{
 const memory={items:[{id:'a',url:'https://example.org',claim:'One fact'}]};const p=rules.memoryPlan(memory,[{url:'https://example.org',claim:'A separate fact'},{url:'https://example.org/new',claim:'An unsupported contradiction',contradicts:'unknown'}],'r');assert.equal(p.new.length,2);assert.equal(p.changed.length,0);
});
test('Current form notes are excluded, expired/Rising freshness and stable topic IDs are retained',()=>{
 const topics=[{id:'smv1',name:'Housing'},{id:'id2',name:'Donor impact'}],notes=[{topicId:'smv1',form:'Checklist',status:'Current',staleAfter:'2026-12-01'},{topicId:'id2',form:'Workbook',status:'Current',staleAfter:'2026-10-01'}],gaps=rules.marketGaps(topics,notes,Date.parse('2026-10-23'));
 assert.ok(!gaps[0].forms.includes('Checklist'));assert.ok(gaps[1].forms.includes('Workbook'));assert.equal(rules.marketStaleAfter('2026-10-23','Rising'),'2026-11-13');assert.equal(rules.marketStaleAfter('2026-10-23','Steady'),'2026-12-07');
 notes[0].contradicted=true;assert.ok(rules.marketGaps(topics,notes,Date.parse('2026-10-23'))[0].forms.includes('Checklist'));
});
test('weekly starts are staggered inside Sunday window, Monday belongs to Sunday, no additional schedule',()=>{
 assert.equal(rules.weeklySlot({open:true,hour:20,minute:0},0,12),true);assert.equal(rules.weeklySlot({open:true,hour:20,minute:0},1,12),false);assert.equal(rules.weeklySlot({open:true,hour:5,minute:0},11,12),true);assert.equal(rules.weeklySlot({open:false,hour:6},11,12),false);
 assert.doesNotMatch(source.slice(source.indexOf('async function adStep('),source.indexOf('async function autoDigestRun(')),/hubListSubscribers/);assert.match(source,/digest:weekly:activation/);
 const config=fs.readFileSync('worker/wrangler.toml','utf8');assert.match(config,/digest-memory\.mjs/);assert.equal((config.match(/crons = \[(.*)\]/)[1].match(/"[^"]+"/g)||[]).length,6);
});
test('diagnostic actions and memory helpers are model-free and never write the graph',async()=>{
 const store=kv(),c=context(),env={TRADES:store};await c.digestMemoryTest(env,'hub');assert.equal(store.data.size,0);assert.doesNotMatch(block,/hcClaude|ANTHROPIC|informationflowgraph/);
});
test('memory failure does not silently discard unreadable history',async()=>{const store=kv(),c=context();await store.put('digest:memory:hub',JSON.stringify({items:'corrupt'}));await assert.rejects(c.digestMemory({TRADES:store},'hub'),/unreadable/);});
test('successful paid provider responses are checkpointed, so a retry makes zero additional calls',async()=>{
 let calls=0;const store=kv(),c=context({Response,fetch:async()=>{calls++;return new Response(JSON.stringify({output_text:'saved research',usage:{cost:{total_cost:0.12}}}),{status:200});}}),env={TRADES:store,PERPLEXITY_API_KEY:'fixture'};
 const a=await c.digestProviderFetch(env,{id:'run'},'perplexityResearch','text only'),b=await c.digestProviderFetch(env,{id:'run'},'perplexityResearch','text only');assert.equal(calls,1);assert.equal(a.replayed,false);assert.equal(b.replayed,true);assert.equal((await b.response.json()).output_text,'saved research');
});
test('existing findings seed the bank without researching again and retain the actual earlier run date',async()=>{
 const store=kv(),c=context(),env={TRADES:store};await store.put('digest:title:hub','title');await store.put('digest:sources:title',JSON.stringify({at:'2026-10-16T05:00:00Z',sources:[{claim:'Earlier finding',url:'https://example.org/old'}]}));await c.digestMemorySeed(env,'hub');await c.digestMemorySeed(env,'hub');const m=await c.digestMemory(env,'hub');assert.equal(m.items.length,1);assert.equal(m.lastRun.at,'2026-10-16T05:00:00Z');
});
