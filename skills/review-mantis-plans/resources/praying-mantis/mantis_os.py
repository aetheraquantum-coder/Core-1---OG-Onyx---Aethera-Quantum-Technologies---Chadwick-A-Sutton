#!/usr/bin/env python3
"""Chadwick Sutton's audit-only control-plane lab. No host enforcement APIs."""
from __future__ import annotations
from copy import deepcopy
from dataclasses import dataclass,field
from enum import Enum
from hashlib import sha256
import json
import math
import ipaddress
import re
from time import time

ENFORCE=False
GATE=.65
AXES=('Launch','Assets','Saves','Boundary','Security','Portable')

class Cap(str,Enum):
    SCAN='scan';CLASSIFY='classify';VPN_PLAN='vpn.plan';REPORT='report';APPLY='apply'

@dataclass
class Msg:
    src:str
    kind:str
    body:dict
    ts:float=field(default_factory=time)

@dataclass
class Proc:
    name:str
    caps:set[Cap]
    mailbox:list[Msg]=field(default_factory=list)

class Journal:
    def __init__(self):self.rows=[]
    def add(self,event,**kw):
        row={'t':time(),'event':event,**deepcopy(kw)};self.rows.append(row);return deepcopy(row)

class Lattice:
    A=((0,.20,0,.10,.15,.35),(.20,0,0,.05,.10,.10),(.10,0,0,.05,.30,.15),
       (.05,0,0,0,.40,.05),(.10,.05,.15,.25,0,.10),(.30,.10,.10,.05,.10,0))
    def propagate(self,x0,steps=6,gain=.55):
        if not isinstance(x0,(list,tuple)) or len(x0)!=6:raise ValueError('six risks required')
        if any(isinstance(x,bool) for x in x0):raise ValueError('numeric risks required')
        x0=list(map(float,x0))
        if any(not math.isfinite(x) or not 0<=x<=1 for x in x0):raise ValueError('risks must be finite in [0,1]')
        if type(steps) is not int or not 0<=steps<=10000:raise ValueError('invalid steps')
        gain=float(gain)
        if not math.isfinite(gain) or not 0<=gain<=1:raise ValueError('invalid gain')
        x=x0[:]
        for _ in range(steps):x=[min(1,max(0,x0[i]+gain*sum(self.A[i][j]*x[j] for j in range(6)))) for i in range(6)]
        return x,max(x)>=GATE

class AVService:
    """Matches synthetic in-memory fixtures only. Not an antivirus engine."""
    def __init__(self,signatures):self.signatures=dict(signatures)
    def scan_bytes(self,blob,name):
        if not isinstance(blob,bytes) or len(blob)>10_000_000:raise ValueError('bounded bytes required')
        if not isinstance(name,str):raise ValueError('name must be text')
        digest=sha256(blob).hexdigest();hits=[n for n,h in self.signatures.items() if h==digest]
        return dict(target=name,sha256=digest,hits=hits,verdict='match' if hits else 'no-match',
                    plan='quarantine-plan' if hits else 'none',applied=False,
                    scope='synthetic fixture hash matching; no-match is not a clean verdict')

class FWService:
    def __init__(self,policy):
        if not isinstance(policy,(list,tuple)):raise ValueError('policy must be a list or tuple')
        self.policy=deepcopy(policy)
        for rule in self.policy:
            if not isinstance(rule,dict) or set(rule)-{'id','action','proto','dst_port','direction'}:raise ValueError('invalid rule fields')
            if not isinstance(rule.get('id'),str) or not rule['id'].strip() or rule.get('action') not in ('allow','deny'):raise ValueError('invalid rule')
            if 'proto' in rule and rule['proto'] not in ('tcp','udp'):raise ValueError('invalid rule protocol')
            if 'direction' in rule and rule['direction'] not in ('in','out'):raise ValueError('invalid rule direction')
            if 'dst_port' in rule and (type(rule['dst_port']) is not int or not 1<=rule['dst_port']<=65535):raise ValueError('invalid rule port')
    def classify(self,flow):
        if not isinstance(flow,dict):raise ValueError('flow must be an object')
        if flow.get('proto') not in ('tcp','udp') or flow.get('direction') not in ('in','out') or type(flow.get('dst_port')) is not int or not 1<=flow['dst_port']<=65535:raise ValueError('invalid synthetic flow')
        action,rule_id=('deny','default-inbound-deny') if flow['direction']=='in' else ('allow','default-outbound-allow')
        for rule in self.policy:
            if all(k not in rule or rule[k]==flow.get(k) for k in ('proto','dst_port','direction')):
                action,rule_id=rule['action'],rule['id'];break
        return dict(flow=deepcopy(flow),action=action,rule=rule_id,applied=False,host_status='unknown',note='synthetic first-match policy only; no connection tracking, application policy, or host changes')

class VPNService:
    STATES=('down','configured','blocked_no_enforce')
    def __init__(self):self.state='down';self.cfg={}
    def plan(self,cfg):
        self.state='down';self.cfg={}
        if not isinstance(cfg,dict):raise ValueError('VPN plan must be an object')
        missing=[k for k in ('endpoint','mode','dns') if not isinstance(cfg.get(k),str) or not cfg[k].strip()]
        if missing:return dict(ok=False,state=self.state,missing=missing,applied=False)
        if cfg['mode'] not in ('wireguard-plan','ikev2-plan'):return dict(ok=False,state=self.state,reason='unknown-mode',applied=False)
        if 'kill_switch' in cfg and type(cfg['kill_switch']) is not bool:raise ValueError('kill_switch must be Boolean')
        # Validate format only; no DNS query, tunnel, or secret storage.
        endpoint=cfg['endpoint']
        m=re.fullmatch(r'(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+):(\d{1,5})',endpoint)
        if not m or not 1<=int(m[2])<=65535:return dict(ok=False,state=self.state,reason='invalid-endpoint',applied=False)
        host=m[1]
        try:
            if host.startswith('['):ipaddress.IPv6Address(host[1:-1])
            elif re.fullmatch(r'[0-9.]+',host):ipaddress.IPv4Address(host)
            elif len(host)>253 or any(not re.fullmatch(r'[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?',label) for label in host.split('.')):raise ValueError('hostname')
            ipaddress.ip_address(cfg['dns'])
        except ValueError:return dict(ok=False,state=self.state,reason='invalid-address',applied=False)
        # Allowlist excludes credentials and arbitrary extra payloads.
        self.cfg={k:cfg[k] for k in ('endpoint','mode','dns','kill_switch') if k in cfg}
        self.state='blocked_no_enforce'
        return dict(ok=True,state=self.state,endpoint=cfg['endpoint'],kill_switch_plan=cfg.get('kill_switch',False),applied=False,connected=False,availability='unavailable-in-lab',handshake='not-tested',routing='not-tested',dns_leaks='not-tested',kill_switch='not-implemented',note='format validation only; no device, network connection, or handshake')

class MantisOS:
    ROUTES={'av.scan':('av',Cap.SCAN),'fw.classify':('fw',Cap.CLASSIFY),'vpn.plan':('vpn',Cap.VPN_PLAN)}
    def __init__(self):
        self.journal=Journal();self.lattice=Lattice()
        self.av=AVService({'synthetic-demo-fixture':sha256(b'EICAR-FIXTURE').hexdigest()})
        self.fw=FWService([dict(id='deny-smb-out',proto='tcp',dst_port=445,direction='out',action='deny'),dict(id='allow-https',proto='tcp',dst_port=443,direction='out',action='allow')])
        self.vpn=VPNService()
        self.procs={'av':Proc('av',{Cap.SCAN,Cap.REPORT}),'fw':Proc('fw',{Cap.CLASSIFY,Cap.REPORT}),'vpn':Proc('vpn',{Cap.VPN_PLAN,Cap.REPORT}),'init':Proc('init',{Cap.REPORT})}
    def require(self,proc,cap):
        if cap==Cap.APPLY:raise PermissionError('enforcement-pin: apply is not implemented in this lab')
        if proc not in self.procs or cap not in self.procs[proc].caps:raise PermissionError('unknown process or missing capability')
    def syscall(self,proc,kind,body):
        if not isinstance(body,dict):raise ValueError('message body must be an object')
        self.journal.add('syscall',proc=proc,kind=kind)
        if kind=='apply':self.require(proc,Cap.APPLY)
        if kind=='journal':self.require(proc,Cap.REPORT);return {'n':len(self.journal.rows)}
        if kind not in self.ROUTES:raise ValueError('unknown syscall')
        _,cap=self.ROUTES[kind];self.require(proc,cap)
        if kind=='av.scan':return self.av.scan_bytes(body.get('bytes',b''),body.get('name','mem'))
        if kind=='fw.classify':return self.fw.classify(body)
        return self.vpn.plan(body)
    def send(self,src,dst,kind,body):
        if kind not in self.ROUTES or self.ROUTES[kind][0]!=dst:raise ValueError('invalid route')
        self.require(src,self.ROUTES[kind][1])
        if not isinstance(body,dict):raise ValueError('object required')
        if len(self.procs[dst].mailbox)>=100:raise ValueError('mailbox full')
        self.procs[dst].mailbox.append(Msg(src,kind,deepcopy(body)))
        self.journal.add('queued',src=src,dst=dst,kind=kind)
    def drain(self,dst):
        if dst not in self.procs:raise ValueError('unknown destination')
        results=[]
        while self.procs[dst].mailbox:
            msg=self.procs[dst].mailbox.pop(0)
            results.append(self.syscall(msg.src,msg.kind,msg.body))
        return results
    def release_gate(self,risk0):
        x,blocked=self.lattice.propagate(risk0)
        record=dict(blocked=blocked,max=max(x),x=x,blocked_axes=[a for a,v in zip(AXES,x) if v>=GATE],enforce=ENFORCE,suite_ready=False,step6='approval-required',apply_ticket='blocked-by-risk' if blocked else 'review-only-no-enforcement')
        self.journal.add('gate',**record);return record

def demo():
    lab=MantisOS()
    lab.send('av','av','av.scan',{'bytes':b'EICAR-FIXTURE','name':'synthetic fixture'})
    result={'av':lab.drain('av'),'nonmatch':lab.syscall('av','av.scan',{'bytes':b'hello','name':'memory'}),
            'firewall':lab.syscall('fw','fw.classify',dict(proto='tcp',dst_port=445,direction='out')),
            'vpn':lab.syscall('vpn','vpn.plan',dict(endpoint='vpn.example.invalid:51820',mode='wireguard-plan',dns='9.9.9.9')),
            'gate':lab.release_gate([.2,.1,.1,.25,.45,.3])}
    try:lab.syscall('init','apply',{})
    except PermissionError as e:result['apply_error']=str(e)
    return result

if __name__=='__main__':print(json.dumps(demo(),indent=2))
