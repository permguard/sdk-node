// Copyright (c) 2022 Nitro Agility S.r.l.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import * as pb from "../src/internal/grpc/v1/generated/permguard/data/v1/pdp";
import {
  configurationFromJson,
  configurationFromProto,
  requestToJson,
  requestToProto,
  responseFromJson,
  responseFromProto,
} from "../src/wire";

test("the nonce, the attestation and the evidence travel on both transports (BUG-0274)", () => {
  const request = { zone: "z", ledger: "l", requestNonce: "bm9uY2Utb2Ytc2l4dGVlbg" };
  assert.equal(requestToProto(request).requestNonce, "bm9uY2Utb2Ytc2l4dGVlbg");
  assert.equal(requestToJson(request).request_nonce, "bm9uY2Utb2Ytc2l4dGVlbg");
  assert.equal("request_nonce" in requestToJson({ zone: "z", ledger: "l" }), false);

  const fromGrpc = responseFromProto(
    pb.EvaluateResponse.create({
      decision: true,
      context: {
        id: "d-1",
        evidence: {
          mode: "required",
          status: "recorded",
          recordId: "rec-1",
          position: { hostId: "h", run: "r", sequence: "7" },
        },
      },
      attestation: { protected: "p", payload: "b", signature: "s" },
    }),
  );
  const fromHttp = responseFromJson({
    decision: true,
    context: {
      id: "d-1",
      evidence: {
        mode: "required",
        status: "recorded",
        record_id: "rec-1",
        position: { host_id: "h", run: "r", sequence: "7" },
      },
    },
    attestation: { protected: "p", payload: "b", signature: "s" },
  });
  for (const held of [fromGrpc, fromHttp]) {
    assert.deepEqual(held.context?.evidence, {
      mode: "required",
      status: "recorded",
      recordId: "rec-1",
      position: { hostId: "h", run: "r", sequence: "7" },
    });
    assert.deepEqual(held.attestation, { protected: "p", payload: "b", signature: "s" });
  }
});

test("the discovery document is read whole on both transports (BUG-0274)", () => {
  const fromGrpc = configurationFromProto(
    pb.GetConfigurationResponse.create({
      version: "0.1.33",
      component: "data-plane",
      state: "serving",
      stage: "v1",
      limits: { max_evaluations: 64n },
      responseSigning: { state: "optional", validitySeconds: 300, clockSkewSeconds: 30 },
    }),
  );
  const fromHttp = configurationFromJson({
    version: "0.1.33",
    component: "data-plane",
    state: "serving",
    stage: "v1",
    limits: { max_evaluations: 64 },
    response_signing: { state: "optional", validity_seconds: 300, clock_skew_seconds: 30 },
  });
  for (const held of [fromGrpc, fromHttp]) {
    assert.equal(held.version, "0.1.33");
    assert.equal(held.component, "data-plane");
    assert.equal(held.state, "serving");
    assert.equal(held.stage, "v1");
    assert.equal(held.sunset, undefined);
    assert.deepEqual(held.limits, { max_evaluations: 64 });
    assert.deepEqual(held.responseSigning, {
      state: "optional",
      validitySeconds: 300,
      clockSkewSeconds: 30,
    });
  }
});
