/* Standalone companion: thirty-second browser-local snapshots; no disk API. */
(function(g){'use strict';
const adapters=new Map();let dirty=false,lastError='';
const validId=id=>typeof id==='string'&&/^[a-z0-9-]{1,80}$/.test(id);
function notify(message){g.dispatchEvent(new CustomEvent('aethera-save-status',{detail:{message,error:lastError}}));}
function read(id){for(const prefix of ['aq-save:','aq-save-backup:']){try{const raw=g.localStorage.getItem(prefix+id);if(raw){const record=JSON.parse(raw);if(record.schema==='aethera-save/v1'&&record.id===id)return record;}}catch(e){lastError=String(e);}}return null;}
function flush(closing=false){
 let ok=true;
 for(const [id,a] of adapters){try{
  const record={schema:'aethera-save/v1',id,saved_at:new Date().toISOString(),data:a.capture()};
  const raw=JSON.stringify(record);if(raw.length>1000000)throw Error('Snapshot exceeds 1 MB');
  const old=g.localStorage.getItem('aq-save:'+id);
  if(old)g.localStorage.setItem('aq-save-backup:'+id,old);
  g.localStorage.setItem('aq-save:'+id,raw);
 }catch(e){ok=false;lastError=String(e);}}
 dirty=!ok;if(ok){lastError='';notify('Snapshot saved '+new Date().toLocaleTimeString());}else notify('Save failed; keep this page open.');
 return Promise.resolve(ok);
}
function register(id,capture,restore){
 if(!validId(id)||typeof capture!=='function'||typeof restore!=='function')throw Error('Invalid save adapter');
 adapters.set(id,{capture,restore});
 let saved=read(id);
 if(saved){try{restore(saved.data);}catch(e){lastError=String(e);notify('Saved state rejected; start state retained.');}}

}
function exportSaves(){const data={schema:'aethera-save-export/v1',records:[...adapters.keys()].map(read).filter(Boolean)};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='aethera-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
g.addEventListener('input',()=>dirty=true);g.addEventListener('click',()=>dirty=true);
g.addEventListener('pagehide',()=>{flush(true);});
g.document.addEventListener('visibilitychange',()=>{if(g.document.visibilityState==='hidden')flush(true);});
g.addEventListener('beforeunload',e=>{flush(true);if(dirty){e.preventDefault();e.returnValue='';}});
const timer=g.setInterval(()=>flush(),30000);
g.AetheraSave={register,flush,exportSaves,intervalMs:30000,stop:()=>g.clearInterval(timer)};
})(globalThis);
