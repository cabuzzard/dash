const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const median=a=>{a=a.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null};
const growth=(series,n)=>{if(series.length<=n)return null;const a=series.at(-1).value,b=series.at(-1-n).value;return b>0?(a/b-1)*100:null};
function score(m,w={population:40,acceleration:20,migration:20,housing:20}){
 const p=growth(m.population,1),p3=growth(m.population,3),h=growth(m.zhvi,12),prev=m.population.length>2?growth(m.population.slice(0,-1),1):null;
 const acc=p!==null&&prev!==null?p-prev:null, net=m.net_migration.at(-1)?.value, pop=m.population.at(-1)?.value;
 const inputs={population:p===null?null:clamp(50+p*10,0,100),acceleration:acc===null?null:clamp(50+acc*20,0,100),migration:net==null||!pop?null:clamp(50+net/pop*1000,0,100),housing:h===null?null:clamp(55-Math.abs(h-3)*4,0,100)};
 const total=Object.values(w).reduce((a,b)=>a+b,0); let weighted=0,covered=0;
 for(const k in inputs)if(inputs[k]!==null){weighted+=inputs[k]*w[k];covered+=w[k]}
 return {score:covered?weighted/covered:null,coverage:total?covered/total:0,p,p3,h,acc,cycle:p>1&&acc>0?'Strengthening signals':p<0?'Population contraction':'Mixed / watch',inputs};
}
function parseCSV(text){const rows=[];let row=[],s='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(q&&text[i+1]==='"'){s+='"';i++}else q=!q}else if(c===','&&!q){row.push(s);s=''}else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&text[i+1]==='\n')i++;row.push(s);if(row.some(Boolean))rows.push(row);row=[];s=''}else s+=c}if(q)throw Error('Unclosed CSV quote');row.push(s);if(row.some(Boolean))rows.push(row);if(!rows.length)return [];const heads=rows.shift().map(x=>x.trim().replace(/^\uFEFF/,''));if(new Set(heads).size!==heads.length)throw Error('Duplicate CSV columns');return rows.map(r=>Object.fromEntries(heads.map((h,i)=>[h,(r[i]||'').trim()])))}
function normalizeSales(rows){const needed=['property_id','geoid','lot_acres','sale_price','closed_date','property_type','source'];if(rows.length&&needed.some(k=>!(k in rows[0])))throw Error('Required columns: '+needed.join(', '));const seen=new Set(),valid=[],errors=[];rows.forEach((r,i)=>{const a=+r.lot_acres,p=+r.sale_price,d=new Date(r.closed_date+'T00:00:00Z');if(!r.property_id||!/^\d{5}$/.test(r.geoid)||!r.source||!r.property_type||!Number.isFinite(a)||a<=0||!Number.isFinite(p)||p<=0||!/^\d{4}-\d{2}-\d{2}$/.test(r.closed_date)||!Number.isFinite(+d)||d.toISOString().slice(0,10)!==r.closed_date||d>new Date()){errors.push('Row '+(i+2)+': invalid identifier, geography, source, acreage, price or date');return}const key=r.geoid+'|'+r.property_id+'|'+r.closed_date;if(seen.has(key))return;seen.add(key);const out={...r,lot_acres:a,sale_price:p};for(const k of ['sqft','year_built','bedrooms','bathrooms','days_on_market','listing_price'])out[k]=r[k]!==''&&r[k]!=null&&Number.isFinite(+r[k])?+r[k]:null;valid.push(out)});return {valid,errors}}
function matchSales(rows,{geoid,type,acres=1.5,sqft,year,condition,quality,asof=new Date().toISOString().slice(0,10),months=24,min=8}){const cutoff=new Date(asof+'T00:00:00Z');cutoff.setUTCMonth(cutoff.getUTCMonth()-months);let base=rows.filter(r=>r.geoid===geoid&&r.property_type===type&&r.closed_date<=asof&&new Date(r.closed_date+'T00:00:00Z')>=cutoff&&(!sqft||(r.sqft&&Math.abs(r.sqft/sqft-1)<=.2))&&(!year||(r.year_built&&Math.abs(r.year_built-year)<=10))&&(!condition||r.condition===condition)&&(!quality||r.quality===quality));let found=[],tolerance;for(tolerance of [.15,.25,.4]){found=base.filter(r=>Math.abs(r.lot_acres/acres-1)<=tolerance);if(found.length>=min)break}return {rows:found,tolerance,sufficient:found.length>=min,median:median(found.map(r=>r.sale_price)),psf:median(found.filter(r=>r.sqft>0).map(r=>r.sale_price/r.sqft))}}
const ranges=[[0,.5],[.5,1],[1,2],[2,5],[5,10],[10,Infinity]];
function segments(rows){return ranges.map(([lo,hi])=>{const a=rows.filter(r=>r.lot_acres>=lo&&r.lot_acres<hi);return {range:`${lo}–${hi===Infinity?'∞':hi} ac`,count:a.length,share:rows.length?a.length/rows.length:0,median:median(a.map(r=>r.sale_price)),sqft:median(a.map(r=>r.sqft)),dom:median(a.map(r=>r.days_on_market))}})}
function valueLand(x){for(const [k,v]of Object.entries(x))if(!Number.isFinite(v)||v<0)throw Error(k+' must be a nonnegative number');if(!Number.isInteger(x.lots)||x.lots<1||x.years<=0||x.acres<=0||x.saleRate>=1||x.profitRate>=1)throw Error('Check lots, acreage, holding period and rates');if(x.lots*x.lotAcres>x.acres)throw Error('Lot acreage exceeds tract acreage before roads or setbacks');const gross=x.lots*x.exit,dev=x.roads+x.water+x.electric+x.engineering+x.permits+x.site,cont=dev*x.contingency,selling=gross*x.saleRate,required=gross*x.profitRate,costs=dev+cont+x.holding+x.finance+selling+x.reserve,max=gross-costs-required,total=x.purchase+costs,net=gross-total;return {gross,dev,cont,costs,max,target:Math.max(0,max*.9),total,net,margin:gross?net/gross:null,roc:total?net/total:null,annual:total>0?Math.pow(gross/total,1/x.years)-1:null,breakeven:(x.purchase+costs-selling)/(x.lots*(1-x.saleRate))}}
function scenarios(base,rates){return [1,3,5].map(years=>({years,...Object.fromEntries(Object.entries(rates).map(([k,r])=>[k,base*Math.pow(1+r/100,years)]))}))}
if(typeof module!=='undefined')module.exports={median,growth,score,parseCSV,normalizeSales,matchSales,segments,valueLand,scenarios};
// Nationwide descriptive cycle engine. Calendar-aligned windows never bridge missing months.
function monthShift(date,n){const d=new Date(date.slice(0,7)+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7)}
function monthValue(series,date,offset=0){const target=monthShift(date,offset);return series.find(p=>p.date.slice(0,7)===target)?.value??null}
function calendarGrowth(series,date,months=12){const a=monthValue(series,date),b=monthValue(series,date,-months);return a!==null&&b>0?(a/b-1)*100:null}
function volumeGrowth(series,date){const now=[0,-1,-2].map(i=>monthValue(series,date,i)),old=[-12,-13,-14].map(i=>monthValue(series,date,i));if([...now,...old].some(v=>v===null))return null;const b=old.reduce((a,b)=>a+b,0);return b>0?(now.reduce((a,b)=>a+b,0)/b-1)*100:null}
function cycleSignals(m,asof=null,w={acceleration:30,demand:25,supply:25,runway:20}){
 const z=(m.zhvi||[]).filter(p=>!asof||p.date<=asof),end=z.at(-1)?.date;
 const empty={stage:'Insufficient history',opportunity:null,coverage:0,date:end,annual:null,short:null,acceleration:null,inventoryGrowth:null,salesGrowth:null,pendingGrowth:null,drawdown:null,threeYear:null,fiveYear:null,reasons:['At least 24 months of continuous price history is needed.'],risks:['No complete cycle assessment available.']};
 if(!end)return empty;
 const annual=calendarGrowth(z,end,12),q=calendarGrowth(z,end,3),prior=calendarGrowth(z,monthShift(end,-3)+'-28',3),short=q===null?null:(Math.pow(1+q/100,4)-1)*100,previous=prior===null?null:(Math.pow(1+prior/100,4)-1)*100,acceleration=short===null||previous===null?null:short-previous;
 const peak=Math.max(...z.map(p=>p.value),!asof?(m.price_peak||0):0),drawdown=peak>0?(z.at(-1).value/peak-1)*100:null;
 // Auxiliary evidence must refer to the same month as prices, never silently use mismatched vintages.
 const inventoryGrowth=calendarGrowth(m.inventory||[],end),salesGrowth=volumeGrowth(m.sales||[],end),pendingGrowth=calendarGrowth(m.pending||[],end),threeYear=calendarGrowth(z,end,36),fiveYear=calendarGrowth(z,end,60);
 const complete=annual!==null&&calendarGrowth(z,end,24)!==null&&short!==null&&acceleration!==null;
 let stage='Insufficient history';const firming=(inventoryGrowth!==null&&inventoryGrowth<0)||(salesGrowth!==null&&salesGrowth>3)||(pendingGrowth!==null&&pendingGrowth<-5);
 if(complete){
  if(annual<-2&&short<=0)stage='Correction';
  else if(drawdown<-3&&short>0&&acceleration>0)stage='Recovery';
  else if(annual>=0&&annual<=6&&short>0&&acceleration>1&&firming)stage='Emerging upswing';
  else if(short<annual-2||(inventoryGrowth>15&&salesGrowth!==null&&salesGrowth<0))stage='Cooling';
  else if(annual>6&&short>0)stage='Expansion';
  else stage='Stabilizing / mixed';
 }
 const inputs={acceleration:acceleration===null?null:clamp(50+acceleration*3,0,100),demand:salesGrowth===null?null:clamp(50+salesGrowth*2,0,100),supply:inventoryGrowth===null?null:clamp(50-inventoryGrowth*1.5,0,100),runway:annual===null?null:clamp(75-Math.abs(annual-3)*5,0,100)};
 let sum=0,covered=0,total=0;for(const k in inputs){const weight=w[k]??0;total+=weight;if(inputs[k]!==null){covered+=weight;sum+=weight*inputs[k]}}
 const reasons=[`Annual home-value change: ${annual===null?'unavailable':annual.toFixed(1)+'%'}.`,`Recent 3-month annualized pace: ${short===null?'unavailable':short.toFixed(1)+'%'}.`,`Pace change versus prior quarter: ${acceleration===null?'unavailable':acceleration.toFixed(1)+' percentage points'}.`];
 if(inventoryGrowth!==null)reasons.push(`Inventory year over year: ${inventoryGrowth.toFixed(1)}%.`);if(salesGrowth!==null)reasons.push(`Last 3 months sales versus same months last year: ${salesGrowth.toFixed(1)}%.`);
 const risks=['Housing signals do not establish land-price appreciation or parcel feasibility.'];if(covered<total)risks.push('Demand / supply coverage is incomplete; scores across different geography levels are not comparable.');if(short<0)risks.push('Recent price momentum remains negative.');if(inventoryGrowth>15)risks.push('Inventory is growing quickly.');if(salesGrowth!==null&&salesGrowth<0)risks.push('Transaction demand is below the prior-year period.');
 return {stage,opportunity:complete&&covered?sum/covered:null,coverage:total?covered/total:0,date:end,annual,short,acceleration,inventoryGrowth,salesGrowth,pendingGrowth,drawdown,threeYear,fiveYear,reasons,risks,inputs};
}
if(typeof module!=='undefined')Object.assign(module.exports,{monthValue,calendarGrowth,volumeGrowth,cycleSignals});
