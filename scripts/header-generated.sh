#!/usr/bin/env bash
# Copyright (c) 2022 Nitro Agility S.r.l.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

for file in "$@"; do
    if head -20 "${file}" | grep -q 'Copyright (c) 2022 Nitro Agility S.r.l.'; then
        continue
    fi

    temporary="$(mktemp)"
    trap 'rm -f "${temporary}"' EXIT
    {
        printf '%s\n' '// Copyright (c) 2022 Nitro Agility S.r.l.'
        printf '%s\n\n' '// SPDX-License-Identifier: Apache-2.0'
        sed -n '1,$p' "${file}"
    } >"${temporary}"
    mv "${temporary}" "${file}"
    trap - EXIT
done
