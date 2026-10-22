// No models, credentials or Notion-specific transport here. IDs are logical card IDs, including smv….
export const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if(Array.isArray(value))return value.map(sort);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,sort(value[k])]));
  return value;
}
export const same = (a,b) => canonical(a)===canonical(b);
export const tombstone = value => ({...value,archived:true});

export function reconcile(local, remote, baseline={}, changedAt={}, now=Date.now(), seed=false) {
  const items={}, conflicts=[];
  for(const key of new Set([...Object.keys(local),...Object.keys(remote),...Object.keys(baseline)])) {
    const l=local[key], r=remote[key], b=baseline[key];
    if(seed) {if(l)items[key]=l;else if(r&&key.startsWith('topic:'))items[key]=tombstone(r.value);continue;}
    if(!b) {if(l&&r&&!same(l,r.value)) {const remoteWins=r.at>(changedAt[key]||0);items[key]=remoteWins?r.value:l;conflicts.push({key,at:now,winner:remoteWins?'notion':'card',other:remoteWins?l:r.value,chosen:items[key],localAt:changedAt[key]||0,notionAt:r.at});}else items[key]=l||r?.value;continue;}
    const lv=l||tombstone(b.value), rv=r?.value||tombstone(b.value);
    const lc=!same(lv,b.value),rc=!same(rv,b.value);
    if(lc&&rc&&!same(lv,rv)) {
      const localAt=changedAt[key]||now,notionAt=r?.at||now,remoteWins=notionAt>localAt;
      items[key]=remoteWins?rv:lv;conflicts.push({key,at:now,winner:remoteWins?'notion':'card',other:remoteWins?lv:rv,chosen:items[key],localAt,notionAt});
    } else items[key]=rc?rv:lv;
  }
  return {items:Object.fromEntries(Object.entries(items).filter(([,v])=>v)),conflicts};
}

export function viewOf(doc) {
  const items=doc.items||{},meta=items.structure||{clusters:[],mainCluster:'',stackgroups:{order:[],map:{}}};
  const topics=Object.entries(items).filter(([k,v])=>k.startsWith('topic:')&&!v.archived).map(([,v])=>v).sort((a,b)=>(a.order||0)-(b.order||0));
  const clusters=[...(meta.clusters||[])];for(const t of topics)if(t.cluster&&!clusters.includes(t.cluster))clusters.push(t.cluster);
  // Main is editable in Notion on topic rows as well as in the card's cluster registry.
  const mains=topics.filter(t=>t.main&&t.cluster).sort((a,b)=>(doc.changedAt?.['topic:'+b.raw.id]||0)-(doc.changedAt?.['topic:'+a.raw.id]||0));
  const mainCluster=mains[0]?.cluster||(meta.mainCluster&&clusters.includes(meta.mainCluster)?meta.mainCluster:'');
  const products=Object.entries(items).filter(([k])=>k.startsWith('product:')).map(([,v])=>v);
  return {staged:topics.filter(t=>t.stage==='staged').map(t=>t.raw),committed:topics.filter(t=>t.stage!=='staged').map(t=>t.raw),
    archived:Object.entries(items).filter(([k,v])=>k.startsWith('topic:')&&v.archived).map(([key,v])=>({key,...v.raw})),
    topicClusters:{clusters,assign:{...meta.orphanAssign,...Object.fromEntries(topics.filter(t=>t.cluster).map(t=>[t.raw.id,t.cluster]))},...(mainCluster||(meta.mainClusterPresent??true)?{mainCluster}:{})},
    mainIds:products.filter(p=>p.mainOffering&&!p.archived).sort((a,b)=>(a.mainOrder||0)-(b.mainOrder||0)).map(p=>p.id),stackgroups:meta.stackgroups||{order:[],map:{}},stackorder:meta.stackorder||{},products};
}

export async function snapshotStructure(io,cid,doc,capture) {
  const at=io.now(),id=at+'-'+io.id(),key='sync:history:'+cid+':'+id;
  const snapshot={id,campaignId:cid,at,doc:doc||null,capture};
  await io.put(key,snapshot);
  if(!same(await io.get(key),snapshot))throw Error('Snapshot readback differs; nothing may be migrated');
  const index=await io.get('sync:history:'+cid)||[];
  await io.put('sync:history:'+cid,[{id,key,at},...index].slice(0,30));
  if(!await io.get('sync:original:'+cid))await io.put('sync:original:'+cid,{id,key,at});
  return snapshot;
}

export async function migrateStructure(io,cid) {
  let doc=await io.get('hub:structure:'+cid);if(doc){if(!doc.verifiedAt)throw Error('Existing structure migration has not passed verification; sync is held');return doc;}
  const capture=await io.capture(cid);
  const snap=await snapshotStructure(io,cid,null,capture);
  const at=io.now();doc={version:1,campaignId:cid,items:capture.items,changedAt:Object.fromEntries(Object.keys(capture.items).map(k=>[k,at])),baseline:{},notionIds:{},migratedAt:at,originalSnapshot:snap.id,seededAt:null};
  if(capture.expectedView&&!same(capture.expectedView,viewOf(doc)))throw Error('Visual structure projection differs after migration');
  await io.put('hub:structure:'+cid,doc);
  if(!same((await io.get('hub:structure:'+cid)).items,capture.items))throw Error('Migrated structure differs from original snapshot');
  // Compare the persisted projection against the independently captured legacy card.
  if(capture.expectedView&&!same(capture.expectedView,viewOf(await io.get('hub:structure:'+cid))))throw Error('Visual structure projection differs after migration');
  doc.verifiedAt=io.now();await io.put('hub:structure:'+cid,doc);
  return doc;
}

export async function captureCardSave(io,cid,touched={}) {
  const before=await migrateStructure(io,cid),capture=await io.capture(cid,before,touched),at=io.now(),items={...capture.items};
  for(const [key,old] of Object.entries(before.items))if(!items[key])items[key]=tombstone(old);
  const changedAt={...before.changedAt};for(const [key,value] of Object.entries(items))if(!same(value,before.items[key]))changedAt[key]=at;
  const next={...before,items,changedAt};await io.put('hub:structure:'+cid,next);return next;
}

export async function syncStructure(io,cid,{dryRun=false}={}) {
  const existing=await io.get('hub:structure:'+cid);
  if(dryRun) {const capture=await io.capture(cid,existing);return {success:true,mode:existing?.seededAt?'merge':'seed',items:Object.keys(capture.items).length,topics:Object.keys(capture.items).filter(k=>k.startsWith('topic:')).length,modelCalls:0,migrated:!!existing};}
  let doc=await migrateStructure(io,cid);
  const capture=await io.capture(cid,doc); // raw legacy keys and current product links are snapshotted before every run
  await snapshotStructure(io,cid,doc,capture);
  try {
    // Legacy/background card helpers may still write the compatible KV keys directly.
    // Capture their differences before merging; Notion edits are read separately below.
    const local={...capture.items},localTimes={...doc.changedAt};
    for(const [key,old] of Object.entries(doc.items))if(!local[key])local[key]=tombstone(old);
    for(const [key,value] of Object.entries(local))if(!same(value,doc.items[key]))localTimes[key]=io.now();
    doc={...doc,items:local,changedAt:localTimes};
    await io.put('hub:structure:'+cid,doc);
    await io.schema();
    const remote=await io.readRemote(cid,doc),seed=!doc.seededAt;
    const merged=reconcile(doc.items,remote,doc.baseline,doc.changedAt,io.now(),seed);
    const changedAt={...doc.changedAt},notionIds={...doc.notionIds};
    for(const [key,value] of Object.entries(merged.items))if(!same(value,doc.items[key]))changedAt[key]=remote[key]?.at||io.now();
    const mainChanges=[];
    for(const [key,value] of Object.entries(merged.items))if(key.startsWith('topic:')&&doc.baseline[key]&&value.main!==doc.baseline[key].value.main){if(value.main&&!value.cluster)throw Error('Main requires a cluster on '+key);mainChanges.push({at:changedAt[key],cluster:value.main?value.cluster:''});}
    if(doc.baseline.structure&&merged.items.structure?.mainCluster!==doc.baseline.structure.value.mainCluster)mainChanges.push({at:changedAt.structure,cluster:merged.items.structure.mainCluster});
    if(mainChanges.length){mainChanges.sort((a,b)=>b.at-a.at||Number(!!b.cluster)-Number(!!a.cluster));const selected=mainChanges[0];merged.items.structure={...merged.items.structure,mainCluster:selected.cluster};changedAt.structure=selected.at;for(const [key,value] of Object.entries(merged.items))if(key.startsWith('topic:')){const main=!!value.cluster&&value.cluster===selected.cluster;if(main!==value.main){merged.items[key]={...value,main};changedAt[key]=selected.at;}}}
    for(const [key,value] of Object.entries(merged.items)) {
      if(!remote[key]||!same(value,remote[key].value))notionIds[key]=await io.writeRemote(cid,key,value,remote[key],doc);
      else if(remote[key].id)notionIds[key]=remote[key].id;
    }
    const next={...doc,items:merged.items,changedAt,notionIds};
    // Verify every mirror before advancing a baseline. Partial failures remain held and retryable.
    const verified=await io.readRemote(cid,next);
    for(const [key,value] of Object.entries(next.items))if(!same(value,verified[key]?.value))throw Error('Notion sync readback differs for '+key);
    if(io.assertCaptureUnchanged)await io.assertCaptureUnchanged(capture);
    await io.project(cid,next);
    next.baseline=Object.fromEntries(Object.entries(next.items).map(([k,value])=>[k,{value,notionAt:verified[k]?.at||io.now(),kvAt:changedAt[k]}]));
    next.seededAt=doc.seededAt||io.now();next.lastSync=io.now();next.error=null;
    const previous=await io.get('sync:conflicts:'+cid)||[];
    await io.put('sync:conflicts:'+cid,[...previous,...merged.conflicts.map(c=>({...c,id:io.id(),resolved:false}))]);
    await io.put('hub:structure:'+cid,next);
    const placement=await io.placement(cid,next);
    const report={success:true,mode:seed?'seed':'merge',at:next.lastSync,items:Object.keys(next.items).length,conflicts:merged.conflicts.length,placement,modelCalls:0};
    await io.put('sync:report:'+cid,report);return report;
  }catch(error) {
    await io.put('sync:report:'+cid,{success:false,error:error.message,at:io.now(),modelCalls:0});
    await io.hold({action:'syncHubStructure',reason:error.message,payload:{campaignId:cid,originalSnapshot:doc.originalSnapshot}});
    throw error;
  }
}

export async function restoreStructure(io,cid,id) {
  const snapshot=await io.get('sync:history:'+cid+':'+id);if(!snapshot||snapshot.campaignId!==cid)throw Error('Snapshot not found for this hub');
  const current=await migrateStructure(io,cid);await snapshotStructure(io,cid,current,await io.capture(cid,current));
  const target=snapshot.capture?.items||snapshot.doc.items,items={...target},changedAt={...current.changedAt};
  for(const [key,value] of Object.entries(current.items))if(!items[key])items[key]=key.startsWith('product:')?{...value,topicId:'',mainOffering:false}:tombstone(value);
  for(const key of Object.keys(items))changedAt[key]=io.now();
  const next={...current,items,changedAt};await io.put('hub:structure:'+cid,next);await io.project(cid,next);
  return {success:true,restored:id,modelCalls:0};
}

export async function resolveStructureConflict(io,cid,id) {
  const conflicts=await io.get('sync:conflicts:'+cid)||[],conflict=conflicts.find(c=>c.id===id&&!c.resolved);if(!conflict)throw Error('Open conflict not found');
  const doc=await migrateStructure(io,cid);doc.items[conflict.key]=conflict.other;doc.changedAt[conflict.key]=io.now();
  await io.put('hub:structure:'+cid,doc);await io.project(cid,doc);conflict.resolved=true;conflict.resolvedAt=io.now();await io.put('sync:conflicts:'+cid,conflicts);
  return {success:true,modelCalls:0};
}
