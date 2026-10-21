const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('worker/worker.js','utf8'),dash=fs.readFileSync('index.html','utf8');
const rt=t=>[{text:{content:t}}],rel=id=>({relation:[{id}]}),cid='c'.repeat(32),tid='t'.repeat(32),pid='p'.repeat(32);
function setup(){
 const calls=[],page={id:'a'.repeat(32),parent:{database_id:'assets'},properties:{Campaign:rel(cid),'Content Strategy':rel(tid),Body:{rich_text:rt('Keep this content')}}};
 let placed=false;
 const ctx=vm.createContext({console,Set,Map,JSON,ASSETS_DB:'assets',CONTENT_STRATEGY_DB:'titles',HUB_SITES:[{slug:'fixture',campaignId:cid}],
   fetch:async(url,opts={})=>{calls.push({url,opts});return {ok:true,status:200,json:async()=>structuredClone(page)};}});
 vm.runInContext(source.slice(source.indexOf('let hierarchyEnv;'),source.indexOf('// Product → every linked title')),ctx);
 ctx.hierarchyForHub=async()=>({asset:()=>placed,title:()=>placed});ctx.ivPage=async()=>({properties:{Campaign:rel(cid)}});
 vm.runInContext('hierarchyEnv={};',ctx);
 return {ctx,calls,page,setPlaced:v=>placed=v};
}
test('membership matches committed/staged topics, valid clusters, main products, and OR fallbacks',()=>{
 const x=setup(),m=x.ctx.hierarchyModel({topics:[{id:'committed'},{id:'staged'},{id:'unassigned'}],tc:{clusters:['Valid'],assign:{committed:'Valid',staged:'Valid',unassigned:'Missing'}},products:[{id:pid,topicId:'staged'},{id:'other',topicId:'unassigned'}],mainIds:['main'],titles:[{id:tid,properties:{'Topic ID':{rich_text:rt('unassigned')},product:rel(pid)}}]});
 assert.equal(m.topic('committed'),true);assert.equal(m.topic('staged'),true);assert.equal(m.topic('unassigned'),false);assert.equal(m.topic('__main'),true);
 assert.equal(m.productIds.has('main'),true);assert.equal(m.titleIds.has(tid),true,'placed product remains sufficient despite an unplaced own topic');
 assert.equal(m.asset({'Content Strategy':rel(tid)}),true);assert.equal(m.asset({'Content Strategy':rel('outside'),Product:rel(pid)}),true);assert.equal(m.asset({'Content Strategy':rel('outside')}),false);
 const ui=vm.createContext({_hubKw:{fixture:{tc:{clusters:['Valid'],assign:{staged:'Valid'}},staged:[{id:'staged'}],products:[{id:pid,topicId:'staged'}],mainIds:[]}},HUB_SITES:[{slug:'fixture',campaignId:cid}],DEV2_ROWS:[{campId:cid,titleId:tid,titleTopicId:'unassigned',productId:pid}]});
 vm.runInContext(dash.match(/function hub2Hierarchy\([^]*?\n}/)[0],ui);
 assert.equal(ui.hub2Hierarchy('fixture').has({type:'Title',id:tid}),true);
 assert.equal(ui.hub2Hierarchy('fixture').has({type:'Asset',titleId:'outside',productId:pid}),true);
});
test('write boundary refuses every gated status before mutation; Review remains allowed; placement unlocks',async()=>{
 for(const status of ['Development','Publish','Published']) {
   const x=setup(),opts={method:'PATCH',body:JSON.stringify({properties:{'Asset Status':{select:{name:status}},Body:{rich_text:rt('Must not change')}}})};
   await assert.rejects(x.ctx.hierarchyFetch('https://api.notion.com/v1/pages/'+x.page.id,opts),/not in the hub's Keywords hierarchy/);
   assert.equal(x.calls.filter(c=>c.opts.method==='PATCH').length,0);
   x.setPlaced(true);await x.ctx.hierarchyFetch('https://api.notion.com/v1/pages/'+x.page.id,opts);assert.equal(x.calls.filter(c=>c.opts.method==='PATCH').length,1);
 }
 const x=setup();await x.ctx.hierarchyFetch('https://api.notion.com/v1/pages/'+x.page.id,{method:'PATCH',body:JSON.stringify({properties:{'Asset Status':{select:{name:'Review'}}}})});assert.equal(x.calls.length,1);
});
test('new Development title/asset and prospective relation changes use the same boundary',async()=>{
 const x=setup();
 for(const [db,key] of [['titles','Status'],['assets','Asset Status']]) {
  await assert.rejects(x.ctx.hierarchyFetch('https://api.notion.com/v1/pages',{method:'POST',body:JSON.stringify({parent:{database_id:db},properties:{Campaign:rel(cid),[key]:{select:{name:'Development'}}}})}),/Keywords hierarchy/);
 }
 assert.equal(x.calls.length,0);
});
test('feed and Hub View exclude forced-Published nonmembers even with valid live manifest entries',async()=>{
 const x=setup();x.ctx.hierarchyForHub=async()=>({asset:p=>p.placed===true});
 x.ctx.hubSectionOf=()=> 'offers';x.ctx.offerBlogPath=()=>'';x.ctx.IV_TIER_LABEL={none:'None'};x.ctx.TOPICAL_REWRITE_PROP='Written Without Interview';
 vm.runInContext(source.slice(source.indexOf('const HUB_FEED_SECTIONS ='),source.indexOf('async function syncOfferAssetBlog')),x.ctx);
 const p={id:x.page.id,properties:{Campaign:rel(cid),'Asset Status':{select:{name:'Published'}},'Asset Type':{select:{name:'Offer - Content Hub'}}}},hub={slug:'fixture',campaignId:cid},manifest=[{assetId:p.id,slug:'offer'}];
 assert.equal((await x.ctx.hubFeedEntries([p],manifest,hub,{})).length,0);
 assert.equal((await x.ctx.hubSectionAssetRows([p],manifest,hub,{},()=> 'none',[],{})).length,0);
 p.properties.placed=true;assert.equal((await x.ctx.hubFeedEntries([p],manifest,hub,{})).length,1);
});
test('compound operations preflight before writes and bulk/hub surfaces name hierarchy skips',()=>{
 assert.ok(source.indexOf('const wantsStatus=HIERARCHY_STATUSES')<source.indexOf('try { watchCandidateAction'));
 for(const fn of ['publishTopicalAsset','publishOfferAssetBlog','publishHubAssetToLiveSite','publishSeoPostToLiveSite'])assert.match(source.match(new RegExp('async function '+fn+'\\([^]*?\\n}'))[0],/requireHierarchyPlacement/);
 assert.match(source,/const eligible=rows.filter\(r=>hierarchy.asset/);
 assert.match(dash,/hub2Outside-\$\{slug\}/);assert.match(dash,/skipped:fails/);assert.match(dash,/it.batch.skipped=/);
});
test('legacy assets inherit hub membership and reconciliation demotes only status, keeping content intact',async()=>{
 const x=setup(),title={id:tid,properties:{Campaign:rel(cid),Status:{select:{name:'Idea'}}}},asset={...x.page,properties:{'Content Strategy':rel(tid),'Asset Status':{select:{name:'Published'}},'Asset Title':{title:rt('Legacy offer')},Body:{rich_text:rt('Keep this content')}}};
 x.ctx.ivPage=async id=>structuredClone(id===tid?title:asset);x.ctx.kwDashId=id=>id;x.ctx.ivHdr=()=>({});
 x.ctx.notionQuery=async(db,q)=>db==='titles'?[title]:q.filter.and?[asset]:[];
 x.ctx.hubNotionFetch=async(url,opts)=>{Object.assign(asset.properties,JSON.parse(opts.body).properties);return {ok:true};};
 let removed=false;x.ctx.removeHubAssetListings=async(env,hdr,page)=>{assert.equal(page.properties.Campaign.relation[0].id,cid);removed=true;return {removed:1};};
 await assert.rejects(x.ctx.requireHierarchyPlacement({},asset),/Keywords hierarchy/);
 const report=await x.ctx.reconcileHierarchy({},cid,true);
 assert.equal(report.records.length,1);assert.equal(report.records[0].oldStatus,'Published');assert.equal(report.records[0].demoted,true);
 assert.equal(asset.properties['Asset Status'].select.name,'Idea');assert.equal(asset.properties.Body.rich_text[0].text.content,'Keep this content');assert.equal(removed,true);
});
