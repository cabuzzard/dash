const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('index.html','utf8');
const code=source.slice(source.indexOf('function hub2BlogRecordPath('),source.indexOf('function wireHubPreview('));
const aid='a'.repeat(32),other='b'.repeat(32),details={open:false,scrollIntoView(){this.scrolled=true;}},messages=[];
const state={rows:[{type:'Asset',id:aid,name:'Same headline',rawType:'Topical Post'},{type:'Asset',id:other,name:'Same headline',rawType:'YouTube'}]};
const context=vm.createContext({URL,Set,Promise,MutationObserver:class{observe(){}},HUB_SITES:[{slug:'hub',campaignId:'campaign'}],
 DEV2_ROWS:[{campId:'campaign',assetId:aid,hubLiveUrl:'https://custom.test/blog/first/'}],
 _hub2Content:{hub:state},_hub2TitleFocus:{hub:{}},_hub2AssetFocus:{},_hub2Selected:{},_hub2ContentFilters:{hub:[{col:'status',val:'Idea'}]},_hub2ContentClosed:{hub:new Set(['group'])},
 kwNid:s=>String(s||'').replaceAll('-',''),hub2ContentLoad:async()=>{},hub2ContentPaint:()=>{},showToast:m=>messages.push(m),
 document:{getElementById:()=>({closest:()=>details})},fetch:async()=>({ok:true,json:async()=>[]}),hpiIsHub2:()=>true,HUB2_EDIT:{hub:true}});
vm.runInContext(code,context);
(async()=>{
 await context.hub2BlogShowRecord('hub','https://cabuzzard.github.io/dash/web/hub/hub/blog/first/index.html?v=1','Same headline','https://cabuzzard.github.io/dash/web/hub/hub/');
 assert.equal(context._hub2AssetFocus.hub.id,aid);assert.equal(context._hub2ContentFilters.hub.length,0);assert.equal(context._hub2ContentClosed.hub.size,0);assert.ok(!context._hub2TitleFocus.hub);assert.ok(details.open&&details.scrolled);
 context.DEV2_ROWS=[];context.fetch=async()=>({ok:true,json:async()=>[{slug:'renamed',assetId:aid}]});
 await context.hub2BlogShowRecord('hub','./blog/renamed/','Different headline','https://example.test/');assert.equal(context._hub2AssetFocus.hub.id,aid);
 state.rows.push({type:'Asset',id:'duplicate',name:'Same headline',rawType:'Blog Article'});context.fetch=async()=>({ok:true,json:async()=>[]});
 await context.hub2BlogShowRecord('hub','./blog/missing/','Same headline','https://example.test/');assert.ok(messages.at(-1).includes('Could not identify one'));
 let click;const card={classList:{add(){}},href:'https://example.test/blog/first/',querySelector:()=>({textContent:'Same headline'})};
 context.hub2WireBlogRecordLinks('hub',{querySelectorAll:()=>[card],addEventListener:(name,fn)=>{click=fn;},body:{},baseURI:'https://example.test/'});
 let prevented=false;context.HUB2_EDIT.hub=false;click({target:{closest:()=>card},preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,false);
 context.HUB2_EDIT.hub=true;context.hub2BlogShowRecord=()=>{};click({target:{closest:()=>card},preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,true);
 console.log('PASS: exact record matching, manifest IDs, filter/collapse clearing, ambiguity rejection and hover-edit-only navigation');
})().catch(e=>{console.error(e);process.exitCode=1;});
