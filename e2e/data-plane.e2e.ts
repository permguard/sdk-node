// Copyright (c) 2022 Nitro Agility S.r.l.
// SPDX-License-Identifier: Apache-2.0

// Against a real data plane: `scripts/e2e-server.sh` starts it from the Permguard release
// PERMGUARD_CONTRACT pins, serving a ledger `e2e/policies` that permits `User:alice` to `read`
// (BUG-0077). Run with `npm run test:e2e`.

import assert from "node:assert/strict";
import test from "node:test";
import { Client, type EvaluateRequest, Refusal } from "../src";

function endpoints(): Record<string, string> {
  const http = process.env.E2E_HTTP;
  const grpc = process.env.E2E_GRPC;
  if (!http || !grpc) {
    throw new Error("E2E_HTTP and E2E_GRPC name the data plane scripts/e2e-server.sh started");
  }
  return { HTTP: http, gRPC: grpc };
}

function ask(id: string): EvaluateRequest {
  return {
    zone: "e2e",
    ledger: "policies",
    subject: { type: "User", id },
    resource: { type: "Document", id: "d" },
    action: { name: "read" },
  };
}

async function refusalCode(call: Promise<unknown>): Promise<string> {
  try {
    await call;
  } catch (error) {
    assert.ok(error instanceof Refusal, `expected a refusal, got ${error}`);
    return error.code;
  }
  assert.fail("expected a refusal, got an answer");
}

// Over both transports: a permit with its decision evidence, a deny, a batch, a refusal, a request
// for a signed response, and the discovery document (BUG-0077, BUG-0274).
for (const [name, endpoint] of Object.entries(endpoints())) {
  test(`against a real data plane over ${name}`, async () => {
    const client = new Client(endpoint);
    try {
      const permit = await client.evaluate(ask("alice"));
      assert.equal(permit.decision, true, "alice reads");
      assert.ok(permit.context?.evidence?.status, "the decision's evidence");
      assert.equal((await client.evaluate(ask("bob"))).decision, false, "bob reads");

      const many = await client.evaluateMany({
        ...ask("alice"),
        evaluations: [
          { subject: { type: "User", id: "alice" } },
          { subject: { type: "User", id: "bob" } },
        ],
      });
      assert.deepEqual(
        many.evaluations.map((item) => item.decision),
        [true, false],
        "the batch",
      );

      const missing = { ...ask("alice"), ledger: "nope" };
      assert.equal(await refusalCode(client.evaluate(missing)), "ledger_not_served");

      // The nonce reaches the plane: a signed response is addressed to an authenticated caller,
      // and this one presents no token, so the plane refuses rather than answer unsigned. The
      // attestation's mapping is the unit tests'.
      const signed = { ...ask("alice"), requestNonce: "ZTJlLW5vbmNlLTE2LWJ5dGVz" };
      assert.equal(await refusalCode(client.evaluate(signed)), "unauthenticated");

      const configuration = await client.getConfiguration();
      assert.ok(configuration.version, "the version");
      assert.ok(configuration.stage, "the stage");
      assert.ok((configuration.limits.max_evaluations ?? 0) > 0, "the limits");
      assert.ok(configuration.responseSigning.state, "the response signing");
    } finally {
      client.close();
    }
  });
}
