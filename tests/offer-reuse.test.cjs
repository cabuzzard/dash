const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync('worker/worker.js','utf8'),code=src.match(/async function offerReuseTarget\([\s\S]*?\n}/)[0];
const aid='a'.repeat(32),tid='b'.repeat(32),pid='c'.repeat(32),cid='d'.repeat(32);
let page={properties:{'Asset Type':{select:{name:'Offer – Content Hub'}},'Content Strategy':{relation:[{id:tid}]},Product:{relation:[{id:pid}]},Campaign:{relation:[{id:cid}]}}};
const ctx=vm.createContext({fetch:async()=>({ok:true,json:async()=>page})});vm.runInContext(code,ctx);
(async()=>{
 const expected={assetType:'Offer – Content Hub',titleId:tid,productId:pid,campaignId:cid};
 assert.equal(await ctx.offerReuseTarget({},aid,expected),aid);
 for(const key of ['titleId','productId','campaignId','assetType'])await assert.rejects(ctx.offerReuseTarget({},aid,{...expected,[key]:'wrong'}),/does not belong/);
 await assert.rejects(ctx.offerReuseTarget({},'bad',expected),/Invalid/);
 page.archived=true;await assert.rejects(ctx.offerReuseTarget({},aid,expected),/unavailable/);
 assert.match(src,/method: reuseOfferId \? "PATCH" : "POST"/);
 console.log('PASS: offer rewrites require the exact existing type/title/product/campaign; missing or archived targets never create a replacement');
})().catch(e=>{console.error(e);process.exitCode=1;});
