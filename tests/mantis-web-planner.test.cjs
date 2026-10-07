const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = path.join(__dirname, '..', 'skills', 'review-mantis-plans', 'resources', 'praying-mantis', 'web');
const context = vm.createContext({URL});
vm.runInContext(fs.readFileSync(path.join(source,'security-plans.js'),'utf8'),context,{timeout:1000});
vm.runInContext(fs.readFileSync(path.join(source,'exchange-core.js'),'utf8'),context,{timeout:1000});
const plans = context.MantisPlans;
const exchange = context.InsightExchange;
let cases=0;
const serialize = x => JSON.parse(JSON.stringify(x));
test('144 synthetic firewall combinations preserve inputs and keep enforcement off',()=>{
  for(const proto of ['tcp','udp'])for(const direction of ['in','out'])for(const state of ['new','established'])for(const profile of ['public','private','domain'])for(const dst_port of [1,53,80,443,445,65535]){
    const flow={proto,direction,state,profile,dst_port}, before=JSON.stringify(flow);
    const r=plans.classify(flow);
    const expected=direction==='out'&&proto==='tcp'&&dst_port===445?'deny':state==='established'?'allow':direction==='in'?'deny':'allow';
    assert.equal(r.action,expected);assert.equal(r.applied,false);assert.equal(r.host_status,'unknown');assert.equal(JSON.stringify(flow),before);cases++;
  }
  assert.equal(cases,144);
});
test('invalid web flow data is rejected',()=>{
  const good={proto:'tcp',direction:'in',state:'new',profile:'public',dst_port:443};
  for(const change of [{proto:'icmp'},{direction:'both'},{state:'observed'},{profile:'unknown'},{dst_port:0},{dst_port:65536},{dst_port:true},{dst_port:'443'}])assert.throws(()=>plans.classify({...good,...change}));
});
test('valid IPv4, hostname and IPv6 plans remain disconnected',()=>{
  for(const endpoint of ['vpn.example.invalid:51820','127.0.0.1:443','[2001:db8::1]:51820']){
    const r=plans.vpnPlan({mode:'wireguard-plan',endpoint,dns:'9.9.9.9'});
    assert.equal(r.connected,false);assert.equal(r.applied,false);assert.equal(r.kill_switch,'not-implemented');
  }
});
test('malformed VPN endpoint and DNS inputs are rejected without connecting',()=>{
  const good={mode:'wireguard-plan',endpoint:'vpn.example.invalid:51820',dns:'9.9.9.9'};
  for(const change of [{endpoint:'user:inert@host:443'},{endpoint:'https://host:443'},{endpoint:'host:0'},{endpoint:'host:65536'},{endpoint:'999.1.1.1:443'},{dns:'999.1.1.1'},{dns:'01.2.3.4'},{dns:'9.9.9.9/path'},{mode:'execute'}])assert.throws(()=>plans.vpnPlan({...good,...change}));
});
test('90 valid advisory combinations remain fixed user-reported data',()=>{
  let n=0;
  for(const source of ['onyx-ai','praying-mantis','experimental-ai'])for(const topic of ['input-validation','save-recovery','boundary-check','packaging','usability'])for(const result of ['pass','fail','inconclusive'])for(const checks of [0,10000]){
    const p={schema:'aethera-insight/v1',source,topic,result,checks,evidence:'user-reported',authority:'advisory'};
    assert.deepEqual(serialize(exchange.validate(p)),p);n++;
  }
  assert.equal(n,90);
});
test('advisory extras, authority changes and VeilShield/Veilshell names are rejected',()=>{
  const p={schema:'aethera-insight/v1',source:'praying-mantis',topic:'boundary-check',result:'pass',checks:8,evidence:'user-reported',authority:'advisory'};
  for(const change of [{command:'inert'},{secret:'inert'},{authority:'execute'},{evidence:'verified'},{checks:-1},{checks:10001},{checks:0.5},{source:'VeilShield'},{source:'Veilshell'}])assert.throws(()=>exchange.validate({...p,...change}));
});
