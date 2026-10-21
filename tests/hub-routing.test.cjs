const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('worker/worker.js','utf8'),hub={slug:'fixture',campaignId:'c'.repeat(32)};
const rt=s=>[{plain_text:s,text:{content:s}}],id='a'.repeat(32);
const page=(aid=id,type='Offer - Content Hub',status='Published',section='Offers')=>({id:aid,created_time:'2026-10-21',properties:{Campaign:{relation:[{id:hub.campaignId}]},'Asset Type':{select:{name:type}},'Asset Status':{select:{name:status}},'Hub Section':{select:{name:section}},'Platform Title':{rich_text:rt(aid)},Body:{rich_text:rt('Written content')},'Deployment Status':{select:{name:'Deployed'}}}});
function setup(rows=[]){
 const files=new Map(),deleted=[],writes=[],pages=new Map(rows.map(p=>[p.id,p]));let fail=false;
 const ctx=vm.createContext({console,URL,Date,Set,Map,JSON,setTimeout:fn=>fn(),HUB_SITES:[hub],ASSETS_DB:'assets',NOTION_TOKEN:'fixture',NOTION_VERSION:'version',ivDash:x=>x,governingFlow:async()=>({}),stampPublishingDate:async()=>{},ensureAssetsDbProperties:async()=>{},
 notionQuery:async(db,q)=>{assert.equal(q.filter.and[1].select.equals,'Published');return rows.filter(p=>!p.archived&&p.properties['Asset Status'].select.name==='Published');},
 hubSiteTarget:async({sub})=>({basePath:'web/hub/fixture/'+sub,campName:'Fixture',s:{},hub,getFile:async path=>({text:files.get(path)||null}),putFile:async(path,text)=>{files.set(path,text);writes.push(path);},deleteFile:async path=>{files.delete(path);deleted.push(path);}}),
 fetch:async(url,opts={})=>{
  if(url.includes('github.io')){assert.ok(!('cache' in opts),'Cloudflare fetch does not support RequestInit.cache');return {ok:true,status:files.has('web/hub/fixture/blog/posts.json')?200:404,json:async()=>JSON.parse(files.get('web/hub/fixture/blog/posts.json')||'[]')};}
  if(url.includes('/children'))return {ok:true,json:async()=>({results:[{type:'paragraph',paragraph:{rich_text:rt('Full written asset')}}]})};
  const aid=url.split('/').at(-1).replaceAll('-',''),p=pages.get(aid);assert.ok(p,'Known Notion page '+aid);
  if(opts.method==='PATCH'){const b=JSON.parse(opts.body);Object.assign(p.properties,b.properties||{});if(b.archived)p.archived=true;}
  return {ok:true,json:async()=>structuredClone(p)};
 }});
 for(const name of ['hubSectionOf','offerBlogPath','offerBlogAsset','offerBlogBlocks','offerBlogParts','reconcileHubDir','publishOfferAssetBlog'])vm.runInContext(source.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))[0],ctx);
 vm.runInContext(source.slice(source.indexOf('// One listing membership'),source.indexOf('async function syncOfferAssetBlog')),ctx);
 ctx.publishSeoPostToLiveSite=async({assetId,intro})=>{if(fail)throw Error('Publish unavailable');const key='web/hub/fixture/blog/posts.json',m=JSON.parse(files.get(key)||'[]'),slug=m.find(e=>e.assetId===assetId)?.slug||assetId;files.set(key,JSON.stringify([...m.filter(e=>e.assetId!==assetId),{assetId,slug,intro}]));files.set('web/hub/fixture/blog/'+slug+'/index.html',intro);return {published:true,liveUrl:'https://cabuzzard.github.io/dash/web/hub/fixture/blog/'+slug+'/'};};
 const action=(name,end)=>{const start=source.indexOf('      if (body.action === "'+name+'") {');vm.runInContext('async function '+name+'(body,env={},ctx={waitUntil(){}}){const json=x=>x;'+source.slice(start,source.indexOf(end,start))+'}',ctx);};
 action('backfillHubBlog','      // \u2500\u2500 backfillHubProductChain');action('updatePublishFields','      // \u2500\u2500 uploadAssetThumbnail');
 for(const name of ['assetWritingContent','assetWritingState','requireAssetWriting'])vm.runInContext(source.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))[0],ctx);
 ctx.ivHdr=()=>({});ctx.ivPage=async id=>structuredClone(pages.get(id.replaceAll('-','')));
 return {ctx,files,deleted,writes,pages,setFail:v=>fail=v,manifest:()=>JSON.parse(files.get('web/hub/fixture/blog/posts.json')||'[]')};
}
test('listing membership, not Deployed or URL, governs every feed and routed label',()=>{
 const p=page(),x=setup([p]);const state={status:'Published',hubSectionKey:'offers',hubSection:'Offers',deploymentStatus:'Deployed'};
 assert.equal(x.ctx.hubFeedEntries([p],[],hub).length,0);assert.equal(x.ctx.hubRoutedState(state,'fixture').hubSectionDisplay,'Offers \u00b7 not on hub');
 const entry=x.ctx.hubFeedEntries([p],[{assetId:id,slug:'offer'}],hub)[0];assert.equal(entry.url,'./blog/offer/');assert.equal(x.ctx.hubRoutedState(state,'fixture',entry).hubSectionDisplay,'Offers');
 assert.equal(x.ctx.hubRoutedState({...state,status:'Idea'},'fixture',entry).hubLive,false);
 assert.equal(x.ctx.hubRoutedState({...state,contentHub:'different'},'fixture',entry).hubLive,false);
 assert.equal(x.ctx.hubRoutedState({...state,hubSectionKey:'',hubSection:'Unlisted'},'fixture').hubSectionDisplay,'');
});
test('same save switches offers, news and QA off/on, removes manifests and pages, and returns honest state',async()=>{
 for(const [type,section]of [['Offer - Content Hub','offers'],['Blog - SEO - News','news'],['QA - Story','articles'],['QA - Sales','offers']]){
  const p=page(id,type,'Development',section),x=setup([p]);
  let r=await x.ctx.updatePublishFields({action:'updatePublishFields',assetId:id,status:'Review',publishToHub:true});assert.equal(r.hubLive,true);assert.equal(p.properties['Asset Status'].select.name,'Published');assert.equal(x.manifest().length,1);
  r=await x.ctx.updatePublishFields({action:'updatePublishFields',assetId:id,status:'Published',publishToHub:false});assert.equal(r.hubLive,false);assert.equal(p.properties['Asset Status'].select.name,'Development');assert.equal(x.manifest().length,0);assert.ok(x.deleted.some(k=>k.includes('/blog/')));
  r=await x.ctx.updatePublishFields({action:'updatePublishFields',assetId:id,status:'Review',publishToHub:true});assert.equal(r.hubLive,true);assert.equal(x.manifest().length,1);
 }
});
test('bulk rebuild uses only Published records, repairs missing pages and reports deleted/stale listings',async()=>{
 const a=page(),b=page('b'.repeat(32),'SEO Post','Development','Articles'),deleted=page('d'.repeat(32));deleted.archived=true;const x=setup([a,b,deleted]);
 x.files.set('web/hub/fixture/blog/posts.json',JSON.stringify([{assetId:b.id,slug:'unpublished'},{assetId:deleted.id,slug:'deleted'}]));
 x.files.set('web/hub/fixture/offers/offers.json',JSON.stringify([{assetId:deleted.id,slug:'deleted'}]));
 const r=await x.ctx.backfillHubBlog({action:'backfillHubBlog',campaignId:hub.campaignId,force:true});assert.equal(r.success,true);assert.deepEqual(x.manifest().map(e=>e.assetId),[id]);
 assert.equal(r.results.find(e=>e.kind==='blog-index').removed,2);assert.equal(r.results.find(e=>e.kind==='offers-index').removedEntries[0].assetId,deleted.id);
 const offers=JSON.parse(x.files.get('web/hub/fixture/offers/offers.json'));assert.equal(offers[0].assetId,id);assert.match(x.files.get('web/hub/fixture/offers/index.html'),/href="\.\.\/blog\//);
});
test('failed source read never prunes; failed explicit publish does not leave Published silently',async()=>{
 const p=page(),x=setup([p]);x.ctx.notionQuery=async()=>{throw Error('Notion down')};await assert.rejects(x.ctx.backfillHubBlog({action:'backfillHubBlog'}),/Notion down/);assert.equal(x.writes.length,0);
 x.setFail(true);const r=await x.ctx.updatePublishFields({action:'updatePublishFields',assetId:id,status:'Review',publishToHub:true});assert.match(r.error,/Publish unavailable/);assert.equal(p.properties['Asset Status'].select.name,'Development');
});
test('checkbox is below section, shares save, and no preview observer is introduced',()=>{
 const html=fs.readFileSync('microsites/care-gap-v2/index.html','utf8');assert.equal((html.match(/id="pubPublishToHub"/g)||[]).length,1);assert.ok(html.indexOf('id="pubHubSection"')<html.indexOf('id="pubPublishToHub"'));assert.match(html,/fields.publishToHub=toggle.checked/);assert.match(html,/getHubAssetState/);
 const dashboard=fs.readFileSync('index.html','utf8');assert.match(dashboard,/section: r.hubSectionDisplay/);assert.doesNotMatch(dashboard,/hub2BlogRecordLinks|MutationObserver/);
});

test('hub Notion writes retry bounded 429 responses before reporting failure',async()=>{const x=setup();let n=0;x.ctx.fetch=async()=>++n<3?{status:429,headers:{get:()=>"1"},arrayBuffer:async()=>new ArrayBuffer(0)}:{status:200};assert.equal((await x.ctx.hubNotionFetch('notion')).status,200);assert.equal(n,3);});
