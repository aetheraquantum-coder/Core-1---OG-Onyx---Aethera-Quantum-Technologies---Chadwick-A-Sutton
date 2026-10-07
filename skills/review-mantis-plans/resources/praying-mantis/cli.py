"""Three separate audit-only entry points. No host APIs."""
import argparse,json
from mantis_os import MantisOS
p=argparse.ArgumentParser();sub=p.add_subparsers(dest='service',required=True)
sub.add_parser('antivirus',help='Match a synthetic in-memory fixture; not a file scan')
f=sub.add_parser('firewall');f.add_argument('--direction',choices=['in','out'],default='in');f.add_argument('--port',type=int,default=443);f.add_argument('--protocol',choices=['tcp','udp'],default='tcp')
v=sub.add_parser('vpn-plan');v.add_argument('--endpoint',required=True);v.add_argument('--dns',required=True);v.add_argument('--mode',choices=['wireguard-plan','ikev2-plan'],default='wireguard-plan')
a=p.parse_args();lab=MantisOS()
try:
 if a.service=='antivirus':r=lab.syscall('av','av.scan',dict(bytes=b'EICAR-FIXTURE',name='synthetic-demo-not-official-eicar'))
 elif a.service=='firewall':r=lab.syscall('fw','fw.classify',dict(proto=a.protocol,direction=a.direction,dst_port=a.port))
 else:r=lab.syscall('vpn','vpn.plan',dict(endpoint=a.endpoint,mode=a.mode,dns=a.dns))
 print(json.dumps(r,indent=2))
except ValueError as e:p.error(str(e))
