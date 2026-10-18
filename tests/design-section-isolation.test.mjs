import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('shared/codex-design-panel.js','utf8');
const schema=[{id:'color',fields:[['color.bg','Background'],['color.primary','Primary']]},{id:'type',fields:[['type.display_font','Display'],['type.body_font','Body']]},{id:'intent',fields:[['intent.page_job','Job']]},{id:'imagery',fields:[['img.motif','Motif']]},{id:'asset.youtube_thumb',tier:'asset',fields:[['asset.youtube_thumb.layout','Layout']]}];
const saved={'color.bg':{v:'#FFFFFF'},'type.body_font':{v:'Arial'},'img.motif':{v:'Saved motif'}};
async function setup({empty=false,repaintError=false,thumbnailError=false,references=[],libraryError=false}={}){
 const handlers={},renders=[],calls=[];
 const modal={addEventListener:(name,fn)=>handlers['modal:'+name]=fn,showModal:()=>{},focus:()=>{}};
 const root={innerHTML:'',insertAdjacentHTML:(where,html)=>root.innerHTML+=html,addEventListener:(name,fn)=>handlers[name]=fn,querySelector:selector=>selector==='[data-library-dialog]'?modal:null};
 let stage={...saved,'color.bg':{v:'#FF0000'},'type.body_font':{v:'Uncommitted font'},'img.motif':{v:'Uncommitted motif'}};
 const context=vm.createContext({window:{},navigator:{clipboard:{writeText:async()=>{}}},CSS:{escape:x=>x},console,Date,Promise});
 vm.runInContext(source,context);
 const api=context.window.CodexDesignPanel.mount(root,{campaignId:'hub',preview:d=>renders.push(JSON.parse(JSON.stringify(d))),call:async(action,body)=>{
  calls.push({action,...JSON.parse(JSON.stringify(body))});
  if(body.op==='library' && body.update){if(libraryError)return {error:'Could not save guidance'};references=references.map(x=>x.id===body.update.id?{...x,...body.update}:x);}
  if(body.op==='library' && body.remove)references=references.filter(x=>x.id!==body.remove);
  if(action==='renderSpecTest' && thumbnailError)return {error:'Generation failed'};
  if(action==='renderSpecTest')return {imageUrl:'https://example.test/thumb.png',prompt:'Original thumbnail prompt'};
  if(body.op==='repaint')return repaintError?{error:'Preview service unavailable'}:{css:'.hero{border-radius:12px}'};
  if(body.op==='chatReply')for(const [k,v] of Object.entries(JSON.parse(body.text).fields))if(body.only.includes(k))stage[k]=v;
  if(body.op==='revert')for(const k of body.keys){if(saved[k])stage[k]=saved[k];else delete stage[k];}
  return {schema,saved:empty?{}:saved,staged:empty&&body.op==='get'?{}:stage,inputs:{mediaLibrary:references},applied:body.op==='chatReply'?body.only:[]};
 }});
 for(let n=0;n<20;n++)await Promise.resolve();
 const click=(act,extra={})=>handlers.click({target:{closest:()=>({dataset:{act,...extra}})}});
 const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve();};
 return {api,root,renders,calls,click,flush,submit:()=>handlers.submit({target:{matches:()=>true},preventDefault(){}}),editInput:(key,value)=>handlers.input({target:{dataset:{libEdit:key},value}}),cancel:()=>handlers['modal:cancel']({preventDefault(){}})};
}
test('one staged color previews without complete palette or fonts; unrelated drafts stay out',async()=>{
 const x=await setup();x.api.state.group='colors';await x.api.previewStaged();const last=x.renders.at(-1);
 assert.equal(last.palette.bg,'#FF0000');assert.equal(last.fonts.body,'Arial');assert.equal(last.palette.sea,undefined);
 assert.equal(x.calls.filter(c=>c.op==='repaint').length,0);
});
test('one font previews independently and repaint is scoped to typography',async()=>{
 const x=await setup();x.api.state.group='typography';await x.api.previewStaged();
 const d=x.renders.at(-1);assert.equal(d.fonts.body,'Uncommitted font');assert.equal(d.palette.bg,'#FFFFFF');
 assert.deepEqual(x.calls.at(-1).keys,['type.display_font','type.body_font']);assert.match(d.css,/border-radius/);
});
test('empty design can stage and preview one section without other setup',async()=>{
 const x=await setup({empty:true});x.api.state.group='colors';x.api.state.reply=JSON.stringify({fields:{'color.primary':{v:'#00FF00'},'type.body_font':{v:'Wrong'}}});
 x.click('stage');await x.flush();
 assert.equal(x.renders.at(-1).palette.sea,'#00FF00');assert.equal(x.api.state.staged['type.body_font'].v,'Uncommitted font');
 assert.equal(x.api.state.busy,'');assert.match(x.api.state.msg,/validated and staged/);
});
test('switching sections isolates prompt drafts and thumbnail tests',async()=>{
 const x=await setup();x.api.state.note='Direction note';x.api.state.reply='Direction reply';x.api.state.testThumb={url:'direction'};
 x.click('group',{group:'colors'});assert.equal(x.api.state.note,'');assert.equal(x.api.state.testThumb,null);
 x.api.state.note='Color note';x.click('group',{group:'direction'});assert.equal(x.api.state.note,'Direction note');assert.equal(x.api.state.reply,'Direction reply');assert.equal(x.api.state.testThumb.url,'direction');
});
test('thumbnail uses selected imagery plus saved palette, never unrelated staged colors',async()=>{
 const x=await setup();x.api.state.group='motif';x.click('testThumb');await x.flush();
 const request=x.calls.find(c=>c.action==='renderSpecTest');assert.match(request.spec,/Uncommitted motif/);assert.match(request.spec,/#FFFFFF/);assert.doesNotMatch(request.spec,/#FF0000|Uncommitted font/);
});
test('preview failure preserves staged fields and reports preview error truthfully',async()=>{
 const x=await setup({repaintError:true});x.api.state.group='typography';x.api.state.reply=JSON.stringify({fields:{'type.display_font':{v:'Georgia'}}});x.click('stage');await x.flush();
 assert.equal(x.api.state.staged['type.display_font'].v,'Georgia');assert.match(x.api.state.msg,/Preview could not finish/);assert.doesNotMatch(x.api.state.msg,/Nothing was staged/);
});
test('worker repaint overlays only requested keys on saved baseline',()=>{
 const worker=readFileSync('worker/worker.js','utf8');const start=worker.indexOf('    const baseline = (saved && saved.spec) || {};',worker.indexOf('if (op === "repaint")'));
 const end=worker.indexOf('    if (!slug)',start);const code=worker.slice(start,end)+'\nresult=src;';
 const env={saved:{spec:saved},staged:{'color.bg':{v:'#000000'},'type.body_font':{v:'Inter'}},scoped:new Set(['type.body_font']),body:{},hubSlugForCampaign:()=> 'hub',cid:'hub',result:null};vm.runInNewContext(code,env);
 assert.equal(env.result['color.bg'].v,'#FFFFFF');assert.equal(env.result['type.body_font'].v,'Inter');
 assert.equal(env.staged['color.bg'].v,'#000000');
});

test('commit and revert send only current-section keys',async()=>{
 const x=await setup();x.api.state.group='colors';x.click('save');await x.flush();
 assert.deepEqual(x.calls.find(c=>c.op==='save').keys,['color.bg']);
 x.click('revert');await x.flush();assert.deepEqual(x.calls.find(c=>c.op==='revert').keys,['color.bg','color.primary']);
 assert.equal(x.api.state.staged['type.body_font'].v,'Uncommitted font');
});
test('worker section prompt context excludes unrelated staged edits',()=>{
 const worker=readFileSync('worker/worker.js','utf8');const a=worker.indexOf('    const promptSpec =');const b=worker.indexOf('    return out({ prompt:',a);
 const env={saved:{spec:saved},staged:{'color.bg':{v:'#000000'},'type.body_font':{v:'Inter'}},body:{only:['color.bg']},DS_KEYS:new Set(['color.bg','type.body_font']),result:null};
 vm.runInNewContext(worker.slice(a,b)+'\nresult=promptSpec;',env);
 assert.equal(env.result['color.bg'].v,'#000000');assert.equal(env.result['type.body_font'].v,'Arial');
});

test('regeneration requires direction and carries the previous prompt plus isolated spec',async()=>{
 const x=await setup();x.api.state.group='motif';x.click('testThumb');await x.flush();
 assert.equal(x.calls.filter(c=>c.action==='renderSpecTest').length,1);
 assert.match(x.root.innerHTML,/Regeneration direction/);
 x.click('testThumb');await x.flush();assert.equal(x.calls.filter(c=>c.action==='renderSpecTest').length,1);
 assert.match(x.api.state.msg,/Add regeneration direction/);
 x.api.state.thumbDirection='Keep the palette; simplify the scene and move the subject right';
 x.click('testThumb');await x.flush();const r=x.calls.filter(c=>c.action==='renderSpecTest').at(-1);
 assert.equal(r.previousPrompt,'Original thumbnail prompt');assert.equal(r.previousImageUrl,'https://example.test/thumb.png');assert.match(r.guidance,/simplify the scene/);assert.match(r.guidance,/wordless/);assert.match(r.spec,/#FFFFFF/);assert.doesNotMatch(r.spec,/#FF0000/);
 assert.equal(x.api.state.testThumb.direction,'Keep the palette; simplify the scene and move the subject right');assert.equal(x.api.state.thumbDirection,'');
});
test('thumbnail regeneration direction is kept separately for each section',async()=>{
 const x=await setup();x.api.state.group='motif';x.api.state.thumbDirection='Warmer light';
 x.click('group',{group:'assets'});assert.equal(x.api.state.thumbDirection,'');
 x.api.state.thumbDirection='More space left';x.click('group',{group:'motif'});assert.equal(x.api.state.thumbDirection,'Warmer light');
});

test('failed regeneration retains the current thumbnail and the requested direction',async()=>{
 const x=await setup({thumbnailError:true});x.api.state.group='motif';
 x.api.state.testThumb={url:'https://example.test/keep.png',prompt:'Keep this prompt'};x.api.state.thumbDirection='Softer lighting';
 x.click('testThumb');await x.flush();assert.equal(x.api.state.testThumb.url,'https://example.test/keep.png');assert.equal(x.api.state.thumbDirection,'Softer lighting');assert.equal(x.api.state.thumbStarted,null);assert.match(x.api.state.msg,/Generation failed/);
});

test('library exposes a visible Remove image action and updates references after removal',async()=>{
 const x=await setup({references:[{id:'ref',url:'https://example.test/ref.png',name:'Uploaded guide',role:'brand-guide'}]});
 assert.match(x.root.innerHTML,/>Remove image<\/button>/);
 x.click('libRemove',{id:'ref'});await x.flush();
 assert.equal(x.calls.find(c=>c.op==='library').remove,'ref');assert.equal(x.api.state.inputs.mediaLibrary.length,0);assert.doesNotMatch(x.root.innerHTML,/Uploaded guide/);
});

test('Edit spec opens populated modal and saves guidance on the same image record',async()=>{
 const x=await setup({references:[{id:'ref',url:'https://example.test/original.png',name:'Guide',role:'brand-guide',notes:'Original note'}]});
 x.click('libEdit',{id:'ref'});assert.match(x.root.innerHTML,/Edit spec image/);assert.match(x.root.innerHTML,/How to use this image/);assert.equal(x.api.state.libraryEdit.notes,'Original note');
 x.editInput('notes','Original note. Keep the ink outlines; avoid glossy 3D.');x.submit();await x.flush();
 const request=x.calls.find(c=>c.op==='library'&&c.update);assert.equal(request.update.id,'ref');assert.match(request.update.notes,/Keep the ink outlines/);assert.equal(request.update.url,undefined);
 assert.equal(x.api.state.inputs.mediaLibrary[0].url,'https://example.test/original.png');assert.equal(x.api.state.libraryEdit,null);assert.match(x.api.state.msg,/guidance saved/);
});
test('Cancel and Escape discard modal edits without changing the saved guidance',async()=>{
 const x=await setup({references:[{id:'ref',url:'https://example.test/original.png',name:'Guide',role:'brand-guide',notes:'Original note'}]});
 x.click('libEdit',{id:'ref'});x.editInput('notes','Unsaved note');x.click('libEditCancel');assert.equal(x.api.state.inputs.mediaLibrary[0].notes,'Original note');
 x.click('libEdit',{id:'ref'});assert.equal(x.api.state.libraryEdit.notes,'Original note');x.cancel();assert.equal(x.api.state.libraryEdit,null);assert.equal(x.calls.filter(c=>c.update).length,0);
});
test('failed metadata save leaves guidance available in the open modal',async()=>{
 const x=await setup({libraryError:true,references:[{id:'ref',url:'https://example.test/original.png',name:'Guide',role:'brand-guide',notes:'Original note'}]});
 x.click('libEdit',{id:'ref'});x.editInput('notes','Retry this guidance');x.submit();await x.flush();assert.equal(x.api.state.libraryEdit.notes,'Retry this guidance');assert.match(x.api.state.libraryEditError,/Could not save/);assert.equal(x.api.state.inputs.mediaLibrary[0].notes,'Original note');
});
