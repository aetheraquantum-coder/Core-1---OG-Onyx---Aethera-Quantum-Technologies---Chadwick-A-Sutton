(function(g){'use strict';
const key='aq-result-history',allowed=new Set(['save','feedback','risk','firewall-plan','vpn-plan','iteration','health','prediction']);
let bus;try{bus=new BroadcastChannel('aethera-results');}catch(e){}
function history(){try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data:[];}catch(e){return [];}}
function receive(event){if(!event||!allowed.has(event.source)||!['recorded','blocked','saved','failed'].includes(event.status))return;g.dispatchEvent(new CustomEvent('aq-result',{detail:event}));}
function emit(source,status,summary,scores){if(!allowed.has(source))return;
 const event={id:crypto.randomUUID(),at:new Date().toISOString(),source,status,summary:String(summary).slice(0,180)};
 if(Array.isArray(scores)&&scores.length===6&&scores.every(n=>Number.isFinite(n)&&n>=0&&n<=1))event.scores=scores.slice();
 try{localStorage.setItem(key,JSON.stringify([...history(),event].slice(-30)));}catch(e){}
 receive(event);if(bus)bus.postMessage(event);
}
if(bus)bus.onmessage=e=>receive(e.data);
g.addEventListener('storage',e=>{if(!bus&&e.key===key){const h=history();if(h.length)receive(h[h.length-1]);}});
g.addEventListener('aethera-save-status',e=>emit('save',e.detail.error?'failed':'saved',e.detail.message));
g.AetheraResults={emit,history};
})(globalThis);
