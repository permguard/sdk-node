<!--
Copyright (c) 2022 Nitro Agility S.r.l.
SPDX-License-Identifier: Apache-2.0
-->

# Permguard Node.js SDK

The official Node.js client for the stateless Permguard PDP interface
`permguard.api.pdp.native.v1`.

One public API supports both server bindings:

- `http://` and `https://` use JSON;
- `grpc://` and `grpcs://` use `permguard.data.v1.PolicyDecisionPoint`.

## Requirements

Node.js 20 or newer.

## Installation

```bash
npm install @permguard/permguard
```

## Evaluate one request

```typescript
import { Client } from "@permguard/permguard";

const client = new Client("grpc://localhost:7443");
// Use http://localhost:7443 for the HTTP/JSON binding.

try {
  const response = await client.evaluate({
    zone: "acme",
    ledger: "documents",
    subject: { type: "user", id: "amy@example.com" },
    resource: { type: "document", id: "quarterly-report" },
    action: { name: "read" },
  });
  console.log("permitted:", response.decision);
} finally {
  client.close();
}
```

A deny is a successful response with `decision === false`. Validation,
authorization, availability, and server failures reject with `Refusal`, which
preserves the stable error class and code.

## Partition inputs

Runtime data is addressed to the partition name declared by the ledger profile:

```typescript
const response = await client.evaluate({
  zone: "acme",
  ledger: "documents",
  partitionInputs: {
    authorization: {
      type: "permguard.cedar.entities.v1",
      data: [
        {
          uid: { type: "Team", id: "engineering" },
          attrs: { active: true },
          parents: [],
        },
      ],
    },
  },
});
```

The map key is the partition name from the selected profile. `type` asserts the
partition input contract; it does not select a policy runtime.

## Evaluate a batch

```typescript
import { EvaluationsSemantic } from "@permguard/permguard";

const response = await client.evaluateMany({
  zone: "acme",
  ledger: "documents",
  subject: { type: "user", id: "amy@example.com" },
  evaluations: [
    {
      resource: { type: "document", id: "one" },
      action: { name: "read" },
      requestId: "one",
    },
    {
      resource: { type: "document", id: "two" },
      action: { name: "read" },
      requestId: "two",
    },
  ],
  options: { evaluationsSemantic: EvaluationsSemantic.ExecuteAll },
});
```

An evaluation with no `partitionInputs` inherits the request defaults. An
explicit empty object replaces the defaults with no inputs; this distinction is
preserved over both HTTP and gRPC.

## Discovery, timeouts, and metadata

```typescript
const client = new Client("https://pdp.example.com", {
  timeoutMs: 5_000,
  headers: { authorization: `Bearer ${token}` },
});

const configuration = await client.getConfiguration();
const response = await client.evaluate(request, {
  timeoutMs: 1_000,
  signal: abortController.signal,
});
```

Static headers are carried as HTTP headers or gRPC metadata. TLS options for
HTTPS and custom `ChannelCredentials` for gRPCS can be supplied through the
constructor.

## Compatibility

This major version implements `permguard.api.pdp.native.v1`. Compatibility is
tied to that versioned interface rather than to a server minor version.

## Development

```bash
npm ci
npm run generate-grpc
npm run typecheck
npm test
npm pack --dry-run
```

The protobuf source mirrors the native stateless contract in the Permguard
server repository. Regenerate bindings whenever it changes.

## License

Apache License 2.0. See [LICENSE](LICENSE), [NOTICE.md](NOTICE.md), and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
