import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import * as nl from '../worker/newsletter-methodology.mjs';
const source=fs.readFileSync('worker/worker.js','utf8');
const fn=name=>{const start=source.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);return source.slice(start,source.indexOf('\n}',start)+2);};
const rt=text=>[{plain_text:text,text:{content:text}}];
test('actual shared Claude helper captures returned usage without adding model calls',async()=>{
 let calls=0,usage;const context=vm.createContext({JSON,fetch:async()=>{calls++;return {ok:true,json:async()=>({usage:{input_tokens:123,output_tokens:45},content:[{type:'tool_use',input:{field:'draft'}}]})};}});
 vm.runInContext(fn('hcClaude'),context);const result=await context.hcClaude({ANTHROPIC_API_KEY:'test'},'text only','tool',{},900,u=>{usage=u;});assert.equal(calls,1);assert.equal(result.field,'draft');assert.deepEqual(usage,{input_tokens:123,output_tokens:45});
 assert.equal((source.match(/if\(onUsage\)/g)||[]).length,1);
});
test('newsletter context queries the existing Products Campaigns relation',async()=>{
 const id='a'.repeat(32),product={id,properties:{Name:{title:[{plain_text:'Premium Newsletter'}]}}},record={id:'b'.repeat(32),properties:{}};
 const context=vm.createContext({hubAssetId:x=>x,hubSitesMerge:async()=>{},PRODUCTS_DB:'products',notionQuery:async(db,query)=>{assert.equal(db,'products');assert.equal(query.filter.property,'Campaigns');return[product];},kwDashId:x=>x,kwTitleOf:()=> 'Premium Newsletter',hubMainList:async()=>[id],findBestProductResearchRecord:async()=>record,newsletterHdr:()=>({}),newsletterValues:()=>({'Research Depth':''}),newsletterDepth:nl.newsletterDepth});
 vm.runInContext(fn('newsletterContext'),context);assert.equal((await context.newsletterContext({TRADES:{get:async()=>null}},id)).productId,id);
});
test('canonical Digest product resolves without changing a current Main selection',async()=>{
 const id='a'.repeat(32),product={id,properties:{}},record={id:'b'.repeat(32),properties:{}};
 const context=vm.createContext({hubAssetId:x=>x,hubSitesMerge:async()=>{},PRODUCTS_DB:'products',notionQuery:async()=>[product],kwDashId:x=>x,kwTitleOf:()=> 'Premium Newsletter',hubMainList:async()=>['other-product'],findBestProductResearchRecord:async()=>record,newsletterHdr:()=>({}),newsletterValues:()=>({'Research Depth':'Deep'}),newsletterDepth:nl.newsletterDepth,ivRid:(p,k)=>p[k]||'',newsletterNotion:async()=>({properties:{Campaign:id,Product:id}})});
 vm.runInContext(fn('newsletterContext'),context);const result=await context.newsletterContext({TRADES:{get:async()=> 'digest'}},id);assert.equal(result.productId,id);assert.match(result.placementWarning,/not currently/);
 context.newsletterNotion=async(e,path)=>({properties:path.endsWith('digest')?{Campaign:id,Product:'old-main-product','Content Strategy':'title'}:{Campaign:id,product:id}});
 assert.equal((await context.newsletterContext({TRADES:{get:async()=> 'digest'}},id)).productId,id);
});
test('the no-bundle Worker upload includes the newsletter module and CI uses the checked Wrangler major',()=>{const config=fs.readFileSync('worker/wrangler.toml','utf8');assert.match(config,/globs\s*=\s*\[[^\]]*"newsletter-methodology\.mjs"/);assert.match(fs.readFileSync('.github/workflows/deploy-worker.yml','utf8'),/wranglerVersion:\s*"4\./);});
const kv=()=>{const values=new Map();return {values,get:async(key,type)=>values.has(key)?type==='json'?JSON.parse(values.get(key)):values.get(key):null,put:async(key,value,options)=>{values.set(key,value);return options;}};};
test('newsletter settings are restricted to four Product Research fields and exact Depth options',()=>{
 assert.equal(nl.newsletterDepth(''),'Deep');
 for(const depth of ['Deep','Standard','Free','Off'])assert.equal(nl.newsletterSetting('Research Depth',depth),depth);
 for(const field of ['Status','Customer','Name','Newsletter Benefit'])assert.throws(()=>nl.newsletterSetting(field,'x'),/not allowed/);
 assert.throws(()=>nl.newsletterSetting('Research Depth','deep'),/Deep, Standard, Free or Off/);
 assert.throws(()=>nl.newsletterSetting('Research Focus','x'.repeat(12001)),/12000/);
});
test('source checks follow public redirects, cache reachability for seven days, and never fetch private destinations',async()=>{
 const store=kv(),options=[],env={TRADES:{...store,put:async(k,v,o)=>{options.push(o);return store.put(k,v,o);}}};let calls=0;
 const fetcher=async(url,init)=>{calls++;assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.ok(init.signal);return calls===1?new Response(null,{status:302,headers:{location:'https://publisher.example/report'}}):new Response('Report',{status:200});};
 const old=globalThis.crypto;assert.ok(webcrypto.subtle);if(!old)globalThis.crypto=webcrypto;
 const result=await nl.newsletterVerifyUrl(env,'https://source.example/item#section',fetcher);assert.equal(result.verified,true);assert.equal(result.httpStatus,200);assert.equal(options[0].expirationTtl,604800);
 await nl.newsletterVerifyUrl(env,'https://source.example/item#another',fetcher);assert.equal(calls,2);
 const rejected=await nl.newsletterVerifyUrl(env,'https://source.example/private',async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/admin'}}));assert.equal(rejected.verified,false);assert.match(rejected.verificationReason,/not a public URL/);
 assert.equal(nl.newsletterPublicUrl('http://169.254.169.254/latest/meta-data'),null);assert.equal(nl.newsletterPublicUrl('file:///secret'),null);
});
test('finding periods reject undated, impossible and future dates independently of URL cache',()=>{
 assert.equal(nl.newsletterInPeriod('2026-10-21','2026-10-17','2026-10-23'),true);
 for(const date of ['', '2026-10-24','2026-10-01','2026-02-31'])assert.equal(nl.newsletterInPeriod(date,'2026-10-17','2026-10-23'),false);
});
test('contract schema keys are safe and Body compiles once in contract order with empty sections omitted',()=>{
 const contract=[{name:'Platform Title',rule:'Subject'},{name:'Preview Text',rule:'Preview'},{name:'Executive Summary',rule:'Summary'},{name:'Data & Signals',rule:'Data'},{name:'Subscriber Extra',rule:'Optional'},{name:'Body',rule:'Whole issue'}];
 const {keys,schema}=nl.newsletterSchema(contract);assert.ok(keys.every(k=>/^[a-zA-Z0-9_.-]{1,64}$/.test(k)));assert.equal(schema.required.length,6);
 const body=nl.newsletterBody(contract,{'Executive Summary':'Grounded summary.','Data & Signals':'Source: https://source.example/data','Subscriber Extra':'',Body:'Duplicate issue'});assert.ok(body.startsWith('## Executive Summary'));assert.doesNotMatch(body,/Duplicate issue|Subscriber Extra/);assert.ok(body.includes('## Data & Signals'));
});
test('digestItemsSave retains failed and out-of-period findings plus previous checks/children',async()=>{
 const store=kv(),env={TRADES:store};await store.put('digest:items:asset',JSON.stringify({checks:{keep:{premium:true}},children:{premium:[{assetId:'old'}],free:[],news:[]}}));
 const context=vm.createContext({Date,Array,String,JSON,Promise,hubCheckPeriodStart:()=> '2026-10-17',dpId:x=>x,newsletterInPeriod:nl.newsletterInPeriod,newsletterVerifyUrl:async(e,url)=>({verified:!url.includes('broken'),httpStatus:url.includes('broken')?404:200})});vm.runInContext(fn('digestItemsSave'),context);
 await context.digestItemsSave(env,'asset',[{claim:'Current',url:'https://good.example',date:new Date().toISOString().slice(0,10)},{claim:'Old',url:'https://broken.example',date:'2020-01-01'}]);
 const result=await store.get('digest:items:asset','json');assert.equal(result.items.length,2);assert.equal(result.items[1].verified,false);assert.equal(result.items[1].inPeriod,false);assert.deepEqual(result.checks,{keep:{premium:true}});assert.equal(result.children.premium[0].assetId,'old');
 result.items[0].id='stable-existing-key';result.at='2026-10-20T00:00:00Z';await store.put('digest:items:asset',JSON.stringify(result));await context.digestItemsSave(env,'asset',result.items,{preserveTimestamp:true});const rechecked=await store.get('digest:items:asset','json');assert.equal(rechecked.items[0].id,'stable-existing-key');assert.equal(rechecked.at,result.at);
});
test('thin optional sections remain omitted while subject caps and free-body word range stay advisory',()=>{
 const context=vm.createContext({Array,String});vm.runInContext(fn('validateWritingContract'),context);const contract=[{name:'Feature Analysis',rule:'Omit it when credible material is thin.'},{name:'Subscriber Extra',rule:'Omit it rather than pad.'},{name:'Body',rule:'300–500 words'}];
 assert.equal(context.validateWritingContract(contract,{'Feature Analysis':'','Subscriber Extra':'',Body:'word '.repeat(300)}).length,0);assert.match(context.validateWritingContract(contract,{Body:'word '.repeat(299)}).join(' '),/300–500 words/);
});
test('Deep/Standard/Off keep existing provider call counts and never add a ranking model pass',async()=>{
 for(const depth of ['Deep','Standard','Off']){
  const store=kv(),calls={gemini:0,pplx:0,polls:0},context=vm.createContext({Date,Math,String,Array,JSON,hubCheckPeriodStart:()=> '2026-10-17',newsletterContext:async()=>({productId:'p',recordId:'r',fields:{'Research Depth':depth}}),drStandingSources:async()=>({creators:[],associations:[]}),drGeminiStart:async()=>{calls.gemini++;return{status:'running'};},drGeminiPoll:async()=>{calls.polls++;return{status:'done'};},drPerplexity:async()=>{calls.pplx++;return{status:'done'};},newsletterUsage:async()=>{},drPublic:j=>j,DR_TTL:86400});vm.runInContext(fn('handleDigestResearch'),context);
  const env={TRADES:store,PERPLEXITY_API_KEY:'fixture'},start=await context.handleDigestResearch({action:'digestResearch',op:'start',campaignId:'c',keywords:['reader question']},env);
  await context.handleDigestResearch({action:'digestResearch',op:'perplexity',jobId:start.job.id},env);await context.handleDigestResearch({action:'digestResearch',op:'status',jobId:start.job.id},env);
  assert.deepEqual(calls,depth==='Deep'?{gemini:1,pplx:1,polls:1}:depth==='Standard'?{gemini:0,pplx:1,polls:0}:{gemini:0,pplx:0,polls:0});
 }
});
test('paid/free issue writes make one text-only model call, preserve status and log advisory violations',async()=>{
 for(const kind of ['premium','free']){
  const contract=[{name:'Platform Title',rule:'≤ 70 characters'},{name:'Preview Text',rule:'≤ 110 characters'},{name:'Executive Summary',rule:'Summary'},{name:'Feature Analysis',rule:'Omit it when the material is thin.'},{name:'Body',rule:'Whole issue'}],store=kv(),page={id:'asset',properties:{'Asset Type':{select:{name:kind==='premium'?'Newsletter Paid':'Newsletter Free'}},'Asset Status':{select:{name:'Development'}},Method:{relation:[{id:'method'}]}}};let calls=0,saved,packet;
  const context=vm.createContext({...nl,Date,JSON,Object,String,Set,governingFlow:async()=>{},writingMethodsTable:async()=>({}),newsletterMethod:()=>({name:'Digest - '+kind,contract,contractText:'operator contract',inputs:'ticked findings',rules:'Omit rather than pad'}),newsletterContext:async()=>({fields:{'Subscriber Benefit':'Know what to do','Value Proposition':'A useful decision framework',Customer:'Subscriber'}}),voiceBlock:async()=> 'Operator voice',hubAudienceBlock:async()=> 'Hub reader',ivForTitle:async()=>[{scope:'Title',status:'Finished',answers:['Grounded answer']},{scope:'Title',status:'Planning',answers:['Not finished']}],hcClaude:async(env,prompt,name,schema,max,onUsage)=>{calls++;packet=JSON.parse(prompt.split('NEWSLETTER WRITING PACKET\n')[1]);assert.equal(packet.finishedInterviews.length,1);assert.equal(packet.findings[0].verified,true);assert.ok(!prompt.includes('image_url'));onUsage({input_tokens:100,output_tokens:50});return Object.fromEntries(Object.keys(schema.properties).map((key,i)=>[key,i===0?'A'.repeat(71):i===1?'Preview':i===2?'Sourced summary.': '']));},newsletterSchema:nl.newsletterSchema,newsletterBody:nl.newsletterBody,newsletterNotion:async()=>page,ivRid:(p,k)=>p[k]?.relation?.[0]?.id||'',ivRt:text=>rt(text),kwDashId:x=>x,hubAssetId:x=>x,ivNorm:x=>String(x).toLowerCase(),writingFieldValues:p=>Object.fromEntries(Object.entries(p).map(([k,v])=>[k,(v.rich_text||[]).map(x=>x.plain_text).join('')])),saveExistingAssetWriting:async(p,properties)=>{saved=properties;Object.assign(page.properties,properties);},digestWriteBlocks:async()=>{}});vm.runInContext(fn('validateWritingContract'),context);vm.runInContext(fn('digestWriteIssue'),context);
  const result=await context.digestWriteIssue({TRADES:store},kind,[{claim:'Finding',verified:true,inPeriod:true}],'Hub',{assetId:'asset',digestId:'digest',titleId:'title',campaignId:'campaign'});
  assert.equal(calls,1);assert.equal(result.written,false);assert.match(result.violations.join(' '),/70 characters/);assert.equal(page.properties['Asset Status'].select.name,'Development');assert.ok(!saved['Asset Status']);assert.match(saved.Body.rich_text[0].plain_text,/Executive Summary/);assert.equal((await store.get('writeasset:log','json'))[0].written,false);
 }
});
test('only the newsletter setting record belonging to the product can be edited',async()=>{
 let patches=0;const productId='a'.repeat(32),recordId='b'.repeat(32),page={parent:{database_id:'db'},properties:{Product:{relation:[{id:productId}]},'Subscriber Benefit':{rich_text:rt('Current')}}};
 const context=vm.createContext({...nl,JSON,hubAssetId:x=>String(x||'').replaceAll('-',''),PRODUCT_RESEARCH_DB:'db',newsletterContext:async()=>({productId,recordId,record:page}),ivRt:rt,kwDashId:x=>x,writingFieldValues:p=>Object.fromEntries(Object.entries(p).map(([k,v])=>[k,(v.rich_text||[]).map(x=>x.plain_text).join('')])),newsletterNotion:async(e,path,options)=>{if(options?.method==='PATCH'){patches++;Object.assign(page.properties,JSON.parse(options.body).properties);}return page;}});vm.runInContext(fn('newsletterSaveSetting'),context);
 await assert.rejects(context.newsletterSaveSetting({}, {campaignId:'c',productId,recordId:'wrong',field:'Subscriber Benefit',value:'New'}),/does not belong/);assert.equal(patches,0);
 await context.newsletterSaveSetting({}, {campaignId:'c',productId,recordId,field:'Subscriber Benefit',value:'New'});assert.equal(patches,1);
});
test('newsletter modal stays inside the existing router and adds no subscriber API calls',()=>{
 const html=fs.readFileSync('microsites/care-gap-v2/index.html','utf8');assert.match(html,/pubNewsletterPanel/);assert.match(html,/saveNewsletterSettings/);assert.match(html,/Preview email/);assert.match(html,/sandbox=""/);assert.match(html,/Mechanical source URL reachability/);assert.match(html,/pubNewsletterUsage/);assert.match(source,/preview:.*|Preview Text/);assert.doesNotMatch(source,/newsletterSubscriberCount|hub:aclist:.*contactsCount/);
});
test('the existing Perplexity synthesis remains one call and receives benefit/value/focus/customer',async()=>{
 let calls=0,logged;const fields={'Subscriber Benefit':'Spot the decision','Value Proposition':'A decision checklist','Research Focus':'Regulatory changes',Customer:'Operators'};
 const context=vm.createContext({...nl,JSON,Date,Array,String,hubCheckPeriodStart:()=> '2026-10-17',spendCheck:async()=>null,pplxCost:()=>({cost:0}),spendAdd:async()=>{},drJson:JSON.parse,drAllText:()=>[],newsletterUsage:async(e,j,p,r)=>{logged={phase:p,usage:r.usage};},fetch:async(url,options)=>{calls++;const input=JSON.parse(options.body).input;for(const value of Object.values(fields))assert.ok(input.includes(value));return new Response(JSON.stringify({output_text:JSON.stringify({digest:'Grounded digest',sources:[]}),usage:{input_tokens:80,output_tokens:60}}),{status:200});}});vm.runInContext(fn('adPerplexityDigest'),context);
 await context.adPerplexityDigest({PERPLEXITY_API_KEY:'fixture'},{id:'run',campaignId:'cid',newsletter:{fields},notes:'Operator notes'},['Main offering']);assert.equal(calls,1);assert.equal(logged.phase,'perplexityDigest');assert.equal(logged.usage.input_tokens,80);
});
test('provider usage counts calls rather than Gemini polls and keeps twenty runs',async()=>{
 const store=kv(),context=vm.createContext({Date,JSON,hubAssetId:x=>x});vm.runInContext(fn('newsletterUsage'),context);const env={TRADES:store},job={id:'run',campaignId:'cid',newsletter:{fields:{'Research Depth':'Deep'}}};
 await context.newsletterUsage(env,job,'gemini',{status:'running',usage:null});await context.newsletterUsage(env,job,'gemini',{status:'done',usage:{total_tokens:123}},false);
 const run=(await store.get('digest:usage:cid','json'))[0];assert.equal(run.providers.gemini.calls,1);assert.equal(run.providers.gemini.usage.total_tokens,123);assert.equal(run.providers.gemini.usageHistory.length,1);
 for(let i=0;i<25;i++)await context.newsletterUsage(env,{...job,id:'run'+i},'research',{status:'skipped'},false);assert.equal((await store.get('digest:usage:cid','json')).length,20);
});
test('seeding calls once, fills empties only, and preserves a concurrent manual edit',async()=>{
 const store=kv(),values={'Subscriber Benefit':'Operator benefit','Value Proposition':'','Research Focus':'','Research Depth':'Deep',Customer:'Subscriber',Benefits:'Useful weekly decisions',Transformation:'Better choices'};let calls=0;
 const record=()=>({properties:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{rich_text:rt(v)}]))});
 const context=vm.createContext({...nl,JSON,Date,Object,String,NEWSLETTER_FIELDS:nl.NEWSLETTER_FIELDS,HUB_SITES:[{campaignId:'cid',slug:'home-services',name:'Home Services'}],newsletterContext:async()=>({campaignId:'cid',productId:'product',recordId:'research',fields:{...values},record:record()}),writingFieldValues:p=>Object.fromEntries(Object.entries(p).map(([k,v])=>[k,v.rich_text.map(x=>x.plain_text).join('')])),newsletterSaveSetting:async(e,b)=>{values[b.field]=b.value;},newsletterNotion:async()=>record(),newsletterHdr:()=>({}),hubSitesMerge:async()=>{},notionQuery:async()=>[],RESEARCH_DB:'research',kwDashId:x=>x,hubAssetId:x=>x,hubMainList:async()=>[],findBestProductResearchRecord:async()=>null,hcClaude:async(e,prompt,name,schema,max,onUsage)=>{calls++;assert.match(prompt,/NOT home maintenance/);values['Research Focus']='Operator edited focus during generation';onUsage({input_tokens:50});return Object.fromEntries(Object.keys(schema.properties).map(k=>[k,'Grounded draft']));}});vm.runInContext(fn('newsletterSeed'),context);
 await context.newsletterSeed({TRADES:store},'cid');await context.newsletterSeed({TRADES:store},'cid');assert.equal(calls,1);assert.equal(values['Subscriber Benefit'],'Operator benefit');assert.equal(values['Research Focus'],'Operator edited focus during generation');assert.equal(values['Value Proposition'],'Grounded draft');
});
test('email preview uses the same Markdown shape as send, including sections and usable tables',()=>{
 const context=vm.createContext({String});vm.runInContext(fn('mdToEmailHtml'),context);const html=context.mdToEmailHtml('## Executive Summary\n\n**Decision**\n\n| Action | Why |\n| --- | --- |\n| Check | Source |\n\n1. First\n2. Second\n\n<script>alert(1)</script>');assert.match(html,/<h2>Executive Summary<\/h2>/);assert.match(html,/<table/);assert.match(html,/<ol>/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});
test('free send uses saved subject/preview/body, stays once per asset, schedules fifteen minutes out; paid never sends',async()=>{
 const store=kv(),calls=[],cid='a'.repeat(32),fixed=Date.parse('2026-10-23T15:00:00Z');class Clock extends Date{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}}
 let type='Newsletter Free';const page=()=>({properties:{'Asset Type':{select:{name:type}},Campaign:{relation:[{id:cid}]},'Platform Title':{rich_text:rt('Saved subject')},'Preview Text':{rich_text:rt('Saved preview')},Body:{rich_text:rt('## Executive Summary\n\n'+('Grounded body. '.repeat(25)))}}});await store.put('hub:aclist:hub','list');
 const context=vm.createContext({Date:Clock,Intl,JSON,String,Object,NOTION_VERSION:'2022-06-28',HUB_SITES:[{campaignId:cid,slug:'hub',name:'Hub'}],AC_HUB_SENDERS:{},AC_DEFAULT_SENDER:'sender@example.com',kwDashId:x=>x,hubSitesMerge:async()=>{},acCreds:()=>({url:'https://example.api-us1.com',key:'fixture'}),fetch:async()=>new Response(JSON.stringify(page())),acV1:async(e,action,body)=>{calls.push({action,body});return{id:action==='message_add'?'message':'campaign'};},extractBlocksTextRecursive:async()=>''});vm.runInContext(fn('mdToEmailHtml'),context);vm.runInContext(fn('nlSendOnPublish'),context);
 const env={TRADES:store,NOTION_TOKEN:'fixture'},aid='b'.repeat(32);await context.nlSendOnPublish(env,aid);assert.equal(calls.length,2);assert.equal(calls[0].body.subject,'Saved subject');assert.match(calls[0].body.html,/Saved preview/);assert.match(calls[0].body.html,/<h2>/);assert.equal(Date.parse(calls[1].body.sdate.replace(' ','T')+'-07:00')-fixed,15*60000);
 assert.equal((await context.nlSendOnPublish(env,aid)).already,true);assert.equal(calls.length,2);type='Newsletter Paid';assert.equal(await context.nlSendOnPublish(env,'c'.repeat(32)),null);assert.equal(calls.length,2);
});
