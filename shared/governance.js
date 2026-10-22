/* Governance unlock token stays in this page's closure; never persisted. */
(function () {
  'use strict';
  let unlockToken='',expiresAt=0,count=0,busy=false;
  const targets=()=>[...document.querySelectorAll('[data-governance-control]')];
  function render(){
    if(expiresAt<=Date.now()){unlockToken='';expiresAt=0;}
    targets().forEach(el=>{
      el.querySelector('[data-gov-state]').textContent=unlockToken?'Governance unlocked until '+new Date(expiresAt).toLocaleTimeString():'Governance locked';
      el.querySelector('[data-gov-count]').textContent=count+' blocked writes';
      el.querySelector('button').textContent=unlockToken?'Lock governance':'\u{1f513} Unlock governance (15 min)';
    });
  }
  async function refresh(){
    if(busy||typeof SESSION_TOKEN==='undefined'||!SESSION_TOKEN)return;
    busy=true;try{const r=await call('getGovernanceAttempts');if(r.success)count=r.count;}catch(e){}finally{busy=false;render();}
  }
  function lock(){unlockToken='';expiresAt=0;render();refresh();}
  function unlock(){
    if(unlockToken){lock();return;}
    const dialog=document.createElement('dialog');
    dialog.innerHTML='<form><label>Governance code <input type="password" autocomplete="off" required maxlength="1024"></label><p role="status"></p><button type="submit">Unlock for 15 minutes</button> <button type="button">Cancel</button></form>';
    dialog.querySelector('[type=button]').onclick=()=>{dialog.close();dialog.remove();};
    dialog.addEventListener('cancel',()=>dialog.remove());
    dialog.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const input=dialog.querySelector('input'),code=input.value;input.value='';
      try{const r=await call('unlockGovernance',{code});if(!r.unlockToken)throw Error(r.error||'Unlock refused');unlockToken=r.unlockToken;expiresAt=r.expiresAt;dialog.close();dialog.remove();render();}
      catch(err){dialog.querySelector('[role=status]').textContent=err.message;}
    };
    document.body.append(dialog);dialog.showModal();dialog.querySelector('input').focus();
  }
  function mount(){
    const anchors=[document.getElementById('cmFlowMsg')?.parentElement,document.querySelector('#tabInformationFlow .wo-title')];
    anchors.filter(Boolean).forEach(anchor=>{
      if(anchor.nextElementSibling?.hasAttribute('data-governance-control'))return;
      const el=document.createElement('div');el.setAttribute('data-governance-control','');el.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:8px 0;font-size:12px';
      el.innerHTML='<button type="button">\u{1f513} Unlock governance (15 min)</button><span data-gov-state></span><span data-gov-count></span>';
      el.querySelector('button').onclick=unlock;anchor.after(el);render();refresh();
    });
  }
  window.Governance={attach(payload){
    if(payload.action==='saveInfoFlowTable'&&['informationflowgraph','currentmethods'].includes(String(payload.name||'').replace(/[^a-z0-9-]/gi,'').slice(0,40))){
      if(expiresAt>Date.now()&&unlockToken)payload.governanceUnlock=unlockToken;
    }
  },locked:lock};
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});
  setInterval(render,1000);setInterval(refresh,60000);mount();
})();
