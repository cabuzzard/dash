const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {webcrypto}=require('node:crypto');
const source=fs.readFileSync('worker/worker.js','utf8');
function context(extra={}){const ctx=vm.createContext({Date,JSON,Math,Number,String,Object,Array,Set,Map,Response,crypto:webcrypto,STRATEGY_FIELDS:['Customer','Offer Structure','Positioning'],hubAssetId:x=>String(x||'').replace(/-/g,''),...extra});vm.runInContext(source.slice(source.indexOf('// RESEARCH GATE —'),source.indexOf('// END RESEARCH SEARCH HOOK')),ctx);return ctx;}
const kv=()=>{const data=new Map();return {data,get:async(k,type)=>data.has(k)?type==='json'?JSON.parse(data.get(k)):data.get(k):null,put:async(k,v)=>data.set(k,v)};};
const rt=value=>({rich_text:[{plain_text:value,text:{content:value}}]});
test('freshness distinguishes stable, topical, volatile and unknown audience sections',()=>{
 const c=context(),now=Date.now(),fields={'Product Facts':'facts','Title Angle':'angle','News':'news','Something audience-facing':'unknown'};
 const stamps=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,{at:new Date(now-1000).toISOString(),hash:c.researchFingerprint(v),keywordsVersion:1,upstream:'same'}]));
 let plan=c.researchPlan({kind:'title',fields,required:Object.keys(fields),stamps,keywordsVersion:2,upstream:'same',now});
 assert.deepEqual(Array.from(plan.decisions,x=>x.decision),['REUSE','REFRESH','REFRESH','REFRESH']);
 plan=c.researchPlan({kind:'title',fields,required:Object.keys(fields),stamps,keywordsVersion:1,upstream:'same',now:now+8*864e5});assert.equal(plan.decisions[0].decision,'REUSE');assert.equal(plan.decisions[1].reason,'research cadence elapsed');
 plan=c.researchPlan({kind:'title',fields,required:Object.keys(fields),stamps,keywordsVersion:1,upstream:'changed',now});assert.ok(plan.decisions.every(x=>x.decision==='REFRESH'));
 plan=c.researchPlan({kind:'title',fields,required:Object.keys(fields),stamps,keywordsVersion:1,upstream:'same',readError:true});assert.ok(plan.decisions.every(x=>x.decision==='MISSING'));
});
test('missing stamps, manual edits, expired/unknown keyword versions and force never silently reuse topical material',()=>{
 const c=context(),fields={'Title Angle':'manual angle'},stamp={at:new Date().toISOString(),keywordsVersion:1,upstream:'s',hash:c.researchFingerprint('manual angle')};
 for(const options of [{stamps:{}},{stamps:{'Title Angle':{...stamp,hash:'old'}}},{stamps:{'Title Angle':stamp},keywordsVersion:null},{stamps:{'Title Angle':stamp},force:true}])assert.notEqual(c.researchPlan({kind:'title',fields,required:['Title Angle'],upstream:'s',keywordsVersion:1,...options}).gate,'reused');
});
test('title research full pass then zero-call reuse then keyword-version partial refresh; old text is replaced',async()=>{
 const store=kv(),names=['Title Intent','Title Questions','Title Angle','Title Audience'];let calls=0,version=1,patches=0;
 const title={properties:Object.fromEntries(names.map(n=>[n,rt('old '+n)]))},product={properties:{Name:{title:[{plain_text:'Product'}]}}};
 const c=context({TITLE_RES_FIELDS:names,hubRichText:a=>(a||[]).map(x=>x.plain_text||x.text?.content||'').join(''),writingFieldValues:()=>({Name:'Product'}),newsletterHdr:()=>({}),kwDashId:x=>x,ivRt:v=>[{plain_text:v,text:{content:v}}],titleTopicKeywords:async()=>({keywords:'real topic'}),kwDemandBlock:async()=>'',hcClaude:async(e,p,n,schema)=>{calls++;assert.match(p,/ESTABLISHED/);assert.equal(Object.keys(schema.properties).length,4);return Object.fromEntries(Object.keys(schema.properties).map((k,i)=>[k,'pass '+calls+' '+names[i]]));}});
 c.researchSnapshot=async()=>({title,product,titleId:'title',worksheet:{inputs:''},upstream:'u',keywordsVersion:version,cadence:'Weekly'});
 c.researchNotion=async(e,path,options)=>{if(options?.method==='PATCH'){patches++;Object.assign(title.properties,JSON.parse(options.body).properties);}return title;};
 const env={TRADES:store};let r=await c.researchTitle(env,{titleId:'title',force:true});assert.equal(calls,1);assert.equal(patches,1);assert.equal(r.counts.reused,1);
 r=await c.researchTitle(env,{titleId:'title'});assert.equal(r.gate,'reused');assert.equal(r.anthropicCalls,0);assert.equal(calls,1);assert.equal(patches,1);
 version=2;r=await c.researchTitle(env,{titleId:'title'});assert.equal(calls,2);assert.equal(r.counts.refreshed,4);assert.equal(r.counts.reused,1);assert.ok(names.every(n=>title.properties[n].rich_text[0].text.content.startsWith('pass 2')));assert.ok(!JSON.stringify(title).includes('pass 1'));
 assert.match((await store.get('research:gate:last:title','json')).summary,/1 reused, 4 refreshed, 0 new/);
});
test('research cache replaces superseded sections, preserves unrelated sections and logs only decisions',async()=>{
 const store=kv(),c=context(),env={TRADES:store};let gate=await c.researchGate(env,{kind:'title',id:'id',fields:{},required:['Angle'],keywordsVersion:1,upstream:'u'});
 await c.researchCommit(env,gate,{Angle:'old',Examples:'keep'});await c.researchCommit(env,gate,{Angle:'new'});
 const state=await store.get(gate.key,'json');assert.deepEqual(state.fields,{Angle:'new',Examples:'keep'});assert.ok(!JSON.stringify(state).includes('old'));assert.ok(!(await store.get('research:gate:log')).includes('Examples'));
});
test('worksheet-derived search checklist does not invent another registry',()=>{
 const c=context();assert.deepEqual(Array.from(c.researchRequired('product facts; title research; examples; current trends')),['Key Claims / Sources','Examples','News / Trends / Zeitgeist']);
 assert.equal(c.researchClass('New audience field','title'),'topical');assert.equal(c.researchClass('Positioning','product'),'stable');
});
test('product fields use the existing version stamp, fill only missing sections, preserve isolation and reuse stable positioning',async()=>{
 const store=kv(),record={id:'record',url:'url',last_edited_time:'2026-10-23T08:00:00Z',properties:{Customer:rt('Known customer'),'Offer Structure':rt('Known offer'),Positioning:rt(''),'Keywords Version':{type:'number',number:1}}};let calls=0,needed=0,version=1;
 const c=context({PRODUCT_RESEARCH_DB:'research',hubRichText:a=>(a||[]).map(t=>t.plain_text||t.text?.content||'').join(''),newsletterHdr:()=>({}),kwDashId:x=>x,ivRt:v=>[{plain_text:v,text:{content:v}}],STRATEGY_FIELD_HINTS:{Customer:'reader','Offer Structure':'offer',Positioning:'position'},researchGuidelinesBlock:()=>'',writingFieldValues:()=>({Name:'Product',Description:'facts'}),notionQuery:async()=>[record],promoteProductStatus:async()=>{},kwClearOutOfSync:async()=>{},kwReviveProduct:async()=>{},hcClaude:async(e,p,n,schema)=>{calls++;needed=Object.keys(schema.properties).length;assert.equal(needed,1);assert.ok(p.includes('Known customer'));return {field_0:'New positioning'};}});
 c.researchSnapshot=async()=>({product:{last_edited_time:'2026-10-20T00:00:00Z',properties:{}},campaign:{last_edited_time:'2026-10-20T00:00:00Z'},research:{last_edited_time:'2026-10-20T00:00:00Z',properties:{}},keywordsVersion:version,upstream:'same',isolated:true});
 c.researchNotion=async(e,path,options)=>{if(options)for(const [k,v]of Object.entries(JSON.parse(options.body).properties))record.properties[k]=Object.hasOwn(v,'number')?{type:'number',...v}:v;return record;};
 let r=await c.researchProductFields({TRADES:store},{productId:'p'});assert.equal(r.counts.reused,2);assert.equal(calls,1);assert.equal(record.properties.Customer.rich_text[0].plain_text,'Known customer');
 version=2;r=await c.researchProductFields({TRADES:store},{productId:'p'});assert.equal(r.anthropicCalls,0);assert.equal(calls,1);assert.equal(record.properties['Keywords Version'].number,2);
});
test('a held title save resumes its generated research without paying for another model call',async()=>{
 const store=kv(),names=['Title Angle'];let calls=0,fail=true;const page={properties:{'Title Angle':rt(''),'Keywords Out of Sync':{checkbox:true}}};
 const c=context({TITLE_RES_FIELDS:names,hubRichText:a=>(a||[]).map(t=>t.plain_text||t.text?.content||'').join(''),newsletterHdr:()=>({}),kwDashId:x=>x,ivRt:v=>[{plain_text:v,text:{content:v}}],titleTopicKeywords:async()=>({keywords:'topic'}),kwDemandBlock:async()=>'',hcClaude:async()=>{calls++;return{field_0:'new angle'};}});
 c.researchSnapshot=async()=>({title:page,titleId:'t',worksheet:{inputs:''},upstream:'u',keywordsVersion:1});c.researchNotion=async(e,path,o)=>{if(fail)throw new Error('temporary Notion failure');if(o)Object.assign(page.properties,JSON.parse(o.body).properties);return page;};
 await assert.rejects(c.researchTitle({TRADES:store},{titleId:'t'}),/temporary/);fail=false;const result=await c.researchTitle({TRADES:store},{titleId:'t'});assert.equal(calls,1);assert.equal(result.resumed,true);assert.equal(result.anthropicCalls,0);assert.ok([...store.data.keys()].some(k=>k.startsWith('research:held:t:')));
});
test('generation search removes only its search tool when fresh and pins established context',async()=>{
 let sent;const c=context({fetch:async(url,options)=>{sent=JSON.parse(options.body);return Response.json({content:[]});}});
 c.researchSearchPrepare=async()=>({snapshot:{titleId:'t'},gate:{gate:'reused',needed:[],established:{Sources:'known'},summary:'reused'}});
 await c.researchModelFetch({__researchRequest:{action:'generateAsset',titleId:'t'}},'https://api.anthropic.com/v1/messages',{body:JSON.stringify({tools:[{name:'web_search'},{name:'write_asset'}],messages:[{role:'user',content:'write'}]})});
 assert.deepEqual(sent.tools,[{name:'write_asset'}]);assert.match(sent.messages[0].content,/known/);assert.equal(sent.messages[1].content,'write');
});
test('search write-back contains tool-returned evidence, never the generated asset copy',async()=>{
 const store=kv();let saved;const c=context({fetch:async()=>Response.json({content:[{type:'web_search_tool_result',content:[{type:'web_search_result',title:'Primary source',url:'https://source.example/report'}]},{type:'text',text:'Sales copy must not become research'}]})});
 c.researchSearchPrepare=async()=>({snapshot:{titleId:'t'},gate:{gate:'research',needed:['Key Claims / Sources'],established:{}}});c.researchWriteTitle=async(e,s,g,fields)=>{saved=fields;};
 await c.researchModelFetch({TRADES:store,__researchRequest:{action:'generateAsset',titleId:'t'}},'https://api.anthropic.com/v1/messages',{body:JSON.stringify({tools:[{name:'web_search'}],messages:[]})});
 assert.match(saved['Key Claims / Sources'],/source.example/);assert.ok(!JSON.stringify(saved).includes('Sales copy'));
});
test('weekly digest always refreshes news and treats earlier claims only as exclusion context',async()=>{
 const store=kv(),c=context(),env={TRADES:store};await store.put('digest:title:cid','t');await store.put('digest:sources:t',JSON.stringify({sources:[{url:'https://prior.example',claim:'older claim'}]}));
 c.researchSnapshot=async()=>({titleId:'t',worksheet:{inputs:'title research'},upstream:'u',keywordsVersion:1});
 const p=await c.researchDigestGate(env,{campaignId:'cid'});assert.ok(p.gate.needed.includes('News / Trends / Zeitgeist'));assert.equal(p.known[0].url,'https://prior.example');
});
test('manual overrides and bulk progress are wired without graph/schema/methodology writes',()=>{
 const html=fs.readFileSync('index.html','utf8');assert.match(html,/generateTitleResearch', \{ titleId: R.tid, force: true/);assert.match(html,/regenerateAllStrategyFields', \{ productId: pid, campaignId: h && h.campaignId, force: true/);
 assert.match(source,/gate:r\?\.gateSummary/);const gateCode=source.slice(source.indexOf('// RESEARCH GATE —'),source.indexOf('// END RESEARCH SEARCH HOOK'));assert.ok(!gateCode.includes('ensureNumberProperty'));assert.ok(!gateCode.includes('informationflowgraph'));assert.ok(!gateCode.includes("researchNotion(env,'databases/"));
});
