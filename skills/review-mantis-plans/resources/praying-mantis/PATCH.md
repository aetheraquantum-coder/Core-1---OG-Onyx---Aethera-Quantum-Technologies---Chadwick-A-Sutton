Network planning corrections: default inbound deny; explicit synthetic policy label; strict endpoint and DNS format validation; stale VPN configuration cleared on invalid input; connected remains false. No Windows or tunnel tests performed. Website classifier additionally accepts synthetic connection state; Python fixture classifier remains stateless. Existing test reports are historical.

2026-10-06 policy schema correction: reject unknown rule keys, malformed protocol
and direction, Boolean/non-integer/out-of-range ports, invalid policy containers,
and empty rule identifiers. This prevents an unsupported port field from silently
acting as an unconditional rule. Nine regression methods were added; all 24
Python methods pass in the Linux cloud build environment. No host firewall or
other enforcement capability was added. This remains an owner-review candidate.
