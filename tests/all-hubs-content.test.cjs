const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const aggregate=html.slice(html.indexOf('const HUB2_ALL ='),html.indexOf('async function hub2ContentLoad'));
const renderer=html.slice(html.indexOf('function hub2ContentHtml(slug)'),html.indexOf('\nfunction hub2CodexAttach'));
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:''});return elements.get(id);};
let feeds=0,loads=[];
const ctx=vm.createContext({document:{getElementById:get},console,Set,Map,
 esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;'),
 hubSitesExtraLoad:async()=>vm.runInContext("HUB_SITES.push({slug:'extra',name:'Extra',campaignId:'3'});_hubRegistryReady=true",ctx),
 devAssetsTable:async()=>{feeds++;return {rows:[{id:'source'}],apps:[]};},
 hub2ContentLoad:async slug=>{loads.push(slug);vm.runInContext(`_hub2Content['${slug}']={rows:[{id:'${slug}',type:'Product',name:'${slug}',product:'${slug}',productId:'${slug}',status:'Development'}]}`,ctx);},
 hub2ContentPaint:()=>{},hub2ContentColOrder:c=>c,hub2ColHidden:()=>new Set(),hub2HideIdea:()=>false,
 hub2Hierarchy:()=>{throw Error('Aggregate must not drop records outside a single hub hierarchy');},
 kwNid:s=>s,appCell:()=>'',appIcon:()=>''});
vm.runInContext(`const HUB_SITES=[{slug:'a',name:'Alpha',campaignId:'1'},{slug:'b',name:'Beta',campaignId:'2'}];
let _hubRegistryReady=false,DEV2_ROWS=[],DEV2_APPS=[],_hub2ColsAll=[];
const _hub2Visible={},_hub2Content={},_hub2Selected={},_hub2BulkMsg={},_hub2ContentSort={},_hub2ContentGroup={},_hub2ContentClosed={},_hub2ContentFilters={},_hub2ContentFilterOpen={},_hub2TitleFocus={},_hub2AssetFocus={},_hubKw={};`,ctx);
vm.runInContext(aggregate+renderer,ctx);
(async()=>{
 await vm.runInContext('hub2AllLoad()',ctx);
 assert.equal(feeds,1);assert.deepEqual(loads,['a','b','extra']);
 assert.equal(vm.runInContext('_hub2Content[HUB2_ALL].rows.length',ctx),3);
 let rendered=vm.runInContext('hub2ContentHtml(HUB2_ALL)',ctx);
 assert.match(rendered,/Hub/);assert.match(rendered,/Alpha/);assert.match(rendered,/Beta/);assert.match(rendered,/Extra/);
 assert.match(rendered,/hub2ProductEdit\('a','a'\)/);assert.match(rendered,/hub2MainToggle\('b','b'/);
 vm.runInContext("_hub2ContentFilters[HUB2_ALL]=[{col:'hub',val:'Beta',op:'is'}]",ctx);
 rendered=vm.runInContext('hub2ContentHtml(HUB2_ALL)',ctx);
 assert.equal(vm.runInContext('_hub2Visible[HUB2_ALL].length',ctx),1);
 assert.doesNotMatch(rendered,/hub2ProductEdit\('a'/);assert.match(rendered,/hub2ProductEdit\('b'/);
 vm.runInContext("_hub2Selected[HUB2_ALL]=new Set(['p:a','p:b'])",ctx);
 rendered=vm.runInContext('hub2ContentHtml(HUB2_ALL)',ctx);
 assert.match(rendered,/hub2AllAction\('hub2BulkDelete',this\)/);
 assert.match(rendered,/hub2AllKeywordAction\(this,true\)/);
 assert.equal(vm.runInContext('_hub2ContentFilters.a',ctx),undefined);
 console.log('PASS: complete dynamic hub registry, one feed, all records, shared renderer, hub filter, source-hub editing and bulk routing');
})().catch(e=>{console.error(e);process.exitCode=1;});
