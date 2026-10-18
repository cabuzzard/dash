/* Revenue planner shares one D1 record per existing campaign ID across both views. */
const hubRevenue = {data:null, loading:null, queue:Promise.resolve(), pending:0, failed:[], views:{}};
const hrStyle='font-size:11px;padding:5px;border:1px solid var(--border2);border-radius:4px;background:var(--surface2);color:var(--text);';
function hrShell(slug) { return `<div class="hub-revenue" data-slug="${esc(slug)}">Open to load revenue planning…</div>`; }
async function hrLoad(force = false) {
 if(force && (hubRevenue.pending || hubRevenue.failed.length)){hrMessage("Finish saving or retry failed saves before reloading.");return;}
 if(force)hubRevenue.data=null;
 if(hubRevenue.loading)return hubRevenue.loading;
 if(hubRevenue.data){hrPaint();return;}
 hubRevenue.loading=(async()=>{try{const r=await call('getHubRevenue');if(r.error)throw Error(r.error);hubRevenue.data=r;hrPaint();}catch(e){document.querySelectorAll('.hub-revenue').forEach(el=>el.innerHTML=`<span style="color:var(--danger)">${esc(e.message)}</span> <button onclick="hrLoad()">Retry</button>`);}finally{hubRevenue.loading=null;}})();
 return hubRevenue.loading;
}
function hrMessage(message) {document.querySelectorAll('.hr-save').forEach(el=>el.textContent=message);}
function hrEnqueue(body) {
 hubRevenue.pending++;hrMessage('Saving…');
 hubRevenue.queue=hubRevenue.queue.then(async()=>{try{const r=await call(body.action,body);if(r.error)throw Error(r.error);hubRevenue.failed=hubRevenue.failed.filter(j=>!(j.hubId===body.hubId&&j.columnId===body.columnId));}catch(e){hubRevenue.failed=hubRevenue.failed.filter(j=>!(j.hubId===body.hubId&&j.columnId===body.columnId));hubRevenue.failed.push(body);hrMessage('Save failed: '+e.message+' — use Retry saves');}finally{hubRevenue.pending--;if(!hubRevenue.failed.length)hrMessage(hubRevenue.pending?'Saving…':'Saved');}});
}
async function hrRetry() {while(hubRevenue.pending)await hubRevenue.queue;const jobs=hubRevenue.failed.splice(0);jobs.forEach(hrEnqueue);}
function hrCell(el) {
 const row=hubRevenue.data.rows.find(r=>r.hubId===el.dataset.row),column=hubRevenue.data.columns.find(c=>c.id===el.dataset.col);
 if(!row||!column)return;
 if(column.type==='number' && el.value!=='' && !Number.isFinite(Number(el.value))){el.reportValidity();return;}
 row.cells[column.id]=el.value;hrEnqueue({action:'saveHubRevenueCell',hubId:row.hubId,columnId:column.id,value:el.value});
}
function hrView(el,key,value) {const view=hubRevenue.views[el.closest('.hub-revenue').dataset.slug]||={};view[key]=value;hrPaint();}
function hrPaint() {
 const data=hubRevenue.data;if(!data)return;
 document.querySelectorAll('.hub-revenue').forEach(el=>{
 const slug=el.dataset.slug,v=hubRevenue.views[slug]||={},hub=HUB_SITES.find(h=>h.slug===slug),id=h=>String(h.campaignId).replace(/-/g,'').toLowerCase(),byId=new Map(HUB_SITES.map(h=>[id(h),h]));
 const input=(key,label)=>`<label>${label} <input aria-label="${label}" value="${esc(v[key]||'')}" style="${hrStyle}width:100px" onchange="hrView(this,'${key}',this.value)"></label>`;
 const opts=(values,current)=>values.map(x=>`<option value="${esc(x)}" ${String(current)===String(x)?'selected':''}>${esc(x)}</option>`).join('');
 const select=(key,label,values)=>`<label>${label} <select aria-label="${label}" style="${hrStyle}" onchange="hrView(this,'${key}',this.value)">${opts(['',...values],v[key]||'')}</select></label>`;
 let rows=data.rows.filter(r=>byId.has(r.hubId)&& (v.portfolio||r.hubId===(hub&&id(hub))));
 rows=rows.filter(r=>(!v.hub||byId.get(r.hubId).name===v.hub)&&(!v.status||r.cells.status===v.status)&&(!v.channel||String(r.cells.primary||'').toLowerCase().includes(v.channel.toLowerCase()))&&(!v.priority||String(r.cells.priority??'')===v.priority));
 rows.sort((a,b)=>{const n=r=>r.cells.priority===''||r.cells.priority==null?Infinity:Number(r.cells.priority);return (v.desc?-1:1)*(n(a)-n(b))||byId.get(a.hubId).name.localeCompare(byId.get(b.hubId).name);});
 el.innerHTML=`<div style="font-size:12px;font-weight:700;margin-bottom:5px;">Revenue &amp; Acquisition Strategy</div><p style="font-size:11px;color:var(--text3)">Editable planning hypotheses. Strategies and offer prices have not been validated.</p>
 <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><button style="${hrStyle}" onclick="hrView(this,'portfolio',${!v.portfolio})">${v.portfolio?'Individual Hub View':'Portfolio View'}</button>
 ${select('hub','Hub',[...byId.values()].map(h=>h.name))}${select('status','Status',['Backlog','Planned','Testing','Active','Paused'])}${input('channel','Acquisition channel')}${input('priority','Priority')}
 <button style="${hrStyle}" onclick="hrView(this,'desc',${!v.desc})">Priority ${v.desc?'↓':'↑'}</button><button style="${hrStyle}" onclick="hrView(this,'manage',${!v.manage})">Custom columns</button></div>
 ${v.manage?`<div style="padding:8px;border:1px solid var(--border2);margin-bottom:8px;">
 <form onsubmit="event.preventDefault();hrColumn(this,'add')" style="display:flex;gap:5px;flex-wrap:wrap"><input name="name" required maxlength="120" placeholder="Column name" aria-label="New column name" style="${hrStyle}"><select name="type" aria-label="Column type" style="${hrStyle}">${opts(['text','multiline','number','select'],'text')}</select><input name="options" placeholder="Select options, separated by commas" aria-label="Select options" style="${hrStyle}"><button style="${hrStyle}">Add column</button></form>
 ${data.columns.filter(c=>c.id.startsWith('custom_')).map(c=>`<form data-col="${esc(c.id)}" onsubmit="event.preventDefault();hrColumn(this,'rename')" style="display:flex;gap:5px;margin-top:5px"><input name="name" aria-label="Rename custom column" required maxlength="120" value="${esc(c.name)}" style="${hrStyle}"><button style="${hrStyle}">Rename</button><button type="button" style="${hrStyle}" onclick="hrColumn(this.form,'move',-1)">←</button><button type="button" style="${hrStyle}" onclick="hrColumn(this.form,'move',1)">→</button><button type="button" style="${hrStyle}" onclick="hrColumn(this.form,'delete')">Delete</button></form>`).join('')}</div>`:''}
 <div style="overflow-x:auto;max-width:100%"><table style="border-collapse:collapse;width:100%"><thead><tr>${data.columns.map(c=>`<th style="text-align:left;min-width:${c.type==='multiline'?240:c.type==='number'?75:160}px;padding:6px;border-bottom:1px solid var(--border2);font-size:11px">${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${data.columns.map(c=>{
 const value=r.cells[c.id]??'',attrs=`data-row="${esc(r.hubId)}" data-col="${esc(c.id)}" aria-label="${esc(byId.get(r.hubId).name+' — '+c.name)}" onchange="hrCell(this)" style="${hrStyle}box-sizing:border-box;width:100%;${c.type==='multiline'?'min-height:110px;resize:vertical;':''}"`;
 return `<td style="padding:3px;vertical-align:top;border-bottom:1px solid var(--border)">${c.type==='relation'?`<span style="font-size:11px">${esc(byId.get(r.hubId).name)}</span>`:c.type==='multiline'?`<textarea ${attrs}>${esc(value)}</textarea>`:c.type==='select'?`<select ${attrs}>${opts(['',...c.options],value)}</select>`:`<input type="${c.type==='number'?'number':'text'}" ${c.type==='number'?'step="any"':''} ${attrs} value="${esc(value)}">`}</td>`;
 }).join('')}</tr>`).join('')||`<tr><td colspan="${data.columns.length}" style="padding:10px">No matching hubs.</td></tr>`}</tbody></table></div>
 <div style="font-size:11px;margin-top:6px"><span class="hr-save" role="status">${hubRevenue.failed.length?'Unsaved changes — use Retry saves':hubRevenue.pending?'Saving…':'Changes save automatically when you leave a cell.'}</span> <button style="${hrStyle}" onclick="hrRetry()">Retry saves</button> <span class="hr-column-msg" role="status"></span></div>`;
 });
}
async function hrColumn(form,operation,direction) {
 const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 try {
 while(hubRevenue.pending)await hubRevenue.queue;
 if(hubRevenue.failed.length)throw Error("Retry failed cell saves before changing columns.");
 let body={action:'changeHubRevenueColumn',operation,columnId:form.dataset.col,direction,name:form.elements.name?.value,type:form.elements.type?.value,options:form.elements.options?.value.split(',').map(x=>x.trim()).filter(Boolean)};
 let r=await call(body.action,body);
 if(r.needsConfirmation){if(!confirm(r.error))return;body.confirmDelete=true;r=await call(body.action,body);}
 if(r.error)throw Error(r.error);
 hubRevenue.data.columns=r.columns;hrPaint();
 }catch(e){const el=form.closest('.hub-revenue').querySelector('.hr-column-msg');if(el)el.textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}
}
window.addEventListener('beforeunload',e=>{if(hubRevenue.pending||hubRevenue.failed.length){e.preventDefault();e.returnValue='';}});
