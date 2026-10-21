const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('worker/worker.js','utf8');
const hub={slug:'sunflower-acres',name:'Sunflower Acres',campaignId:'3871f7d3a4bb814997e5f3400fc3ff57'};
const aid='a'.repeat(32),rt=text=>[{plain_text:text,text:{content:text}}];
const asset=(id=aid,type='Offer – Content Hub',status='Published',extra={})=>({id,created_time:'2026-10-20',properties:{
 'Asset Type':{select:{name:type}},'Asset Status':{select:{name:status}},Campaign:{relation:[{id:hub.campaignId}]},
 'Content Hub':{select:{name:hub.slug}},'Asset Title':{title:rt('Garden visit')},'Platform Title':{rich_text:rt('Accessible garden visit')},
 Body:{rich_text:rt('Plan an accessible garden visit.')},Thumbnail:{url:'https://example.test/thumbnail.jpg'},...extra}});
const block=(type,text,extra={})=>({type,[type]:{rich_text:rt(text)},...extra});
function setup(rows=[]){
 const files=new Map([['web/hub/sunflower-acres/blog/posts.json',JSON.stringify([{assetId:'news-id',slug:'news',title:'News',intro:'News introduction'}])]]);
 const pages=new Map(rows.map(p=>[p.id.replaceAll('-',''),p]));const patches=[],writes=[],reads=[];
 const ctx=vm.createContext({hierarchyForHub:async()=>({asset:()=>true}),requireHierarchyPlacement:async()=>({placed:true}),hierarchyPlacement:async()=>({placed:true,applies:true}),console,URL,Map,Set,JSON,Date,ASSETS_DB:'assets',NOTION_VERSION:'version',NOTION_TOKEN:'fixture',HUB_SITES:[hub],
  ivDash:id=>id,lfReadRich:p=>(p?.rich_text||[]).map(x=>x.plain_text).join(''),
  notionQuery:async(db,q)=>rows.filter(p=>p.properties['Asset Status'].select.name==='Published'),
  hubSiteTarget:async({sub='blog'}={})=>({basePath:'web/hub/sunflower-acres/'+sub,campName:'Sunflower Acres',hub,s:{bg:'#fff',ink:'#111',accent:'#333',headlineFont:'Georgia',bodyFont:'Georgia'},
   deleteFile:async path=>files.delete(path),getFile:async path=>({text:files.get(path)||null}),putFile:async(path,text)=>{files.set(path,text);writes.push(path);}}),
  fetch:async(url,opts={})=>{
   if(url.includes('/children')){reads.push(url);return {ok:true,json:async()=>({results:[block('code',JSON.stringify({name:'Garden visit',promise:'Private planning metadata',ctaUrl:'https://example.test/book',ctaLabel:'Book'})),block('paragraph','The original full pitch.'),block('heading_2',"What's included"),block('bulleted_list_item','Accessible paths and a guided tour.')]})};}
   if(url.includes('api.notion.com')){const id=url.split('/').at(-1).replaceAll('-','');const p=pages.get(id);if(opts.method==='PATCH'){const values=JSON.parse(opts.body).properties;patches.push({id,values});Object.assign(p.properties,values);}return {ok:true,json:async()=>p};}
   if(url.includes('/posts.json'))return {ok:true,status:200,json:async()=>JSON.parse(files.get('web/hub/sunflower-acres/blog/posts.json')||'[]')};
   throw Error('Unexpected request '+url);
  }});
 for(const name of ['hubSectionOf','hubPagePath','topicalArticleParts','publishSeoPostToLiveSite','reconcileHubDir'])vm.runInContext(src.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))[0],ctx);
 vm.runInContext(src.slice(src.indexOf('// Offer cards consume'),src.indexOf('// Re-publishes ONE already-live Blog/SEO Post')),ctx);
 const start=src.indexOf('    if (body.action === "getHubProducts" || body.action === "getHubBlog")'),end=src.indexOf('    // ── getHubProjectExperience',start);
 vm.runInContext('async function feed(body,env={}){const json=x=>x;'+src.slice(start,end)+'}',ctx);
 for(const name of ['assetWritingContent','assetWritingState','requireAssetWriting'])vm.runInContext(src.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))[0],ctx);
 ctx.ivHdr=()=>({});ctx.ivPage=async id=>structuredClone(pages.get(id.replaceAll('-','')));
 return {ctx,files,pages,patches,writes,reads};
}
const request=kind=>({action:'getHubBlog',campaignId:hub.campaignId,slug:hub.slug,kind,withIds:true});
test('publish/unpublish/republish uses the SEO page generator and removes only its manifest entry',async()=>{
 const page=asset(),x=setup([page]);
 const first=await x.ctx.syncOfferAssetBlog({}, {},page);
 assert.equal(first.published,true);assert.match(first.liveUrl,/\/blog\/accessible-garden-visit\/$/);
 const manifest=()=>JSON.parse(x.files.get('web/hub/sunflower-acres/blog/posts.json'));
 assert.equal(manifest().length,2);assert.equal(page.properties['Content URL'].url,first.liveUrl);
 assert.equal(page.properties['Deployment Status'].select.name,'Deployed');
 const html=x.files.get('web/hub/sunflower-acres/blog/accessible-garden-visit/index.html');
 assert.match(html,/The original full pitch/);assert.match(html,/Accessible paths and a guided tour/);assert.match(html,/thumbnail.jpg/);assert.match(html,/https:\/\/example.test\/book/);assert.doesNotMatch(html,/Private planning metadata/);
 let feed=await x.ctx.feed(request('offers'));assert.equal(feed.posts.length,1);assert.equal(feed.posts[0].kicker,'Offer');assert.equal(feed.posts[0].excerpt,'Plan an accessible garden visit.');assert.equal(feed.posts[0].image,'https://example.test/thumbnail.jpg');
 page.properties['Asset Status'].select.name='Review';await x.ctx.syncOfferAssetBlog({}, {},page);
 assert.deepEqual(manifest().map(p=>p.slug),['news']);assert.equal((await x.ctx.feed(request('offers'))).posts.length,0);
 assert(!x.files.has('web/hub/sunflower-acres/blog/accessible-garden-visit/index.html'));
 page.properties['Asset Status'].select.name='Published';await x.ctx.syncOfferAssetBlog({}, {},page);await x.ctx.syncOfferAssetBlog({}, {},page);
 assert.equal(manifest().filter(p=>p.assetId===aid).length,1);assert.equal((await x.ctx.feed(request('offers'))).posts.length,1);
});
test('offers require blog form, match manifest by asset ID after a rename, and respect hub and section overrides',async()=>{
 const good=asset(),sales=asset('b'.repeat(32),'QA – Sales','Published',{'Content URL':{url:'https://cabuzzard.github.io/dash/web/hub/sunflower-acres/sales/accessible-garden-visit/'}}),missing=asset('c'.repeat(32)),other=asset('d'.repeat(32),'Offer – Content Hub','Published',{'Content Hub':{select:{name:'other-hub'}}}),unlisted=asset('e'.repeat(32),'Offer – Content Hub','Published',{'Hub Section':{select:{name:'Unlisted'}}});
 const x=setup([good,sales,missing,other,unlisted]);x.files.set('web/hub/sunflower-acres/blog/posts.json',JSON.stringify([{assetId:aid,slug:'original-slug',intro:'Indexed introduction'}]));
 const feed=await x.ctx.feed(request('offers'));assert.equal(feed.posts.length,1);assert.equal(feed.posts[0].id,aid);assert.equal(feed.posts[0].url,'./blog/original-slug/');
 assert.equal((await x.ctx.syncOfferAssetBlog({}, {},sales)).skipped,'not an offer blog asset');
 good.properties['Platform Title'].rich_text=rt('A renamed headline');assert.equal((await x.ctx.feed(request('offers'))).posts[0].url,'./blog/original-slug/');
});
test('news/articles responses retain their card shape and publishing behavior',async()=>{
 const news=asset('1'.repeat(32),'Blog - SEO - News','Published',{'Content URL':{url:'https://cabuzzard.github.io/dash/web/hub/sunflower-acres/blog/news/'}}),article=asset('2'.repeat(32),'SEO Post','Published',{'Content URL':{url:'https://example.test/article'}});const x=setup([news,article]);
 x.files.set('web/hub/sunflower-acres/blog/posts.json',JSON.stringify([{assetId:news.id,slug:'news'},{assetId:article.id,slug:'article'}]));
 const n=await x.ctx.feed(request('news'));assert.equal(n.posts.length,1);assert.equal(n.posts[0].kicker,'News analysis');assert.equal(n.posts[0].url,'./blog/news/');assert.equal(n.posts[0].excerpt,'Plan an accessible garden visit.');
 const a=await x.ctx.feed(request('articles'));assert.equal(a.posts.length,1);assert.equal(a.posts[0].kicker,'Article');assert.equal(a.posts[0].url,'./blog/article/');
 assert.equal((await x.ctx.feed({...request(''),kind:undefined})).posts.length,2);
 await x.ctx.syncOfferAssetBlog({}, {},news);await x.ctx.syncOfferAssetBlog({}, {},article);assert.equal(x.writes.length,0);assert.equal(x.patches.length,0);
});
test('partial page failures surface errors and nonpublished offers never generate pages',async()=>{
 const page=asset(),x=setup([page]);x.ctx.publishSeoPostToLiveSite=async()=>({published:false,error:'GitHub unavailable'});
 await assert.rejects(x.ctx.publishOfferAssetBlog({}, {},page),/GitHub unavailable/);assert.equal(x.patches.length,0);
 page.properties['Asset Status'].select.name='Review';assert.match((await x.ctx.publishOfferAssetBlog({}, {},page)).skipped,/not a Published/);
});
test('offer content reads pagination and nested blocks without generating new copy',async()=>{
 const x=setup();x.ctx.fetch=async url=>({ok:true,json:async()=>url.includes('start_cursor')?{results:[block('paragraph','Second page')]}:url.includes('/nested/')?{results:[block('paragraph','Nested content')]}:{results:[block('paragraph','First page',{id:'nested',has_children:true})],has_more:true,next_cursor:'next'}});
 const blocks=await x.ctx.offerBlogBlocks({},'asset');assert.equal(blocks.length,3);const parts=x.ctx.offerBlogParts({},blocks);assert.match(parts.intro,/First page[\s\S]*Nested content[\s\S]*Second page/);
});
test('both existing save actions call the same sync and the backfill calls the same generator',()=>{
 for(const action of ['updatePublishFields','updateAssetStatus']){const code=src.slice(src.indexOf(`if (body.action === "${action}")`));assert.match(code.slice(0,code.indexOf('return json({ success: true')),/await syncOfferAssetBlog/);}
 const backfill=src.slice(src.indexOf('if (body.action === "backfillHubOfferBlog")'),src.indexOf('// ── backfillHubBlog'));
 assert.match(backfill,/equals: 'Published'/);assert.match(backfill,/await publishOfferAssetBlog/);assert.doesNotMatch(backfill,/PRODUCTS_DB/);
});
test('template and every generated hub consume the same offers feed and renderer',()=>{
 const root='web/hub',files=[root+'/hub-template.html',...fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&fs.existsSync(`${root}/${d.name}/index.html`)).map(d=>`${root}/${d.name}/index.html`)];
 let reference;
 for(const file of files){const html=fs.readFileSync(file,'utf8');if(!html.includes('renderHubOffers'))continue;const fn=html.match(/async function renderHubOffers\(\) \{[^]*?\n}/)[0].replaceAll('\r\n','\n');reference??=fn;assert.equal(fn,reference,file);assert.match(fn,/kind: "offers"/);assert.match(fn,/data.posts/);assert.doesNotMatch(fn,/getHubProducts|\.\/offers\//);}
});
