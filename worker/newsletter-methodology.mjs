// Helpers for the existing digest flow. Current Methods remains the contract authority.
export const NEWSLETTER_FIELDS = ['Subscriber Benefit','Value Proposition','Research Focus','Research Depth'];
export const NEWSLETTER_DEPTHS = ['Deep','Standard','Free','Off'];   // Free = free news sources only, no research calls (2026-10-23)
export const newsletterIssueType = type => /^newsletter (paid|free)$/i.test(String(type||''));
export function newsletterDepth(value) {
  if(!value)return 'Deep';
  if(!NEWSLETTER_DEPTHS.includes(value))throw new Error('Research Depth must be Deep, Standard, Free or Off');
  return value;
}
export function newsletterSetting(field,value) {
  if(!NEWSLETTER_FIELDS.includes(field))throw new Error('Newsletter field is not allowed');
  if(typeof value!=='string'||value.length>12000)throw new Error('Newsletter values must be text up to 12000 characters');
  return field==='Research Depth'?newsletterDepth(value):value;
}
export function newsletterSteering(fields={}) {
  return ['Subscriber Benefit','Value Proposition','Research Focus','Customer'].filter(k=>fields[k]).map(k=>k+': '+String(fields[k]).slice(0,k==='Research Focus'?2400:1200)).join('\n');
}
export function newsletterSchema(contract) {
  const keys=contract.map((f,i)=>(f.name.replace(/[^a-zA-Z0-9_.-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,56)||'field')+'_'+i);
  return {keys,schema:{type:'object',properties:Object.fromEntries(contract.map((f,i)=>[keys[i],{type:'string',description:f.name+' — '+f.rule}])),required:keys,additionalProperties:false}};
}
export function newsletterBody(contract,fields) {
  return contract.filter(f=>!['Platform Title','Preview Text','Body'].includes(f.name)&&String(fields[f.name]||'').trim()).map(f=>'## '+f.name+'\n\n'+fields[f.name].trim()).join('\n\n');
}
export function newsletterInPeriod(date,start,end) {
  if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(String(date||'')))return false;
  const day=String(date).slice(0,10),parsed=Date.parse(day+'T00:00:00Z');
  return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===day&&day>=start&&day<=end;
}
export function newsletterPublicUrl(value) {
  try{
    const u=new URL(value),h=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!h.includes('.')||h.endsWith('.localhost')||h.endsWith('.local')||h==='localhost'||h.includes(':'))return null;
    if(/^\d+\.\d+\.\d+\.\d+$/.test(h)){
      const p=h.split('.').map(Number);
      if(p.some(x=>x>255)||[0,10,127].includes(p[0])||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]===100&&p[1]>=64&&p[1]<=127)return null;
    }
    u.hash='';return u.href;
  }catch{return null;}
}
export async function newsletterVerifyUrl(env,url,fetcher=fetch) {
  const normalized=newsletterPublicUrl(url);
  if(!normalized)return {verified:false,httpStatus:null,verificationReason:'Invalid or non-public source URL'};
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const key='digest:urlcheck:'+hash,cached=await env.TRADES.get(key,'json');if(cached)return cached;
  let current=normalized,result;const signal=AbortSignal.timeout(5000);
  try{
    for(let i=0;i<5;i++){
      const response=await fetcher(current,{method:'GET',redirect:'manual',signal,headers:{'User-Agent':'DashNewsletterSourceCheck/1.0'}});
      await response.body?.cancel().catch(()=>{});
      if([301,302,303,307,308].includes(response.status)){
        const location=response.headers.get('location'),next=location&&newsletterPublicUrl(new URL(location,current).href);
        if(!next)throw new Error('Redirect target is not a public URL');current=next;continue;
      }
      result={verified:response.ok,httpStatus:response.status,verifiedAt:new Date().toISOString(),verificationReason:response.ok?'':'Source returned HTTP '+response.status};break;
    }
    if(!result)throw new Error('Too many source redirects');
  }catch(error){result={verified:false,httpStatus:null,verifiedAt:new Date().toISOString(),verificationReason:error.name==='TimeoutError'?'Source check timed out':String(error.message).slice(0,160)};}
  await env.TRADES.put(key,JSON.stringify(result),{expirationTtl:7*86400});return result;
}
