#!/usr/bin/env bash
# Copyright (c) 2022 Nitro Agility S.r.l.
# SPDX-License-Identifier: Apache-2.0
#
# Checks that this SDK's copy of `pdp.proto` is the contract of the Permguard release
# PERMGUARD_CONTRACT names, byte for byte once the language's own `option` lines are left out
# (BUG-0077). Usage: scripts/check-contract.sh <the SDK's pdp.proto>
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
copy="$1"
tag="$(tr -d '[:space:]' < "$root/PERMGUARD_CONTRACT")"
pinned="$(mktemp)"
trap 'rm -f "$pinned"' EXIT
curl -fsSL "https://raw.githubusercontent.com/permguard/permguard/${tag}/contracts/proto/permguard/data/v1/pdp.proto" \
  -o "$pinned"
if ! grep -v '^option ' "$copy" | diff -u "$pinned" -; then
  echo "${copy} is not the pdp.proto of Permguard ${tag}: copy it again from the release and regenerate" >&2
  exit 1
fi
echo "${copy} is the pdp.proto of Permguard ${tag}"
