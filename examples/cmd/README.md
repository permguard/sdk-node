<!--
Copyright (c) 2022 Nitro Agility S.r.l.
SPDX-License-Identifier: Apache-2.0
-->

# Permguard Node.js SDK example

Build the SDK and install the example:

```bash
cd ../..
npm ci
npm run build
cd examples/cmd
npm install
```

Start a Permguard PDP, then run:

```bash
PERMGUARD_PDP_URL=grpc://localhost:7443 npm start
```

Use an `http://` URL to exercise the JSON binding with the same request.
