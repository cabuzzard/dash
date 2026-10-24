// Pure weekly knowledge-base rules. No model calls, credentials or Notion access.
export const MARKET_FORMS = ['Checklist','Cheat sheet','Swipe file','Canva template','Notion template','Workbook','Tracker / log','Guided journal','Challenge pack'];
export function memoryUrl(value) {
  try { const u=new URL(value);if(!['http:','https:'].includes(u.protocol))return '';u.hash='';for(const k of [...u.searchParams.keys()])if(/^(utm_|fbclid|gclid)/i.test(k))u.searchParams.delete(k);return u.href.replace(/\/$/,''); }catch{return '';}
}
export const memoryClaim = value => String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function memoryKey(item) {return memoryUrl(item.url)+'|'+memoryClaim(item.claim);}
export function memoryPlan(memory,findings,runId) {
  const items=memory?.items||[],existing=new Map(items.map(x=>[memoryKey(x),x])),seen=new Set(),accepted=[],confirmed=[],changed=[],invalid=[];
  for(const item of findings||[]) {
    const key=memoryKey(item);if(!memoryUrl(item.url)||!memoryClaim(item.claim)){invalid.push(item);continue;}if(seen.has(key))continue;seen.add(key);
    const prior=existing.get(key);if(prior){confirmed.push({...prior,lastConfirmedRun:runId});continue;}
    // A different claim on the same page is not automatically a contradiction.
    const reference=String(item.changes||item.contradicts||'');
    const previous=reference&&items.find(x=>x.id===reference||memoryUrl(x.url)===memoryUrl(reference));
    const next={...item,url:memoryUrl(item.url),claim:String(item.claim).trim(),topicId:String(item.topicId||''),firstSeenRun:runId,lastConfirmedRun:runId};
    if(previous){next.supersedes=previous.id;next.relationship=item.contradicts?'contradicts':'changes';changed.push(next);}else accepted.push(next);
  }
  const total=accepted.length+confirmed.length+changed.length;
  return {new:accepted,confirmed,changed,invalid,counts:{new:accepted.length,confirmed:confirmed.length,changed:changed.length,total,shareNew:total?(accepted.length+changed.length)/total:0}};
}
export function marketFresh(note,now=Date.now()) {return note.status==='Current'&&!note.contradicted&&Number.isFinite(Date.parse(note.staleAfter))&&Date.parse(note.staleAfter)>now;}
export function marketGaps(topics,notes,now=Date.now()) {
  return topics.map(topic=>({...topic,forms:MARKET_FORMS.filter(form=>!notes.some(n=>n.topicId===topic.id&&n.form.toLowerCase()===form.toLowerCase()&&marketFresh(n,now)))})).filter(t=>t.forms.length);
}
export function marketStaleAfter(date,trend) {const d=new Date(date);d.setUTCDate(d.getUTCDate()+(trend==='Rising'?21:45));return d.toISOString().slice(0,10);}
export function weeklySlot(period,index,total) {const elapsed=period.hour>=20?(period.hour-20)*60+(period.minute||0):(period.hour+4)*60+(period.minute||0);return period.open&&elapsed>=Math.floor(index*540/Math.max(1,total));}
