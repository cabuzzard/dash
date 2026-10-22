import {same,viewOf} from './hub-structure-sync.mjs';
const norm=x=>String(x||'').replace(/-/g,''),text=v=>(v||[]).map(x=>x.plain_text??x.text?.content??'').join('');
const rt=value=>({rich_text:(String(value||'').match(/[\s\S]{1,1900}/g)||[]).map(content=>({type:'text',text:{content}}))});
const title=value=>({title:[{type:'text',text:{content:String(value||'Untitled').slice(0,1900)}}]});
// Notion normalizes these date properties to minute precision; send that precision so readback is exact.
const date=at=>({date:{start:new Date(Math.floor(at/60000)*60000).toISOString()}});
const logical=row=>text(row.properties?.['Topic Key']?.rich_text)||norm(row.id);
const time=row=>Date.parse(row.last_edited_time||'')||0;
const archived=row=>!!(row.archived||row.in_trash||row.properties?.Archived?.checkbox||row.properties?.Status?.select?.name==='Archived');
const parse=value=>{if(!value)return null;try{return JSON.parse(value);}catch{throw Error('Invalid structure JSON in Notion; no sync was applied');}};

export function makeStructureIO(env,deps) {
  const {fetch:request,dbs,hubs,hierarchyModel,hold}=deps;
  const io={now:()=>Date.now(),id:()=>crypto.randomUUID(),get:k=>env.TRADES.get(k,'json'),put:(k,v)=>env.TRADES.put(k,JSON.stringify(v)),hold};
  const hub=cid=>{const h=hubs.find(h=>norm(h.campaignId)===cid);if(!h)throw Error('Unknown content hub');return h;};
  const headers={Authorization:'Bearer '+String(env.NOTION_TOKEN||'').trim(),'Notion-Version':'2022-06-28','Content-Type':'application/json'};
  async function api(path,method='GET',body) {
    for(let i=0;i<4;i++) {
      const response=await request('https://api.notion.com/v1/'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
      const value=await response.json();
      if(response.status===429&&i<3){await new Promise(r=>setTimeout(r,Math.max(1000,Number(response.headers.get('Retry-After')||1)*1000)));continue;}
      if(!response.ok||value.object==='error'||value.name==='APIResponseError')throw Error(value.message||'Notion request failed: '+response.status);
      return value;
    }
  }
  const page=id=>api('pages/'+id);
  async function query(db,body) {
    const out=[];let cursor;
    do{const data=await api('databases/'+db+'/query','POST',{...body,page_size:100,...(cursor?{start_cursor:cursor}:{})});if(!Array.isArray(data.results))throw Error('Notion query returned no results array');out.push(...data.results);cursor=data.has_more?data.next_cursor:null;}while(cursor);
    return out;
  }
  async function patch(id,properties) {
    await api('pages/'+id,'PATCH',{properties});const read=await page(id);
    for(const [name,value] of Object.entries(properties)) {
      const got=read.properties?.[name];
      let matches=true;
      if(value.rich_text)matches=text(value.rich_text)===text(got?.rich_text);
      else if(value.title)matches=text(value.title)===text(got?.title);
      else if('checkbox'in value)matches=value.checkbox===got?.checkbox;
      else if('select'in value)matches=(value.select?.name||null)===(got?.select?.name||null);
      else if(value.relation)matches=same(value.relation.map(x=>norm(x.id)).sort(),(got?.relation||[]).map(x=>norm(x.id)).sort());
      else if(value.multi_select)matches=same(value.multi_select.map(x=>x.name).sort(),(got?.multi_select||[]).map(x=>x.name).sort());
      else if(value.date)matches=Date.parse(value.date.start)===Date.parse(got?.date?.start);
      if(!matches)throw Error('Notion readback differs: '+name+' on '+id);
    }
    return read;
  }
  const campaignFilter=cid=>({property:'Campaign',relation:{contains:cid}});
  const productFilter=cid=>({property:'Campaigns',relation:{contains:cid}});
  async function topics(cid){return query(dbs.topics,{filter:campaignFilter(cid)});}
  async function products(cid){return query(dbs.products,{filter:productFilter(cid)});}
  const intent=row=>deps.intentFromLabel?.[row.properties?.['Search Intent']?.select?.name]||'';
  function topicValue(row,old,order=0,cid) {
    const p=row.properties||{},data=parse(text(p['Card Data']?.rich_text))||{},key=logical(row),savedOrder=data.__order,savedStage=data.__stage;
    delete data.__order;delete data.__stage;
    const raw={...(old?.raw||{}),...data,id:key};
    for(const [k,v] of Object.entries({name:text(p.Name?.title),keywords:text(p['Cluster Keywords']?.rich_text),rationale:text(p.Rationale?.rich_text),searchIntent:intent(row)}))if(v!==''||Object.hasOwn(raw,k))raw[k]=v;
    return {raw,stage:p.Status?.select?.name==='Staged'?'staged':p.Status?.select?.name==='Archived'?(savedStage||old?.stage||'committed'):'committed',cluster:text(p['Hub Cluster']?.rich_text),main:!!p.Main?.checkbox,archived:archived(row)||!!cid&&!(p.Campaign?.relation||[]).some(r=>norm(r.id)===cid),order:savedOrder??old?.order??order};
  }
  function productValue(row,cid,old) {
    return {id:norm(row.id),topicId:text(row.properties?.['Topic ID']?.rich_text),mainOffering:(row.properties?.['Hub Main Offerings']?.multi_select||[]).some(x=>x.name===hub(cid).slug),mainOrder:old?.mainOrder||0,archived:archived(row)||!(row.properties?.Campaigns?.relation||[]).some(x=>norm(x.id)===cid)};
  }
  io.capture=async(cid,doc,touched={})=>{
    const prefixes=['seoclusters:staged:','seoclusters:commproducts:','seotopicclusters:','hub:mainproduct:','stackgroups:','stackorder:'];
    const rawKv=Object.fromEntries(await Promise.all(prefixes.map(async p=>[p+cid,await env.TRADES.get(p+cid)])));
    const get=(p,fallback)=>rawKv[p+cid]==null?fallback:JSON.parse(rawKv[p+cid]);
    const staged=get('seoclusters:staged:',[]),tc=get('seotopicclusters:',{clusters:[],assign:{}}),mains=get('hub:mainproduct:',[]),groups=get('stackgroups:',{order:[],map:{}}),commProducts=get('seoclusters:commproducts:',{});
    const [rows,prods]=await Promise.all([topics(cid),products(cid)]),items={},now=io.now();
    const active=new Map(rows.filter(r=>r.properties?.Status?.select?.name==='Active').map(r=>[logical(r),r]));
    const committed=doc?Object.entries(doc.items).filter(([k,v])=>k.startsWith('topic:')&&v.stage==='committed'&&!v.archived).map(([,v])=>v.raw):[...active.values()].map(r=>({id:logical(r),name:text(r.properties.Name?.title),keywords:text(r.properties['Cluster Keywords']?.rich_text),rationale:text(r.properties.Rationale?.rich_text),searchIntent:intent(r),url:r.url,products:commProducts[logical(r)]||[]}));
    const changedTopics=new Set((touched.topicIds||[]).map(norm));
    for(const [order,raw0] of [...committed,...staged].entries()) {
      const key='topic:'+raw0.id,old=doc?.items[key],row=active.get(raw0.id)||rows.find(r=>norm(r.id)===raw0.id);
      let raw={...raw0};
      if(row&&changedTopics.has(norm(raw0.id)))raw={...raw,name:text(row.properties.Name?.title),keywords:text(row.properties['Cluster Keywords']?.rich_text),rationale:text(row.properties.Rationale?.rich_text),searchIntent:intent(row)};
      if(old?.stage==='committed'&&changedTopics.has(norm(raw0.id))&&Object.hasOwn(commProducts,raw0.id))raw.products=commProducts[raw0.id];
      const cluster=tc.assign?.[raw.id]||'';
      items[key]={raw,stage:staged.some(t=>t.id===raw.id)?'staged':'committed',cluster,main:!!cluster&&cluster===tc.mainCluster,archived:false,order};
      if(old?.archived&&!changedTopics.has(norm(raw.id))&&!staged.some(t=>t.id===raw.id))items[key]=old;
    }
    if(doc)for(const [key,value] of Object.entries(doc.items))if(key.startsWith('topic:')&&value.archived&&!items[key])items[key]=value;
    const mainIds=Array.isArray(mains)?mains:typeof mains==='string'?[mains]:[];
    const changedProducts=new Set((touched.productIds||[]).map(norm));
    for(const row of prods){const id=norm(row.id),key='product:'+id,old=doc?.items[key],from=productValue(row,cid,old);items[key]={...(old||from),...(changedProducts.has(id)?{topicId:from.topicId,archived:from.archived}:{}),mainOffering:mainIds.includes(id),mainOrder:Math.max(0,mainIds.indexOf(id))};}
    if(doc)for(const [key,value] of Object.entries(doc.items))if(key.startsWith('product:')&&!items[key])items[key]=value;
    items.structure={clusters:tc.clusters||[],mainCluster:tc.mainCluster||'',mainClusterPresent:Object.hasOwn(tc,'mainCluster'),stackgroups:groups,stackorder:get('stackorder:',{}),commProducts:{...commProducts,...Object.fromEntries(committed.map(t=>[t.id,commProducts[t.id]||t.products||[]]))},orphanAssign:Object.fromEntries(Object.entries(tc.assign||{}).filter(([id])=>!items['topic:'+id])),topicClusterExtras:Object.fromEntries(Object.entries(tc).filter(([k])=>!['clusters','assign','mainCluster'].includes(k)))};
    const expectedView={staged,committed,archived:[],topicClusters:{clusters:tc.clusters||[],assign:tc.assign||{},...(Object.hasOwn(tc,'mainCluster')?{mainCluster:tc.mainCluster||''}:{})},mainIds,stackgroups:groups,stackorder:get('stackorder:',{}),products:Object.entries(items).filter(([k])=>k.startsWith('product:')).map(([,v])=>v)};
    return {rawKv,items,...(!doc?{expectedView}:{}),productTopicIds:Object.fromEntries(prods.map(r=>[norm(r.id),text(r.properties?.['Topic ID']?.rich_text)])),capturedAt:now};
  };
  io.assertCaptureUnchanged=async capture=>{
    for(const [key,value] of Object.entries(capture.rawKv||{}))if(await env.TRADES.get(key)!==value)throw Error('Card structure changed during sync; retained for retry: '+key);
  };
  async function ensure(db,definitions) {
    const schema=await api('databases/'+db),add={};
    for(const [name,definition] of Object.entries(definitions)) {
      const old=schema.properties?.[name],type=Object.keys(definition)[0];
      if(!old)add[name]=definition;
      else if(old.type!==type)throw Error('Existing schema type differs for '+name+'; schema was not overwritten');
      else if(type==='select'){
        const missing=definition.select.options.filter(x=>!old.select.options.some(o=>o.name===x.name));
        if(missing.length)add[name]={select:{options:[...old.select.options,...missing]}};
      }
    }
    if(Object.keys(add).length){await api('databases/'+db,'PATCH',{properties:add});const read=await api('databases/'+db);for(const [k,v] of Object.entries(add))if(read.properties?.[k]?.type!==Object.keys(v)[0])throw Error('Schema readback failed for '+k);}
  }
  io.schema=async()=>{
    await ensure(dbs.topics,{'Topic Key':{rich_text:{}},'Hub Cluster':{rich_text:{}},Main:{checkbox:{}},'Card Data':{rich_text:{}},'Synced At':{date:{}},'Search Intent':{select:{options:Object.values(deps.intentLabels||{}).map(name=>({name}))}},Status:{select:{options:[{name:'Active'},{name:'Staged'},{name:'Archived'}]}}});
    await ensure(dbs.products,{'Hub Main Offerings':{multi_select:{}},'Synced At':{date:{}},'Topic ID':{rich_text:{}}});
    for(const db of [dbs.products,dbs.titles,dbs.assets])await ensure(db,{'Hub Placement':{rich_text:{}},'Placed In Hub':{checkbox:{}}});
    const campaign=await page(hubs[0].campaignId),parent=campaign.parent.database_id;
    if(!parent)throw Error('Campaign database could not be resolved');
    await ensure(parent,{'Hub Keyword Structure':{rich_text:{}},'Structure Synced At':{date:{}}});
  };
  io.readRemote=async(cid,doc)=>{
    const [rows,prods,campaign]=await Promise.all([topics(cid),products(cid),page(cid)]),remote={};
    const structure=parse(text(campaign.properties?.['Hub Keyword Structure']?.rich_text));
    if(structure)remote.structure={id:cid,value:structure,at:time(campaign)};
    for(const [i,row] of rows.entries()) {const key='topic:'+logical(row),known=Object.keys(doc.notionIds||{}).find(k=>k.startsWith('topic:')&&norm(doc.notionIds[k])===norm(row.id));if(known&&known!==key)throw Error('Stable Topic Key changed in Notion; restore its original value before syncing');if(remote[key])throw Error('Duplicate Topic Key '+logical(row)+'; nothing was merged');remote[key]={id:row.id,value:topicValue(row,doc.items[key],i,cid),at:time(row)};}
    for(const row of prods){const key='product:'+norm(row.id);remote[key]={id:row.id,value:productValue(row,cid,doc.items[key]),at:time(row)};}
    for(const [key,baseline] of Object.entries(doc.baseline||{}))if(key.startsWith('topic:')&&!remote[key]) {
      const id=doc.notionIds[key];if(!id)throw Error('Missing Notion identity for '+key);
      let row;try{row=await page(id);}catch(error){if(!/not find|not_found|404/i.test(error.message))throw error;}
      if(row&&!archived(row)&&(row.properties?.Campaign?.relation||[]).some(x=>norm(x.id)===cid))throw Error('Topic query omitted an active row; refusing an apparent delete');
      remote[key]={id,value:row?topicValue(row,baseline.value,baseline.value.order,cid):{...baseline.value,archived:true},at:row?time(row):io.now()};
    }
    for(const [key,baseline] of Object.entries(doc.baseline||{}))if(key.startsWith('product:')&&!remote[key]) {
      let row;try{row=await page(baseline.value.id);}catch(error){if(!/not find|not_found|404/i.test(error.message))throw error;}
      if(row&&!archived(row)&&(row.properties?.Campaigns?.relation||[]).some(x=>norm(x.id)===cid))throw Error('Product query omitted an active row; refusing an apparent delete');
      remote[key]={id:baseline.value.id,value:row?productValue(row,cid,baseline.value):{...baseline.value,archived:true},at:row?time(row):io.now()};
    }
    return remote;
  };
  io.writeRemote=async(cid,key,value,remote,doc)=>{
    const at=io.now();
    if(key==='structure'){const current=parse(text((await page(cid)).properties?.['Hub Keyword Structure']?.rich_text));if(!same(current,remote?.value||null))throw Error('Cluster structure changed in Notion during sync; retained for retry');await patch(cid,{'Hub Keyword Structure':rt(JSON.stringify(value)),'Structure Synced At':date(at)});return cid;}
    if(key.startsWith('product:')) {
      const row=await page(value.id),other=(row.properties?.['Hub Main Offerings']?.multi_select||[]).map(x=>x.name).filter(x=>x!==hub(cid).slug);
      if(remote&&!same(productValue(row,cid,doc.items[key]),remote.value))throw Error('Product changed in Notion during sync; retained for retry: '+value.id);
      const names=value.mainOffering?[...other,hub(cid).slug]:other;
      await patch(value.id,{'Topic ID':rt(value.topicId),'Hub Main Offerings':{multi_select:names.map(name=>({name}))},'Synced At':date(at)});return value.id;
    }
    const raw=value.raw,metadata={...raw,__order:value.order,__stage:value.stage};
    const props={Name:title(raw.name),'Topic Key':rt(raw.id),'Cluster Keywords':rt(raw.keywords),Rationale:rt(raw.rationale),'Hub Cluster':rt(value.cluster),Main:{checkbox:!!value.main},'Card Data':rt(JSON.stringify(metadata)),'Synced At':date(at),Status:{select:{name:value.archived?'Archived':value.stage==='staged'?'Staged':'Active'}}};
    const label=deps.intentLabels?.[raw.searchIntent];props['Search Intent']=label?{select:{name:label}}:{select:null};
    let id=remote?.id||doc.notionIds[key];
    if(id){const current=await page(id);if(remote&&!same(topicValue(current,doc.items[key],remote.value.order,cid),remote.value))throw Error('Topic changed in Notion during sync; retained for retry: '+raw.id);if((current.archived||current.in_trash)&&!value.archived)await api('pages/'+id,'PATCH',{archived:false});if(!(current.properties?.Campaign?.relation||[]).some(r=>norm(r.id)===cid))props.Campaign={relation:[...(current.properties?.Campaign?.relation||[]).map(r=>({id:r.id})),{id:cid}]};await patch(id,props);}
    else {const created=await api('pages','POST',{parent:{database_id:dbs.topics},properties:{...props,Campaign:{relation:[{id:cid}]}}});id=created.id;if(!id)throw Error('Notion topic creation returned no ID');const read=await page(id);if(logical(read)!==raw.id)throw Error('Created Topic Key readback differs');}
    return id;
  };
  io.project=async(cid,doc)=>{
    const view=viewOf(doc),old=await io.get('seotopicclusters:'+cid)||{};
    const entries={'seoclusters:staged:':view.staged,'seoclusters:committed:':view.committed,'seotopicclusters:':{...Object.fromEntries(Object.entries(old).filter(([k])=>!['clusters','assign','mainCluster'].includes(k))),...doc.items.structure.topicClusterExtras,...view.topicClusters},'hub:mainproduct:':view.mainIds,'stackgroups:':view.stackgroups,'stackorder:':view.stackorder,'seoclusters:commproducts:':{...doc.items.structure.commProducts,...Object.fromEntries(view.committed.map(t=>[t.id,t.products||[]]))}};
    for(const [prefix,value] of Object.entries(entries)){await io.put(prefix+cid,value);if(!same(await io.get(prefix+cid),value))throw Error('KV projection readback differs for '+prefix);}
  };
  io.placement=async(cid,doc)=>{
    const h=hub(cid),view=viewOf(doc),[prods,ownedTitles,ownedAssets,legacyTitles,legacyAssets]=await Promise.all([products(cid),query(dbs.titles,{filter:campaignFilter(cid)}),query(dbs.assets,{filter:campaignFilter(cid)}),query(dbs.titles,{filter:{property:'Campaign',relation:{is_empty:true}}}),query(dbs.assets,{filter:{property:'Campaign',relation:{is_empty:true}}})]);
    const productIds=new Set(prods.map(p=>norm(p.id))),titles=[...new Map([...ownedTitles,...legacyTitles.filter(t=>(t.properties?.product?.relation||t.properties?.Product?.relation||[]).some(r=>productIds.has(norm(r.id))))].map(t=>[norm(t.id),t])).values()];
    const titleIds=new Set(titles.map(t=>norm(t.id))),assets=[...new Map([...ownedAssets,...legacyAssets.filter(a=>(a.properties?.['Content Strategy']?.relation||[]).some(r=>titleIds.has(norm(r.id))))].map(a=>[norm(a.id),a])).values()];
    const model=hierarchyModel({topics:[...view.staged,...view.committed],tc:view.topicClusters,products:prods.filter(p=>!archived(p)).map(p=>({id:p.id,topicId:text(p.properties?.['Topic ID']?.rich_text)})),mainIds:view.mainIds,titles});
    const current=[];
    for(const [kind,rows] of [['product',prods],['title',titles],['asset',assets]])for(const row of rows) {
      const placed=!archived(row)&&(kind==='product'?model.productIds.has(norm(row.id)):model[kind](row.properties||{}));
      current.push({id:norm(row.id),kind,row,placed});
    }
    const previous=await io.get('sync:placement-index:'+cid)||[],known=new Set(current.map(x=>x.id));
    const tasks=[...current,...previous.filter(x=>!known.has(x.id)).map(x=>({...x,placed:false}))].sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id));
    const bytes=new TextEncoder().encode(JSON.stringify(tasks.map(x=>[x.kind,x.id,x.placed]))),signature=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const progress=await io.get('sync:placement-progress:'+cid),start=progress?.signature===signature?progress.next||0:0,end=Math.min(tasks.length,start+60);
    let changed=0;
    for(const task of tasks.slice(start,end)) {
      const key='sync:placement:'+task.id,all=await io.get(key)||{};all[cid]={hub:h.slug,placed:task.placed};await io.put(key,all);
      let row=task.row;try{row||=await page(task.id);}catch(error){if(/not find|not_found|404/i.test(error.message))continue;throw error;}
      const entries=Object.values(all),any=entries.some(x=>x.placed),summary=entries.filter(x=>x.placed).map(x=>x.hub).sort().join('; ');
      if(!row.archived&&!row.in_trash&&(row.properties?.['Placed In Hub']?.checkbox!==any||text(row.properties?.['Hub Placement']?.rich_text)!==summary)){await patch(row.id,{'Placed In Hub':{checkbox:any},'Hub Placement':rt(summary)});changed++;}
    }
    const pending=tasks.length-end;
    await io.put('sync:placement-progress:'+cid,{signature,next:pending?end:0,at:io.now(),pending});
    if(pending)await io.put('sync:queue:'+cid,{at:io.now(),source:'placement'});
    else await io.put('sync:placement-index:'+cid,current.map(({id,kind})=>({id,kind})));
    return {changed,checked:end-start,pending,total:tasks.length};
  };
  io.page=page;io.patch=patch;io.topicValue=topicValue;return io;
}
