import unittest
from mantis_os import FWService, VPNService, MantisOS
class Regression(unittest.TestCase):
 def test_inbound_default(self):
  f=FWService([])
  self.assertEqual(f.classify(dict(proto='tcp',direction='in',dst_port=443))['action'],'deny')
  self.assertEqual(f.classify(dict(proto='tcp',direction='out',dst_port=443))['action'],'allow')
 def test_invalid_plan_clears_old_config(self):
  v=VPNService();c=dict(endpoint='vpn.example.invalid:51820',mode='wireguard-plan',dns='9.9.9.9')
  self.assertFalse(v.plan(c)['connected'])
  self.assertFalse(v.plan(dict(c,endpoint='user:secret@host:443'))['ok'])
  self.assertEqual(v.cfg,{})
  self.assertFalse(v.plan(dict(c,dns='999.1.1.1'))['ok'])
 def test_apply_stays_denied(self):
  with self.assertRaises(PermissionError):MantisOS().syscall('init','apply',{})
