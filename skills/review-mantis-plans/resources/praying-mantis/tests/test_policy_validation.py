"""Regression tests for fail-closed synthetic policy schema validation."""
import unittest
from mantis_os import FWService

class PolicyValidation(unittest.TestCase):
    def test_unknown_rule_fields_rejected(self):
        for key in ('port', 'command', 'source', ''):
            with self.subTest(key=key), self.assertRaises(ValueError):
                FWService([{'id':'bounded-rule', 'action':'allow', key:443}])

    def test_invalid_protocol_rejected(self):
        for value in ('icmp', 'TCP', '', None, [], True):
            with self.subTest(value=value), self.assertRaises(ValueError):
                FWService([{'id':'rule', 'action':'deny', 'proto':value}])

    def test_invalid_direction_rejected(self):
        for value in ('both', 'IN', '', None, [], True):
            with self.subTest(value=value), self.assertRaises(ValueError):
                FWService([{'id':'rule', 'action':'deny', 'direction':value}])

    def test_invalid_port_rejected(self):
        for value in (True, False, 0, -1, 65536, '443', 443.0, None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                FWService([{'id':'rule', 'action':'allow', 'dst_port':value}])

    def test_invalid_policy_container_rejected(self):
        for value in (None, {}, 'policy', 1):
            with self.subTest(value=value), self.assertRaises(ValueError):
                FWService(value)

    def test_empty_rule_id_rejected(self):
        for value in ('', ' ', None, 1):
            with self.subTest(value=value), self.assertRaises(ValueError):
                FWService([{'id':value, 'action':'allow'}])

    def test_valid_policy_boundaries_preserve_first_match(self):
        for port in (1, 65535):
            policy=[{'id':'specific', 'action':'deny', 'proto':'tcp', 'direction':'out', 'dst_port':port},
                    {'id':'fallback', 'action':'allow'}]
            service=FWService(policy)
            result=service.classify({'proto':'tcp', 'direction':'out', 'dst_port':port})
            self.assertEqual(result['rule'],'specific')
            self.assertEqual(result['action'],'deny')
            self.assertFalse(result['applied'])

    def test_intentional_wildcard_rule_remains_supported(self):
        service=FWService(({'id':'deny-all','action':'deny'},))
        self.assertEqual(service.classify({'proto':'udp','direction':'out','dst_port':53})['action'],'deny')

    def test_policy_is_copied_and_empty_defaults_preserved(self):
        policy=[{'id':'deny-all','action':'deny'}]
        service=FWService(policy)
        policy[0]['action']='allow'
        self.assertEqual(service.classify({'proto':'tcp','direction':'in','dst_port':22})['action'],'deny')
        empty=FWService([])
        self.assertEqual(empty.classify({'proto':'tcp','direction':'in','dst_port':22})['action'],'deny')
        self.assertEqual(empty.classify({'proto':'udp','direction':'out','dst_port':53})['action'],'allow')
