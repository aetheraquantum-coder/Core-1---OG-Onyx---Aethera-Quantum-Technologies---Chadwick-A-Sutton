"""Portable inert policy checks; no original workspace or network access needed.

Retains the historical 30,048 valid-policy/flow scenarios and 86 rejection
challenges. An independent declarative first-match oracle replaces the old
unpatched source dependency; this checks intended behavior, not byte equivalence
to a second engine. All input data is synthetic and enforcement stays disabled.
"""
import copy
import importlib.util
import itertools
import json
import pathlib
import random
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "skills/review-mantis-plans/resources/praying-mantis/mantis_os.py"
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("bundled_mantis", SOURCE)
mantis = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mantis
spec.loader.exec_module(mantis)


def require(value, message):
    if not value:
        raise AssertionError(message)


def reject(value):
    try:
        mantis.FWService(value)
    except ValueError:
        return
    raise AssertionError("did not reject: " + repr(value))


def reference(policy, flow):
    """First matching valid rule wins; otherwise use direction's default."""
    matches = [
        rule for rule in policy
        if not any(key in rule and rule[key] != flow[key]
                   for key in ("proto", "direction", "dst_port"))
    ]
    fallback = {"action": "deny", "id": "default-inbound-deny"} if flow["direction"] == "in" else {
        "action": "allow", "id": "default-outbound-allow"
    }
    selected = matches[0] if matches else fallback
    return {
        "flow": copy.deepcopy(flow),
        "action": selected["action"],
        "rule": selected["id"],
        "applied": False,
        "host_status": "unknown",
        "note": "synthetic first-match policy only; no connection tracking, application policy, or host changes",
    }


# The old unsupported `port` field must not silently become a wildcard rule.
reject([{"id": "port-rule", "action": "allow", "port": 443}])

invalid_count = 0
invalid_values = [None, False, True, 0, -1, 1, 65535, 65536, 1.0, 443.0,
                  float("nan"), float("inf"), "", " ", "443", {}, [], (), b"tcp", object()]
for field, valid in [("proto", ("tcp", "udp")), ("direction", ("in", "out")), ("dst_port", (1, 65535))]:
    for value in invalid_values:
        if field == "dst_port" and type(value) is int and 1 <= value <= 65535:
            continue
        if field != "dst_port" and value in valid:
            continue
        reject([{"id": "r", "action": "allow", field: value}])
        invalid_count += 1
for value in [None, False, True, 0, 1, {}, "", "rules", set(), iter([])]:
    reject(value)
    invalid_count += 1
for rule in [{}, {"id": "r"}, {"action": "allow"}, None, 1, [], False,
             {"id": "", "action": "allow"}, {"id": " \t\n", "action": "allow"},
             {"id": "r", "action": "ALLOW"}, {"id": "r", "action": None}]:
    reject([rule])
    invalid_count += 1
for key in ["port", "dst_ports", "state", "profile", "source", "unknown", ""]:
    reject([{"id": "r", "action": "allow", key: 443}])
    invalid_count += 1

# Every partial wildcard, both actions, list/tuple, and default decisions.
choices = [("proto", [None, "tcp", "udp"]), ("direction", [None, "in", "out"]),
           ("dst_port", [None, 1, 22, 53, 443, 445, 65535])]
flows = [dict(proto=p, direction=d, dst_port=n) for p, d, n in itertools.product(
    ["tcp", "udp"], ["in", "out"], [1, 22, 53, 443, 445, 65535])]
valid_comparisons = 0
for action, proto, direction, port in itertools.product(
        ["allow", "deny"], choices[0][1], choices[1][1], choices[2][1]):
    rule = {"id": "valid", "action": action}
    for key, value in [("proto", proto), ("direction", direction), ("dst_port", port)]:
        if value is not None:
            rule[key] = value
    for wrap in (list, tuple):
        policy = wrap([rule])
        service = mantis.FWService(policy)
        for flow in flows:
            saved = copy.deepcopy(flow)
            require(service.classify(flow) == reference(policy, flow), "valid-schema mismatch: " + repr(rule))
            require(flow == saved, "flow mutation")
            valid_comparisons += 1
rng = random.Random(6102026)
for case in range(1000):
    rules = []
    for i in range(rng.randrange(0, 12)):
        rule = {"id": f"r{i}", "action": rng.choice(["allow", "deny"])}
        for key, options in choices:
            value = rng.choice(options)
            if value is not None:
                rule[key] = value
        rules.append(rule)
    service = mantis.FWService(rules)
    for flow in flows:
        saved = copy.deepcopy(flow)
        require(service.classify(flow) == reference(rules, flow), "first-match mismatch")
        require(flow == saved, "flow mutation")
        valid_comparisons += 1

# Intended behavior assertions beyond generated comparisons.
for policy in [[], ()]:
    service = mantis.FWService(policy)
    require(service.classify(dict(proto="tcp", direction="in", dst_port=22))["action"] == "deny", "inbound default")
    require(service.classify(dict(proto="udp", direction="out", dst_port=53))["action"] == "allow", "outbound default")
service = mantis.FWService([{"id": "specific", "action": "deny", "dst_port": 443},
                           {"id": "wildcard", "action": "allow"}])
require(service.classify(dict(proto="udp", direction="in", dst_port=443))["rule"] == "specific", "first-match order")
require(service.classify(dict(proto="udp", direction="in", dst_port=22))["rule"] == "wildcard", "wildcard fallback")
lab = mantis.MantisOS()
result = lab.fw.classify(dict(proto="tcp", direction="out", dst_port=443))
require(result["action"] == "allow" and result["applied"] is False and result["host_status"] == "unknown", "HTTPS behavior")
require(mantis.ENFORCE is False, "enforcement pin")
try:
    for enforce in [False, True]:
        mantis.ENFORCE = enforce
        lab.procs["init"].caps.add(mantis.Cap.APPLY)
        try:
            lab.syscall("init", "apply", {})
        except PermissionError:
            pass
        else:
            raise AssertionError("apply admitted")
finally:
    mantis.ENFORCE = False
require(invalid_count == 86, "rejection scenario count changed")
require(valid_comparisons == 30048, "valid comparison scenario count changed")
print(json.dumps({
    "invalid_inputs_rejected": invalid_count,
    "valid_policy_flow_comparisons": valid_comparisons,
    "comparison_reference": "independent declarative first-match oracle",
    "unsupported_port_field_rejected": True,
    "explicit_defaults_wildcard_first_match_https_checked": True,
    "apply_denied_with_capability_even_when_global_pin_modified": True,
    "network_or_host_operations": False,
}, indent=2))
