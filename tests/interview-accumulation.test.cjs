const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('worker/worker.js','utf8');
const fn=name=>{const start=source.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);const line=source.slice(start,source.indexOf('\n',start));return line.endsWith(' }')?line:source.slice(start,source.indexOf('\n}',start)+2);};
const kv=()=>{const data=new Map();let writes=0;return {data,get:async(k,type)=>data.has(k)?type==='json'?JSON.parse(data.get(k)):data.get(k):null,put:async(k,v)=>{writes++;data.set(k,v);},delete:async k=>{writes++;data.delete(k);},get writes(){return writes;}};};
const rt=v=>[{plain_text:v,text:{content:v}}],rid=(p,k)=>p?.[k]?.relation?.[0]?.id||'';
function context(extra={}){const c=vm.createContext({Date,JSON,Math,Object,String,Array,Set,Map,INTERVIEWS_DB:'interviews',hubAssetId:x=>String(x||'').replace(/-/g,''),ivDash:x=>x,ivRid:rid,ivRt:rt,hubRichText:a=>(a||[]).map(t=>t.plain_text||t.text?.content||'').join(''),...extra});vm.runInContext(source.slice(source.indexOf('// ACCUMULATIVE INTERVIEWS —'),source.indexOf('// END ACCUMULATIVE INTERVIEWS')),c);for(const name of ['ivParse','ivFormatAnswers','ivSavePages'])vm.runInContext(fn(name),c);return c;}
const pair=(i,extra={})=>({q:'Natural planted aquarium insight '+i,a:'Healthy roots absorb nutrients and support natural planted aquarium stability.',ivId:'source'+i,scope:'Product',titleId:'title',productId:'product',cid:'hub',finishedAt:new Date().toISOString(),...extra});
test('free scoring requires relevant terms, boosts title above product, excludes old/time-sensitive answers and obeys direction',()=>{
 const c=context(),bank=[pair(1,{titleId:'other',productId:'other'}),pair(2,{titleId:'other'}),pair(3),pair(4,{finishedAt:new Date(Date.now()-181*864e5).toISOString()}),pair(5,{a:'Natural planted aquariums cost $20 this year.'}),pair(6,{a:'I schedule aquarium visits for next week.'}),pair(7,{cid:'another-hub'})];
 const r=c.ivReuse(bank,{text:'Natural planted aquarium',titleId:'title',productId:'product',cid:'hub'});assert.deepEqual(Array.from(r,x=>x.ivId),['source3','source2','source1']);assert.equal(c.ivReuse(bank,{text:'Natural planted aquarium',direction:'guitar harmony',cid:'hub'}).length,0);
});
test('edited answers win over older copies and source dates cannot be laundered by a new interview',()=>{
 const c=context(),old=pair(1,{q:'Natural planted aquarium?',a:'Older natural aquarium answer.',finishedAt:new Date(Date.now()-864e5).toISOString()}),fresh={...old,a:'Fresh natural aquarium answer.',finishedAt:new Date().toISOString(),titleId:'other'};
 assert.equal(c.ivReuse([old,fresh],{text:'Natural planted aquarium',titleId:'title',cid:'hub'})[0].a,fresh.a);
 const meta={index:0,ivId:'old-source',finishedAt:old.finishedAt,answerHash:c.ivAnswerHash(old.a)};assert.equal(c.ivActiveReuse([meta],[old.a]).length,1);assert.equal(c.ivActiveReuse([meta],['Fresh replacement']).length,0);
});
test('hub answer bank accepts only finished answers, caches ten minutes, and never mixes client/operator banks',async()=>{
 const store=kv();let reads=0;const rows=[{id:'iv',cid:'hub',status:'Finished',qs:['Natural aquarium?'],answers:['A natural aquarium answer.'],scope:'Title',titleId:'t',finishedAt:new Date().toISOString()},{id:'pending',cid:'hub',status:'Flagged',qs:['Pending?'],answers:['Not finished']},{id:'other',cid:'other',status:'Finished',qs:['Other?'],answers:['Other answer']}];
 const c=context({ivList:async()=>{reads++;return rows;}}),env={TRADES:store};await store.put('client:link:client-a',JSON.stringify({campaignId:'hub',titleId:'t',productId:'p'}));await store.put('client:items:client-a',JSON.stringify([{d:'own',status:'Finished',qs:['Own client question?'],answers:['Only this client answer.'],at:Date.now()}]));await store.put('client:items:client-b',JSON.stringify([{d:'private',assetId:'asset',qs:['Secret?'],answers:['OTHER CLIENT SENTINEL'],at:Date.now()}]));
 const operator=await c.ivAnswerBank(env,'hub');assert.equal(operator.length,1);assert.equal((await c.ivAnswerBank(env,'hub'))[0].a,operator[0].a);assert.equal(reads,1);
 const client=await c.ivAnswerBank(env,'hub',{clientLinkId:'client-a'});assert.equal(client.length,1);assert.equal(client[0].a,'Only this client answer.');assert.ok(!JSON.stringify(client).includes('OTHER CLIENT'));assert.ok(!JSON.stringify(operator).includes('client answer'));
 await c.ivInvalidateBank(env,'hub');await c.ivAnswerBank(env,'hub');assert.equal(reads,2);assert.ok(store.data.has('ivbank:hub:client:client-a'));
 await assert.rejects(c.ivAnswerBank(env,'another-hub',{clientLinkId:'client-a'}),/campaign mismatch/);
});
function saveFixture(bank){const store=kv(),pages=new Map();let models=0,prompt='',range;
 const c=context({ivList:async()=>[],ivHdr:()=>({})});c.ivAnswerBank=async()=>bank;c.ivReuseSchema=async()=>{};
 c.ivClaudeInterviews=async(e,p,max,min,maxq)=>{models++;prompt=p;range={min,max:maxq};return[{angle:'Gap',questions:Array.from({length:min},(_,i)=>'New gap '+i+'?')}];};
 c.ivReuseNotion=async(e,path,options)=>{if(options?.method==='POST'){const props=JSON.parse(options.body).properties,page={id:'new-interview',properties:props};pages.set('new-interview',page);return page;}return pages.get(path.slice(6));};
 return {c,store,pages,get models(){return models;},get prompt(){return prompt;},get range(){return range;}};
}
test('fully covered short interview skips the model, creates a Finished scoped record and reads back verbatim answers/provenance',async()=>{
 const f=saveFixture([pair(1),pair(2),pair(3)]);
 const r=await f.c.ivAccumulate({TRADES:f.store},{cid:'hub',subject:{text:'Natural planted aquarium',titleId:'title'},prompt:'base',qmin:3,qmax:5,
   base:{Name:{title:rt('Asset')},Campaign:{relation:[{id:'hub'}]},Scope:{select:{name:'Asset'}},Asset:{relation:[{id:'asset'}]}}});
 assert.equal(f.models,0);assert.equal(r.modelCalls,0);assert.equal(r.interviews[0].status,'Finished');assert.equal(r.interviews[0].reused.length,3);assert.equal(r.interviews[0].answers[0],pair(1).a);assert.match(f.pages.get('new-interview').properties.Answers.rich_text[0].plain_text,/♻ /);assert.deepEqual(JSON.parse(JSON.stringify(r.questionsNow)),{min:0,max:0});
});
test('partial coverage subtracts reused pairs from both question bounds and creates only the gaps',async()=>{
 const f=saveFixture([pair(1)]),r=await f.c.ivAccumulate({TRADES:f.store},{cid:'hub',subject:{text:'Natural planted aquarium'},prompt:'base',qmin:3,qmax:5,base:{Campaign:{relation:[{id:'hub'}]},Scope:{select:{name:'Asset'}}}});
 assert.equal(f.models,1);assert.deepEqual(JSON.parse(JSON.stringify(f.range)),{min:2,max:4});assert.match(f.prompt,/ALREADY ANSWERED/);assert.equal(r.interviews[0].qs.length,3);assert.equal(r.interviews[0].answers[0],pair(1).a);assert.equal(r.interviews[0].status,'Flagged');
});
test('a model may return zero questions when actual reused answers cover the piece; empty unsupported answers never become Finished',async()=>{
 const f=saveFixture([pair(1)]);f.c.ivClaudeInterviews=async()=>[{angle:'Covered',questions:[]}];const r=await f.c.ivAccumulate({TRADES:f.store},{cid:'hub',subject:{text:'Natural planted aquarium'},prompt:'base',qmin:3,qmax:5,base:{}});assert.equal(r.interviews[0].status,'Finished');
 const empty=saveFixture([]);empty.c.ivClaudeInterviews=async()=>[];await assert.rejects(empty.c.ivAccumulate({TRADES:empty.store},{cid:'hub',subject:'new',prompt:'base',qmin:3,qmax:5,base:{}}),/No questions or relevant/);
});
test('Studio full coverage makes no question/working-title calls and draws only from its own client bank',async()=>{
 let calls=0,bankClient;const c=context({studioInner:async()=>{calls++;throw Error('must skip');},studioWorkingTitle:async()=>{calls++;throw Error('must skip');}});c.ivAnswerBank=async(e,cid,options)=>{bankClient=options.clientLinkId;return[pair(1),pair(2),pair(3)];};
 const it=await c.ivStudioAccumulate({},{id:'own-client',campaignId:'hub',titleId:'title',productId:'product',productName:'Natural planted aquarium'},'Natural planted aquarium','');assert.equal(calls,0);assert.equal(bankClient,'own-client');assert.equal(it.status,'Finished');assert.equal(it.reused.length,3);assert.equal(it.answers[0],pair(1).a);
});
test('diagnostics use real existing unanswered questions, do not invent future wording, and make no writes or model calls',async()=>{
 const store=kv(),asset={properties:{'Asset Type':{select:{name:'Topical Post'}},'Asset Title':{title:rt('Natural planted aquarium')},'Content Strategy':{relation:[{id:'title'}]}}},title={properties:{Title:{title:rt('Natural planted aquarium')},Campaign:{relation:[{id:'hub'}]}}};let cacheOption;
 const c=context({ivPage:async id=>id==='asset'?asset:title,ivTierFn:async()=>()=> 'short',ivForTitle:async()=>[]});c.ivAnswerBank=async(e,cid,options)=>{cacheOption=options.cache;return[pair(1),pair(2),pair(3)];};
 const r=await c.ivReuseDiagnostic({TRADES:store},{assetId:'asset'});assert.equal(cacheOption,false);assert.equal(r.writes,0);assert.equal(r.modelCalls,0);assert.equal(store.writes,0);assert.equal(r.questionsNow.max,0);assert.equal(r.questions.length,0);
});
test('worker save paths invalidate both answer bank types and label reused answers for writers and UI',()=>{
 assert.match(source,/await ivInvalidateBank\(env,iv.cid\)/);assert.match(source,/await ivInvalidateBank\(env,link.campaignId,link.id\)/);assert.match(source,/reused from an earlier interview/);assert.match(source,/r.interviewReuseSources/);assert.match(source,/wasFinished&&changedAnswers/);assert.match(fs.readFileSync('shared/interview-panel.js','utf8'),/reuseBadge\(iv,i\)/);assert.match(fs.readFileSync('web/studio/index.html','utf8'),/your earlier interview/);
});
test('None-tier assets skip question generation and never create an empty Finished interview',async()=>{
 let models=0;const title={properties:{Title:{title:rt('Title')},Campaign:{relation:[{id:'hub'}]}}},asset={properties:{'Asset Type':{select:{name:'Listing'}},'Content Strategy':{relation:[{id:'title'}]}}};
 const c=context({ivPage:async id=>id==='asset'?asset:title,ivTierFn:async()=>()=> 'none',hubAudienceBlock:async()=>'',ivProdResearch:async()=>'',ivHdr:()=>({}),extractPillarContent:async()=>'',ivClaudeInterviews:async()=>{models++;},ivImportance:()=> 'none'});vm.runInContext(fn('ivCreateForAsset'),c);
 const result=await c.ivCreateForAsset({},{assetId:'asset'});assert.equal(result.skipped,true);assert.equal(result.interviews.length,0);assert.equal(models,0);
});
test('failed answer saves retain the exact payload and reason',async()=>{
 const store=kv(),c=context();c.ivReuseNotion=async()=>{throw Error('Notion refused this update');};const properties={Answers:{rich_text:rt('Q: Question?\nA: Actual answer.')}};
 await assert.rejects(c.ivSaveAnswerPatch({TRADES:store},'iv',properties,['Actual answer.']),/refused/);const held=JSON.parse([...store.data.values()][0]);assert.deepEqual(held.payload,properties);assert.match(held.reason,/refused/);
});
