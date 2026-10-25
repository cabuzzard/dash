import {makeStructureIO} from './hub-structure-adapter.mjs';
import {migrateStructure,captureCardSave,syncStructure,restoreStructure,resolveStructureConflict,viewOf} from './hub-structure-sync.mjs';
const norm=x=>String(x||'').replace(/-/g,'');
export function structureHeldPayload(value) {
 if(Array.isArray(value))return value.map(structureHeldPayload);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/(token|secret|password|^code$)/i.test(k)).map(([k,v])=>[k,structureHeldPayload(v)]));
 return value;
}
const CARD_ACTIONS=new Set(['saveTopicClusters','generateTopicClusters','updateStagedKeywordCluster','removeStagedKeywordCluster','commitKeywordCluster','archiveKeywordCluster','setClusterSearchIntent','regenerateKeywordCluster','generateKeywordClusters','generateSingleKeywordCluster','attachProductToTopic','createProduct','archiveProduct','setHubMainOffering','setProductStack','renameProductStack','updateAllOutputField','saveStackOrder','generateClusterProductStacks','removeClusterProductStack','kwHubClearTopics','kwHubApply','kwHubUndo','categorizeUntopicedProducts','moveProductToCampaign']);
export function isStructureCardAction(body) {
 if(body.action==='kwSendKeywords')return body.mode==='cluster';
 if(body.action==='updateAllOutputField')return ['group','productStack'].includes(body.field);
 return CARD_ACTIONS.has(body.action);
}
export function structureRuntime(env,deps) {
 const io=makeStructureIO(env,deps),hubs=deps.hubs;
 // operator 2026-10-25: a short lease the holder keeps renewing (a dead request frees the hub in ~90s, not 15 min), and an edit that
 // finds the hub busy waits its turn (up to options.wait ms) instead of failing at once.
 const LEASE_MS=90000,RENEW_MS=30000;
 async function lock(cid,operation,options={}) {
  if(!env.KWDB)throw Error('Structure serialization requires the existing KWDB binding');
  await env.KWDB.prepare('CREATE TABLE IF NOT EXISTS hub_structure_leases (campaign TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL)').run();
  const owner=crypto.randomUUID(),until=Date.now()+(options.wait||0);
  for(;;){
   const now=Date.now(),result=await env.KWDB.prepare('INSERT INTO hub_structure_leases(campaign,owner,expires) VALUES(?,?,?) ON CONFLICT(campaign) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE hub_structure_leases.expires < ?').bind(cid,owner,now+LEASE_MS,now).run();
   if(result.meta?.changes)break;
   if(Date.now()+2000>until){const error=Error('Hub structure sync is in progress; your change was not written. Retry shortly.');error.busy=true;throw error;}
   await new Promise(r=>setTimeout(r,2000));
  }
  const renew=setInterval(()=>{env.KWDB.prepare('UPDATE hub_structure_leases SET expires=? WHERE campaign=? AND owner=?').bind(Date.now()+LEASE_MS,cid,owner).run().catch(()=>{});},RENEW_MS);
  try{return await operation();}finally{clearInterval(renew);await env.KWDB.prepare('UPDATE hub_structure_leases SET expires=0, owner=? WHERE campaign=? AND owner=?').bind('',cid,owner).run();}
 }
 const lockWait=(cid,operation)=>lock(cid,operation,{wait:30000});   // card edits wait their turn
 const known=cid=>hubs.some(h=>norm(h.campaignId)===cid);
 async function campaignFor(body) {
  const explicit=norm(body.campaignId||body.campId);if(known(explicit))return explicit;
  const id=norm(body.productId||body.clusterId);if(!id)return '';
  if(/^[a-f0-9]{32}$/i.test(id)) {
   const page=await io.page(id),p=page.properties||{};
   const relations=p.Campaigns?.relation||p.Campaign?.relation||[];
   const found=relations.map(x=>norm(x.id)).find(known);if(found)return found;
  }
  for(const h of hubs){const cid=norm(h.campaignId),doc=await io.get('hub:structure:'+cid);if(doc?.items['topic:'+id])return cid;const staged=await io.get('seoclusters:staged:'+cid)||[];if(staged.some(t=>t.id===id))return cid;}
  return '';
 }
 async function enqueue(cid) {await io.put('sync:queue:'+cid,{at:io.now()});}
 async function sync(cid,options={}) {return lock(cid,async()=>{const queued=await io.get('sync:queue:'+cid),result=await syncStructure(io,cid,options);if(!options.dryRun&&!result.pending&&!result.placement?.pending&&queued){const latest=await io.get('sync:queue:'+cid);if(latest?.at===queued.at)await io.put('sync:queue:'+cid,{...latest,doneAt:io.now()});}return result;});}
 async function boundary(request,ctx,operation) {
  if(request.method!=='POST'||!request.headers.get('Content-Type')?.includes('json'))return operation(request);
  let body;try{body=await request.clone().json();}catch{return operation(request);}
  if(!isStructureCardAction(body))return operation(request);
  if(!await deps.authorized(body))return operation(request);
  // Long legacy actions are forwarded to SELF by the existing handler; only their actual inner execution is observed.
  if(!body.__inner&&/^(generate|regenerate)/.test(body.action))return operation(request);
  const cid=await campaignFor(body);if(!cid)return operation(request);
  const response=await lockWait(cid,async()=>{
   let doc=await migrateStructure(io,cid),response;
   const topicId=norm(body.clusterId),key='topic:'+topicId;
   if(doc.items[key]&&['commitKeywordCluster','removeStagedKeywordCluster','archiveKeywordCluster'].includes(body.action)) {
    const value=doc.items[key];doc.items[key]={...value,...(body.action==='commitKeywordCluster'?{stage:'committed'}:{archived:true})};doc.changedAt[key]=io.now();
    await io.put('hub:structure:'+cid,doc);await io.project(cid,doc);
    response=deps.response({success:true,id:topicId,staged:viewOf(doc).staged});
   } else {
    let actual=request;
    if(topicId&&doc.notionIds[key]&&body.action==='setClusterSearchIntent')actual=new Request(request,{body:JSON.stringify({...body,clusterId:norm(doc.notionIds[key])})});
    response=await operation(actual);
    let result;try{result=await response.clone().json();}catch{}
    // A streamed inner response may still be generating. These actions return their actual JSON only after completion.
    if(response.ok&&!result?.error){const newProduct=body.productId||result?.productId||(body.action==='createProduct'?result?.id:'');doc=await captureCardSave(io,cid,{topicIds:[...(topicId?[topicId]:[]),...(result?.structureTouched?.topicIds||[])],productIds:[...(newProduct?[norm(newProduct)]:[]),...(result?.structureTouched?.productIds||[])]});if(result&&(result.staged||result.committed)){const view=viewOf(doc);response=deps.response({...result,staged:view.staged,committed:view.committed});}}
   }
   if(response.ok)await enqueue(cid);
   return response;
  }).catch(async error=>{await io.hold({action:body.action,reason:error.message,payload:structureHeldPayload(body)});throw error;});
  // Successful card edits stay queued for the nightly structure sync. Avoid
  // starting a sync in the same request path that just saved the edit.
  return response;
 }
 async function action(body) {
  const cid=norm(body.campaignId);if(!known(cid))throw Error('Known content hub campaignId required');
  if(body.action==='getHubStructureSync') {
   const [doc,report,conflicts,history,original]=await Promise.all(['hub:structure:','sync:report:','sync:conflicts:','sync:history:','sync:original:'].map(p=>io.get(p+cid)));
   return {success:true,migrated:!!doc,seeded:!!doc?.seededAt,lastSync:doc?.lastSync||null,pending:!!doc&&Object.values(doc.changedAt||{}).some(at=>at>(doc.lastSync||0)),report,conflicts:(conflicts||[]).filter(c=>!c.resolved),history:history||[],original,modelCalls:0};
  }
  if(body.action==='syncHubStructure')return sync(cid,{dryRun:!!body.dryRun});
  if(body.action==='migrateHubStructure')return lock(cid,async()=>{const doc=await migrateStructure(io,cid);return {success:true,campaignId:cid,originalSnapshot:doc.originalSnapshot,view:viewOf(doc),items:Object.keys(doc.items).length,seeded:!!doc.seededAt,modelCalls:0};});
  return lock(cid,async()=>{
   if(body.action==='restoreHubStructure'){await restoreStructure(io,cid,body.snapshotId);return syncStructure(io,cid);}
   if(body.action==='resolveHubStructureConflict'){await resolveStructureConflict(io,cid,body.conflictId);return syncStructure(io,cid);}
   if(body.action==='restoreHubStructureTopic'){const doc=await migrateStructure(io,cid),key='topic:'+body.topicId;if(!doc.items[key])throw Error('Archived topic not found');doc.items[key]={...doc.items[key],archived:false};doc.changedAt[key]=io.now();await io.put('hub:structure:'+cid,doc);await io.project(cid,doc);return syncStructure(io,cid);}
   throw Error('Unknown structure action');
  });
 }
 async function enable() {
  for(const h of hubs){const cid=norm(h.campaignId),doc=await io.get('hub:structure:'+cid),progress=await io.get('sync:placement-progress:'+cid),report=await io.get('sync:report:'+cid);if(!doc?.originalSnapshot||!doc.verifiedAt||!doc.seededAt||!progress||progress.pending!==0||!report?.success)throw Error('Migrate, verify, seed and finish placement for every hub before enabling automatic two-way sync');}
  await io.put('sync:enabled:v1',{at:io.now(),hubs:hubs.length});return {success:true,hubs:hubs.length,modelCalls:0};
 }
 return {io,lock,boundary,action,enable,sync,enqueue};
}
