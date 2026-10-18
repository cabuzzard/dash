export const columns = [
 ['priority','Priority','number'],['hub','Content Hub','relation'],['funnel','Primary Revenue Funnel','text'],['initiatives','Top Revenue Initiatives','multiline'],['acquisition','Content & Acquisition Strategy','multiline'],
 ...['Cold Outreach','Google Search Ads','Meta Ads','YouTube','SEO'].map((name,i)=>['channel'+i,name,'select',['High','Medium','Low','None']]),
 ['primary','Primary Acquisition Channel','text'],['price','Target Offer Price','text'],['status','Status','select',['Backlog','Planned','Testing','Active','Paused']],['notes','Notes','multiline']
].map(([id,name,type,options])=>({id,name,type,...(options?{options}:{})}));
const seeds = [
 ['owners-rep',1,'Construction owner → paid project assessment → consulting engagement','Fixed-price project assessments ($1,500–$3,000); ongoing owner’s representation','Prospect research from construction permits, property transactions, developers and contractors. Personalized cold email. LinkedIn case studies. Google Search Ads for owner’s representation.','High','Medium','None','Medium','Medium','Targeted outbound prospecting','$1,500–$3,000'],
 ['ai-implementation',2,'Business prospect → live demonstration → setup fee and recurring support','AI receptionist installations; missed-call recovery; automated lead follow-up','Research businesses with weak intake systems. Personalized outreach and audits. YouTube demonstrations. Retargeting after traffic develops.','High','Medium','Medium','High','Medium','Cold outreach and live demos','$500–$1,500 setup plus recurring support'],
 ['home-services',3,'Local service search → estimate request → paid job','Small repair packages; property maintenance agreements','High-intent Google Search Ads, local SEO, Google Business Profile where eligible, Nextdoor referrals, before-and-after videos, property manager outreach.','High','High','Medium','None','High','Local Google Search Ads','$150–$600'],
 ['mountainwize',4,'Purpose and decision-making content → application → coaching intensive','Midlife direction intensive; four-week decision coaching','Long-form YouTube videos about purpose, internal leadership, decision-making, and midlife reinvention. Shorts for discovery. Email nurturing. Test Meta ads after offer validation.','None','None','Medium','High','High','YouTube','To be validated'],
 ['sunflower-acres',5,'Local discovery → garden reservation or product order → payment','Accessible garden experiences; produce and plant subscriptions; group visits','Outreach to senior communities, disability organizations, care providers and activity coordinators. Local Facebook groups. Instagram garden tours. Seasonal Meta ads.','High','Medium','High','Medium','High','Local institutional partnerships','To be validated'],
 ['creative-flow-guitar',6,'YouTube content → free sample → digital purchase','Downloadable recordings and lessons; paid guitar sessions; membership','Weekly guitar demonstrations, searchable technique tutorials, Shorts featuring riffs, free MP3 email capture, downloadable session sales.','None','None','Medium','High','Medium','YouTube','To be validated'],
 ['surf-vacations',7,'Surf destination research → trip inquiry → referral or booking commission','Charter referral partnerships; custom surf-trip planning','Destination SEO, charter comparisons, seasonal surf guides, operator partnerships, YouTube trip guides, destination-specific Google Search Ads after commission agreements.','High','Medium','Medium','Medium','High','SEO and charter partnerships','Commission or planning fee, to be validated'],
 ['sustainable-aquarium',8,'Aquarium problem search → instructional content → product or consultation purchase','Walstad tank consultations; equipment affiliate recommendations; digital guides','Walstad tutorials, planted-tank troubleshooting, equipment comparisons, YouTube demonstrations, affiliate links, Pinterest visuals.','None','None','None','High','High','SEO and YouTube','To be validated']
];
export function initialRecord(hub) {
 const seed=seeds.find(s=>s[0]===hub.slug), cells={status:'Backlog'};
 if(seed) ['priority','funnel','initiatives','acquisition','channel0','channel1','channel2','channel3','channel4','primary','price'].forEach((key,i)=>cells[key]=seed[i+1]);
 return {hubId:hub.campaignId.replace(/-/g,'').toLowerCase(),cells};
}
// Dedicated tables in the app's existing D1 binding; no keyword tables are changed.
export async function initializeRevenue(db) {
 await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS hub_revenue_records (hub_id TEXT PRIMARY KEY, cells TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS hub_revenue_schema (id INTEGER PRIMARY KEY CHECK(id = 1), columns_json TEXT NOT NULL)')
 ]);
 await db.prepare('INSERT INTO hub_revenue_schema (id, columns_json) VALUES (1, ?) ON CONFLICT(id) DO NOTHING').bind(JSON.stringify(columns)).run();
}
export async function revenueAction(env,body,hubs) {
 const db=env.KWDB;
 await initializeRevenue(db);
 const schemaRow=await db.prepare('SELECT columns_json FROM hub_revenue_schema WHERE id = 1').first();
 const schema=JSON.parse(schemaRow.columns_json);
 // Idempotent insert is atomic, including simultaneous initialization requests.
 await db.batch(hubs.map(h=>{const r=initialRecord(h);return db.prepare('INSERT INTO hub_revenue_records (hub_id, cells) VALUES (?, ?) ON CONFLICT(hub_id) DO NOTHING').bind(r.hubId,JSON.stringify(r.cells));}));
 const getHub=id=>hubs.find(h=>h.campaignId.replace(/-/g,'').toLowerCase()===String(id).replace(/-/g,'').toLowerCase());
 if(body.action==='getHubRevenue') {
  const result=await db.prepare('SELECT hub_id, cells FROM hub_revenue_records').all();
  const known=new Set(hubs.map(h=>initialRecord(h).hubId));
  const rows=result.results.filter(r=>known.has(r.hub_id)).map(r=>({hubId:r.hub_id,cells:JSON.parse(r.cells)}));
  return {success:true,columns:schema,rows};
 }
 if(body.action==='saveHubRevenueCell') {
  const hub=getHub(body.hubId), col=schema.find(c=>c.id===body.columnId);
  if(!hub || !col || col.type==='relation')throw new Error('Unknown hub or editable column');
  const initial=initialRecord(hub);
  let value=body.value;
  if(col.type==='number') { if(value!=='') {value=Number(value);if(!Number.isFinite(value))throw new Error('Enter a finite number');} }
  else { if(typeof value!=='string'||value.length>20000)throw new Error('Text must be at most 20,000 characters'); }
  if(col.type==='select' && value!=='' && !col.options.includes(value))throw new Error('Invalid selection');
  await db.prepare('UPDATE hub_revenue_records SET cells = json_set(cells, ?, json(?)) WHERE hub_id = ?').bind('$.'+col.id,JSON.stringify(value),initial.hubId).run();
  return {success:true};
 }
 if(body.action==='changeHubRevenueColumn') {
  const next=structuredClone(schema), idx=next.findIndex(c=>c.id===body.columnId), col=next[idx];
  const name=String(body.name||'').trim();
  if(body.operation==='add') {
   if(next.length>=120||!name||name.length>120||!['text','multiline','number','select'].includes(body.type))throw new Error('Invalid column');
   const options=Array.isArray(body.options)?[...new Set(body.options.map(String).map(x=>x.trim()).filter(Boolean))]:[];
   if(body.type==='select'&&(!options.length||options.length>60||options.some(x=>x.length>120)))throw new Error('Supply 1–60 select options, at most 120 characters each');
   next.push({id:'custom_'+crypto.randomUUID(),name,type:body.type,...(body.type==='select'?{options}:{})});
  } else {
   if(!col || !col.id.startsWith('custom_'))throw new Error('Only custom columns can be changed');
   if(body.operation==='rename') {if(!name||name.length>120)throw new Error('Invalid name');col.name=name;}
   else if(body.operation==='move') {const to=idx+Number(body.direction);if(![-1,1].includes(Number(body.direction))||to<0||to>=next.length)throw new Error('Invalid position');[next[idx],next[to]]=[next[to],next[idx]];}
   else if(body.operation==='delete') {
    const filled=await db.prepare("SELECT COUNT(*) AS n FROM hub_revenue_records WHERE json_extract(cells, ?) IS NOT NULL AND CAST(json_extract(cells, ?) AS TEXT) != ''").bind('$.'+col.id,'$.'+col.id).first();
    const hasData=filled.n>0;
    if(hasData&&!body.confirmDelete)return {error:'This column contains data. Delete it?',needsConfirmation:true};
    next.splice(idx,1); // Retain hidden cells for recovery; IDs are never reused.
   } else throw new Error('Invalid operation');
  }
  const changed=await db.prepare('UPDATE hub_revenue_schema SET columns_json = ? WHERE id = 1 AND columns_json = ?').bind(JSON.stringify(next),schemaRow.columns_json).run();
  if(!changed.meta.changes)throw new Error('Columns changed in another session. Reload before editing columns.');
  return {success:true,columns:next};
 }
 throw new Error('Unknown revenue action');
}
