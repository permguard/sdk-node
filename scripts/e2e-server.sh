#!/usr/bin/env bash
# Copyright (c) 2022 Nitro Agility S.r.l.
# SPDX-License-Identifier: Apache-2.0
#
# Starts the Permguard release this SDK pins (PERMGUARD_CONTRACT) as one all-in-one process on
# loopback, publishes a ledger `e2e/policies` that permits `User:alice` to `read` and nothing else,
# and waits until the Data Plane serves it over HTTP and gRPC on 127.0.0.1:7443, or 7443 plus
# E2E_PORT_OFFSET when another server holds the usual ports. Prints the directory it
# works in; `scripts/e2e-server.sh stop <directory>` stops the server.
set -euo pipefail

if [[ "${1:-}" == "stop" ]]; then
  kill "$(cat "$2/server.pid")" 2>/dev/null || true
  exit 0
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
tag="$(tr -d '[:space:]' < "$root/PERMGUARD_CONTRACT")"
work="${1:-$(mktemp -d)}"
mkdir -p "$work/bin" "$work/ws"
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform="Linux_x86_64" ;;
  Linux-aarch64) platform="Linux_arm64" ;;
  Darwin-arm64) platform="Darwin_arm64" ;;
  Darwin-x86_64) platform="Darwin_x86_64" ;;
  *) echo "no Permguard release for $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac
for package in all_in_one cli; do
  if [[ ! -x "$work/bin/$([[ $package == cli ]] && echo permguard || echo permguard-all-in-one)" ]]; then
    curl -fsSL "https://github.com/permguard/permguard/releases/download/${tag}/permguard_${package}_${platform}.tar.gz" \
      | tar -xz -C "$work/bin"
  fi
done
curl -fsSL "https://raw.githubusercontent.com/permguard/permguard/${tag}/crates/permguard-all-in-one/config.local.yml" \
  -o "$work/config.yml"
offset="${E2E_PORT_OFFSET:-0}"
for port in 5443 5444 6443 7443 8443; do
  perl -pi -e "s/127\.0\.0\.1:${port}\b/127.0.0.1:$((port + offset))/g" "$work/config.yml"
done
control="http://127.0.0.1:$((6443 + offset))"
data="http://127.0.0.1:$((7443 + offset))"

# The catalog's commands name the Control Plane; a workspace's reach it through its remote.
pg() { "$work/bin/permguard" --control-endpoint "$control" "$@"; }
ws() { "$work/bin/permguard" -w "$work/ws" "$@"; }
(cd "$work" && exec "$work/bin/permguard-all-in-one" "$work/config.yml" > "$work/server.log" 2>&1) &
echo $! > "$work/server.pid"
for _ in $(seq 1 120); do
  if ! kill -0 "$(cat "$work/server.pid")" 2>/dev/null; then
    echo "the server stopped; its log:" >&2
    tail -20 "$work/server.log" >&2
    exit 1
  fi
  if curl -fsS "$data/.well-known/permguard-pdp-v1-configuration" > /dev/null 2>&1 \
    && pg zones list > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

pg zones create e2e > /dev/null
pg ledgers create policies --zone e2e > /dev/null
ws init policies --language cedar > /dev/null
cat > "$work/ws/cedar/policies.cedar" <<'CEDAR'
@alias("alice-reads")
permit (
    principal == User::"alice",
    action == Action::"read",
    resource
);
CEDAR
ws remote add origin "$control" > /dev/null
ws checkout origin/e2e/policies > /dev/null
ws apply -m "e2e policies" > /dev/null

# Served once the Data Plane mirrored the ledger: alice's read is permitted.
request='{"zone":"e2e","ledger":"policies","subject":{"type":"User","id":"alice"},"action":{"name":"read"},"resource":{"type":"Document","id":"d"}}'
for _ in $(seq 1 120); do
  if curl -fsS -X POST "$data/access/v1/evaluation" -H 'content-type: application/json' \
    -d "$request" 2>/dev/null | grep -q '"decision":true'; then
    echo "$work"
    exit 0
  fi
  sleep 1
done
echo "the Data Plane never served the e2e ledger; the server's log:" >&2
tail -50 "$work/server.log" >&2
exit 1
