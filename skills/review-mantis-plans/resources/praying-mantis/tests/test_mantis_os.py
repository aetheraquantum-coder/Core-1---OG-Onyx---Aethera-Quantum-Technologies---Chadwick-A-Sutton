import unittest
from mantis_os import MantisOS,Lattice,Cap,ENFORCE
class MantisTests(unittest.TestCase):
 def test_fixture(self):
  r=MantisOS().syscall('av','av.scan',{'bytes':b'EICAR-FIXTURE'});self.assertEqual(r['verdict'],'match');self.assertFalse(r['applied'])
 def test_no_match_not_clean(self):self.assertEqual(MantisOS().syscall('av','av.scan',{'bytes':b'hello'})['verdict'],'no-match')
 def test_firewall(self):
  r=MantisOS().syscall('fw','fw.classify',dict(proto='tcp',dst_port=445,direction='out'));self.assertEqual(r['action'],'deny');self.assertFalse(r['applied'])
 def test_vpn_blocked(self):
  r=MantisOS().syscall('vpn','vpn.plan',dict(endpoint='example.invalid:51820',mode='wireguard-plan',dns='9.9.9.9'));self.assertEqual(r['state'],'blocked_no_enforce')
 def test_apply_even_with_cap(self):
  lab=MantisOS();lab.procs['init'].caps.add(Cap.APPLY)
  with self.assertRaises(PermissionError):lab.syscall('init','apply',{})
 def test_pin_low_score_not_ready(self):
  self.assertFalse(ENFORCE);r=MantisOS().release_gate([0]*6);self.assertFalse(r['blocked']);self.assertFalse(r['suite_ready'])
 def test_nan_and_size_rejected(self):
  for v in ([0]*5,[float('nan')]*6,[float('inf')]*6,[-1]*6):
   with self.subTest(v=v),self.assertRaises(ValueError):Lattice().propagate(v)
 def test_high_risk_blocked(self):self.assertTrue(MantisOS().release_gate([1]*6)['blocked'])
 def test_bus_snapshot(self):
  lab=MantisOS();b={'bytes':b'EICAR-FIXTURE'};lab.send('av','av','av.scan',b);b['bytes']=b'hello';self.assertEqual(lab.drain('av')[0]['verdict'],'match')
 def test_journal_capability(self):
  lab=MantisOS();lab.procs['init'].caps.clear()
  with self.assertRaises(PermissionError):lab.syscall('init','journal',{})
 def test_bus_wrong_capability(self):
  with self.assertRaises(PermissionError):MantisOS().send('init','av','av.scan',{})
 def test_vpn_invalid_clears_state(self):
  lab=MantisOS();lab.vpn.plan(dict(endpoint='example.invalid:51820',mode='wireguard-plan',dns='x'));lab.vpn.plan(dict(endpoint='x',mode='unknown',dns='x'));self.assertEqual(lab.vpn.cfg,{});self.assertEqual(lab.vpn.state,'down')
