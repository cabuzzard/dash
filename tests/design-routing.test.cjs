const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('worker/worker.js','utf8');
function fixture(committed=true){
 const cid='a'.repeat(32),kv=new Map(),calls=[],held=[];
 const spec={'color.bg':{v:'#123456',g:'Keep the ink'},'img.medium':{v:'ink illustration'},'asset.blog_thumb.instructions':{v:'A DISTINCT BLOG INSTRUCTION '+ 'complete prose '.repeat(400)},'asset.youtube_thumb.instructions':{v:'UNRELATED YOUTUBE'},'layout.grid':{v:'UNRELATED WEB GRID'}};
 if(committed)kv.set('design:spec:'+cid,{spec});
 const research={properties:{Keywords:{rich_text:[{plain_text:'guitar'}]},'Design Notes':{rich_text:[{plain_text:'design fact'}]},'Image Spec':{rich_text:[{plain_text:'LEGACY SPEC '.repeat(50)}]},'Pain Points':{type:'rich_text',rich_text:[{plain_text:'UNRELATED RESEARCH '.repeat(900)}]}}};
 const c=vm.createContext({JSON,Object,Set,Map,Date,WeakMap,console,HUB_SITES:[],NOTION_VERSION:'test',RESEARCH_DB:'research',ASSETS_DB:'assets',STRATEGY_FIELDS:[],notionQuery:async db=>db==='research'?[research]:[],fetch:async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({properties:{}})};},flowHold:async(e,x)=>held.push(x),parseApprovedPlate:()=>null});
 vm.runInContext(src.slice(src.indexOf('const DS_SCHEMA ='),src.indexOf('function dsInputsBlock(')),c);
 vm.runInContext(src.slice(src.indexOf('async function assembleImageBrief('),src.indexOf('async function writeImageSpec(')),c);
 c.writeImageSpec=async(e,b)=>{calls.push({draft:true,brief:b});return 'Draft from hub facts only';};
 const env={TRADES:{get:async k=>kv.get(k)||null,put:async(k,v)=>kv.set(k,JSON.parse(v))}};
 return {cid,c,env,kv,calls,held};
}
test('non-modal callers use committed format text, preserve full instructions/guidance and omit unrelated research/formats',async()=>{
 const x=fixture(),r=await x.c.assembleImageBrief(x.env,{campaignId:x.cid,codexDesign:false,format:'blog_thumb'});
 assert.equal(r.hasCommittedSpec,true);assert.match(r.storedSpec,/A DISTINCT BLOG INSTRUCTION/);assert.match(r.storedSpec,/Operator guidance for color.bg: Keep the ink/);
 assert.ok(r.storedSpec.length>5600);assert.doesNotMatch(r.storedSpec,/UNRELATED|LEGACY SPEC/);assert.doesNotMatch(r.facts.join('\n'),/UNRELATED RESEARCH/);assert.match(r.facts.join('\n'),/design fact/);
});
test('legacy text is importable only as a staged review note; repeated holds make zero model calls and preserve payload without token',async()=>{
 const x=fixture(false),r=await x.c.assembleImageBrief(x.env,{campaignId:x.cid,runGuidance:'NEVER UPSTREAM'});
 assert.equal(r.storedSpec,'');assert.match(r.legacySpec,/LEGACY SPEC/);
 for(let i=0;i<2;i++){const held=await x.c.holdImageWithoutSpec(x.env,r,{action:'generateOfferImage',token:'private',governanceUnlock:'private-unlock',guidance:'asset-only'});assert.equal(held.error,'no_committed_design_spec');}
 assert.equal(x.calls.filter(y=>y.draft).length,0);const stage=x.kv.get('design:stage:'+x.cid);assert.equal(stage.__draftSpec.source,'legacy');assert.equal(stage.__draftSpec.status,'awaiting_review');assert.equal(x.kv.has('design:spec:'+x.cid),false);assert.equal(x.held.length,2);assert.equal(x.held[0].payload.token,undefined);assert.equal(x.held[0].payload.governanceUnlock,undefined);assert.equal(x.held[0].payload.guidance,'asset-only');
});
test('spec-less drafting is cached once and excludes downstream guidance; a later commit releases the gate',async()=>{
 const x=fixture(false);x.c.assembleImageBrief=async()=>({campaignId:x.cid,facts:['hub fact']});
 const brief={campaignId:x.cid,assetGuidance:'asset',runGuidance:'run',facts:['asset facts']};
 await x.c.holdImageWithoutSpec(x.env,brief,{action:'render'});await x.c.holdImageWithoutSpec(x.env,brief,{action:'render'});
 const drafts=x.calls.filter(y=>y.draft);assert.equal(drafts.length,1);assert.equal(drafts[0].brief.assetGuidance,'');assert.equal(drafts[0].brief.runGuidance,'');assert.deepEqual(drafts[0].brief.facts,['hub fact']);
 assert.equal(await x.c.holdImageWithoutSpec(x.env,{hasCommittedSpec:true},{action:'render'}),null);
});
test('live asset image paths gate before model calls; staged test rendering remains exempt',()=>{
 for(const name of ['generateOfferImage','generateYouTubeThumbnail','generateBlogPostThumbnail','generateSinglePostBackground','generateSinglePostFullCreative','generateSocialBackgroundForAsset','generateLongformBackground','generateLongformImage']){
  const a=src.indexOf('if (body.action === "'+name+'"'),b=src.indexOf('\n      if (body.action === ',a+1),part=src.slice(a,b);
  assert.match(part,/holdImageWithoutSpec/,name);assert.doesNotMatch(part,/await writeImageSpec\(/,name);assert.ok(part.indexOf('holdImageWithoutSpec')<part.indexOf('api.anthropic.com/v1/messages'),name);
 }
 const a=src.indexOf('if (body.action === "renderSpecTest")'),b=src.indexOf('\n      if (body.action === ',a+1);assert.doesNotMatch(src.slice(a,b),/holdImageWithoutSpec/);
});
test('carousel OCR obeys disabled-image policy before downloading or sending images',async()=>{
 const c=vm.createContext({SEND_IMAGES_TO_MODELS:false,flowHold:async(e,x)=>e.held.push(x),fetch:()=>{throw Error('must not fetch')}});const a=src.indexOf('async function ocrImagesViaClaude('),b=src.indexOf('// Scrapes the saved URL',a);vm.runInContext(src.slice(a,b),c);const env={held:[]};await assert.rejects(c.ocrImagesViaClaude(env,['https://image.test/a']),/image_inputs_disabled/);assert.equal(env.held[0].payload.imageUrls[0],'https://image.test/a');
});
test('usage telemetry stores provider counts and character sizes, never prompt or guidance contents',async()=>{
 const x=fixture();x.c.plateContent=(p,b)=>p+' '+b.runGuidance;
 await x.c.recordDesignPromptUsage(x.env,{campaignId:x.cid,format:'blog_thumb',runGuidance:'private guidance'},'generateBlogPostThumbnail',{usage:{input_tokens:123,output_tokens:34}},'private prompt');
 const row=x.kv.get('design:usage:v1')[0];assert.equal(row.usage.input_tokens,123);assert.equal(row.imageAttachments,0);assert.ok(row.promptCharacters>0);assert.doesNotMatch(JSON.stringify(row),/private/);
});
