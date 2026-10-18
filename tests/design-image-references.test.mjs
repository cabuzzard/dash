import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const worker=readFileSync('worker/worker.js','utf8');
const helper=worker.slice(worker.indexOf('const GROK_IMAGE_REFERENCES ='),worker.indexOf('function plateContent('));
function setup(library=[],photo=null){
 const requests=[],reads=[];
 const context=vm.createContext({WeakMap,Map,Set,JSON,console,NOTION_VERSION:'2022-06-28',HUB_SITES:[{slug:'hub',campaignId:'abc'}],dsDash:x=>x,fetch:async(url,options)=>{
  requests.push({url,body:JSON.parse(options.body||'{}')});
  if(url.startsWith('https://api.notion.com/'))return {ok:true,json:async()=>({properties:{Campaign:{relation:[{id:'abc'}]}}})};
  return {ok:true,status:200,json:async()=>({data:[{url:'https://example.test/output.png'}]})};
 }});
 vm.runInContext(helper+"\nglobalThis.referenceMeta = GROK_IMAGE_REFERENCES;",context);
 const env={XAI_API_KEY:'not-a-real-key',TRADES:{get:async key=>{reads.push(key);return {mediaLibrary:library,photo};}}};
 const call=async(extra={})=>context.grokImageFetch(env,{campaignId:'abc',...extra},{method:'POST',body:JSON.stringify({model:'grok-imagine-image-2.0',prompt:'Create a staged thumbnail',n:1,aspect_ratio:'16:9',resolution:'2k'})});
 return {context,env,requests,reads,call};
}
test('Grok receives actual uploaded images on image-edit endpoint',async()=>{
 const x=setup([{id:'1',url:'https://example.test/guide.png',role:'brand-guide',name:'Guide',notes:'Warm ink and watercolor'},{id:'2',url:'https://example.test/motif.png',role:'motif-reference'}]);
 const r=await x.call(),request=x.requests.at(-1);assert.match(request.url,/images\/edits$/);
 assert.deepEqual(request.body.images.map(i=>i.url),['https://example.test/guide.png','https://example.test/motif.png']);assert.match(request.body.prompt,/Warm ink and watercolor/);assert.equal(request.body.aspect_ratio,'16:9');
 assert.equal(x.context.referenceMeta.get(r).attached,2);
});
test('single reference uses documented image field; empty library retains generation path',async()=>{
 let x=setup([{url:'https://example.test/guide.png',role:'brand-guide'}]);await x.call();assert.equal(x.requests.at(-1).body.image.url,'https://example.test/guide.png');assert.equal(x.requests.at(-1).body.images,undefined);
 x=setup();await x.call();assert.match(x.requests.at(-1).url,/images\/generations$/);assert.equal(x.requests.at(-1).body.prompt,'Create a staged thumbnail');
});
test('five-image limit ranks approved references and keeps previous image first',async()=>{
 const library=[...Array.from({length:7},(_,i)=>({url:`https://example.test/site${i}.png`,role:'site-image'})),{url:'https://example.test/guide.png',role:'brand-guide'},{url:'https://example.test/approved.png',role:'approved-example'}];
 const x=setup(library);const r=await x.call({previousImageUrl:'https://example.test/previous.png'});const images=x.requests.at(-1).body.images;
 assert.equal(images.length,5);assert.equal(images[0].url,'https://example.test/previous.png');assert.equal(images[1].url,'https://example.test/approved.png');assert.equal(images[2].url,'https://example.test/guide.png');assert.equal(x.context.referenceMeta.get(r).available,10);
});
test('removed images are not sent and duplicate URLs are not repeated',async()=>{
 const x=setup([{url:'https://example.test/kept.png',role:'brand-guide'},{url:'https://example.test/kept.png',role:'approved-example'}]);await x.call();const req=x.requests.at(-1).body;
 assert.equal(req.image.url,'https://example.test/kept.png');assert.doesNotMatch(JSON.stringify(req),/removed.png/);
});
test('asset and dynamically registered hub contexts resolve the correct library',async()=>{
 const x=setup([{url:'https://example.test/guide.png'}]);await x.call({campaignId:'',assetId:'asset'});assert.equal(x.reads.at(-1),'design:inputs:abc');assert.match(x.requests[0].url,/api.notion.com/);
 const y=setup();await y.call({campaignId:'',slug:'hub'});assert.equal(y.reads.at(-1),'design:inputs:abc');
});
test('all eleven Grok image entry points use the shared reference transport',()=>{
 assert.equal((worker.match(/const xr = await grokImageFetch\(/g)||[]).length,11);
 assert.equal((worker.match(/fetch\("https:\/\/api.x.ai\/v1\/images\/generations"/g)||[]).length,0);
 assert.match(worker,/content: plateContent\(claudePrompt \+ lfGuide, brief\)/);
});
const describe=worker.slice(worker.indexOf('async function dsDescribeLibrary('),worker.indexOf('function dsChatPrompt('));
test('visual descriptions use actual image inputs, skip cached images and preserve identity',async()=>{
 const requests=[],ctx=vm.createContext({Map,JSON,console,dsParseJson:JSON.parse,fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({content:[{type:'text',text:JSON.stringify({images:[{index:0,description:'Warm watercolor; soft outlines; empty left text area.'}]})}]})};}});
 vm.runInContext(describe,ctx);
 const result=await ctx.dsDescribeLibrary({ANTHROPIC_API_KEY:'not-real'},[{id:'new',url:'https://example.test/new.png'},{id:'cached',url:'https://example.test/old.png',visualRead:'Cached description'}]);
 assert.equal(requests[0].messages[0].content.filter(x=>x.type==='image').length,1);assert.match(result.get('new').text,/Warm watercolor/);assert.equal(result.has('cached'),false);
});
test('copied prompt includes every image and visual summary with no false attachment claim',()=>{
 const promptFn=worker.slice(worker.indexOf('function dsChatPrompt('),worker.indexOf('// spec → the hub',worker.indexOf('function dsChatPrompt(')));
 const ctx=vm.createContext({Set,DS_KEYS:new Set(['img.motif']),DS_TIERS:[['image','Imagery']],DS_SCHEMA:[{tier:'image',label:'Imagery',fields:[['img.motif','Motif','short description']]}],DS_STRUCTURE:new Set(),dsInputsBlock:()=>'',result:null});
 vm.runInContext(promptFn,ctx);
 const library=Array.from({length:24},(_,i)=>({id:String(i),name:`Reference ${i}`,role:'brand-guide',url:`https://example.test/${i}.png`,visualRead:i===0?'Observed watercolor style':''}));
 const prompt=ctx.dsChatPrompt('Hub',{mediaLibrary:library},{},'',{});
 assert.match(prompt,/Reference 23/);assert.match(prompt,/Observed watercolor style/);assert.match(prompt,/STOP and ask/);assert.match(prompt,/not automatic image attachments/);assert.doesNotMatch(prompt,/I have attached them|Rewrite any current value you would do differently/);
});

test('reference-read failure fails the request rather than silently generating without images',async()=>{
 const x=setup();x.env.TRADES.get=async()=>{throw Error('Library unavailable');};
 await assert.rejects(x.call(),/Library unavailable/);assert.equal(x.requests.length,0);
});

const libraryOperation=worker.slice(worker.indexOf('  if (op === "library")'),worker.indexOf('  if (op === "edit")',worker.indexOf('  if (op === "library")')));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const editLibrary=new AsyncFunction('body','inputs','put','out','env','cid','K','op',libraryOperation);
test('persisted image metadata update keeps URL, ID, cached description and other images',async()=>{
 const inputs={mediaLibrary:[{id:'ref',url:'https://example.test/ref.png',name:'Guide',role:'brand-guide',notes:'Old',visualRead:'Observed watercolor',at:'original'},{id:'other',url:'https://example.test/other.png',notes:'Untouched'}]};let stored;
 await editLibrary({update:{id:'ref',name:'Revised guide',role:'motif-reference',notes:'Use the texture; avoid the scene',url:'https://example.test/ignore.png'}},inputs,async(k,v)=>stored=JSON.parse(JSON.stringify(v)),extra=>extra,{},'hub',{inputs:'inputs'},'library');
 assert.equal(stored.mediaLibrary.length,2);assert.equal(stored.mediaLibrary[0].id,'ref');assert.equal(stored.mediaLibrary[0].url,'https://example.test/ref.png');assert.equal(stored.mediaLibrary[0].visualRead,'Observed watercolor');assert.equal(stored.mediaLibrary[1].notes,'Untouched');assert.equal(stored.mediaLibrary[0].notes,'Use the texture; avoid the scene');
 const x=setup(stored.mediaLibrary);await x.call();assert.match(x.requests.at(-1).body.prompt,/Use the texture; avoid the scene/);
});
test('metadata validation rejects missing images and invalid fields without writes',async()=>{
 const inputs={mediaLibrary:[{id:'ref',name:'Guide',notes:'Old',role:'brand-guide'}]};let writes=0;
 for(const update of [{id:'missing',notes:'New'},{id:'ref',name:''},{id:'ref',role:'invalid'},{id:'ref',notes:'x'.repeat(501)}]){
  const result=await editLibrary({update},structuredClone(inputs),async()=>writes++,extra=>extra,{},'hub',{inputs:'inputs'},'library');assert.ok(result.error);
 }
 assert.equal(writes,0);
});
