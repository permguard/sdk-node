// Copyright (c) 2022 Nitro Agility S.r.l.
// SPDX-License-Identifier: Apache-2.0

import {
  Metadata,
  Server as GrpcServer,
  ServerCredentials,
  type ServerUnaryCall,
  type ServiceDefinition,
  type UntypedServiceImplementation,
  type sendUnaryData,
  status,
} from "@grpc/grpc-js";
import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import {
  Client,
  type EvaluateRequest,
  type EvaluateResponse,
  Refusal,
} from "../src";
import * as pb from "../src/internal/grpc/v1/generated/permguard/data/v1/pdp";
import { requestToJson, requestToProto } from "../src/wire";

test("HTTP implements the native v1 contract and structured refusals", async () => {
  let seenPath = "";
  let seenBody: Record<string, unknown> = {};
  const server = http.createServer((request, response) => {
    seenPath = request.url ?? "";
    if (request.method === "GET") {
      sendJson(response, 200, {
        interface: "permguard.api.pdp.native.v1",
        pdp: "http://test",
        endpoints: { evaluation: "e", evaluations: "es" },
        capabilities: [],
        store_scope: {
          in: "payload",
          zone: "required",
          ledger: "required",
          profile: "optional",
        },
      });
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      seenBody = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
        string,
        unknown
      >;
      if (seenBody.ledger === "bad") {
        sendJson(response, 400, {
          class: "validation",
          code: "ledger_invalid",
          message: "bad ledger",
        });
        return;
      }
      if (seenBody.ledger === "conflict") {
        sendJson(response, 409, {
          code: "ledger_conflict",
          message: "ledger changed",
        });
        return;
      }
      sendJson(response, 200, {
        decision: true,
        request_id: seenBody.request_id,
        context: { policies: ["policy-1"] },
      });
    });
  });
  const port = await listenHttp(server);
  const client = new Client(`http://127.0.0.1:${port}`, {
    headers: { authorization: "Bearer test" },
  });

  try {
    const result = await client.evaluate({
      zone: "acme",
      ledger: "documents",
      requestId: "r1",
    });
    assert.equal(result.decision, true);
    assert.equal(result.requestId, "r1");
    assert.deepEqual(result.context?.policies, ["policy-1"]);
    assert.equal(seenPath, "/access/v1/evaluation");
    assert.equal(seenBody.zone, "acme");

    const configuration = await client.getConfiguration();
    assert.equal(configuration.interface, "permguard.api.pdp.native.v1");
    assert.equal(
      seenPath,
      "/.well-known/permguard-pdp-v1-configuration",
    );

    await assert.rejects(
      client.evaluate({ zone: "acme", ledger: "bad" }),
      (error: unknown) => {
        assert.ok(error instanceof Refusal);
        assert.equal(error.errorClass, "validation");
        assert.equal(error.code, "ledger_invalid");
        assert.equal(error.httpStatus, 400);
        return true;
      },
    );
    await assert.rejects(
      client.evaluate({ zone: "acme", ledger: "conflict" }),
      (error: unknown) => {
        assert.ok(error instanceof Refusal);
        assert.equal(error.errorClass, "conflict");
        assert.equal(error.httpStatus, 409);
        return true;
      },
    );
  } finally {
    client.close();
    await closeHttp(server);
  }
});

test("gRPC uses permguard.data.v1 with batch, discovery, and metadata errors", async () => {
  const server = new GrpcServer();
  let authorization = "";
  const implementation: UntypedServiceImplementation = {
    evaluate(
      call: ServerUnaryCall<pb.EvaluateRequest, pb.EvaluateResponse>,
      callback: sendUnaryData<pb.EvaluateResponse>,
    ): void {
      authorization = String(call.metadata.get("authorization")[0] ?? "");
      if (call.request.ledger === "bad") {
        const metadata = new Metadata();
        metadata.set("permguard-error-class", "validation");
        metadata.set("permguard-error-code", "ledger_invalid");
        callback({
          name: "Error",
          message: "bad ledger",
          code: status.INVALID_ARGUMENT,
          details: "bad ledger",
          metadata,
        });
        return;
      }
      if (call.request.ledger === "conflict") {
        callback({
          name: "Error",
          message: "ledger changed",
          code: status.FAILED_PRECONDITION,
          details: "ledger changed",
          metadata: new Metadata(),
        });
        return;
      }
      callback(
        null,
        pb.EvaluateResponse.create({
          decision: true,
          requestId: call.request.requestId,
          context: pb.DecisionContext.create({ policies: ["policy-1"] }),
        }),
      );
    },
    evaluateMany(
      _call: ServerUnaryCall<pb.EvaluateRequest, pb.EvaluateResponse>,
      callback: sendUnaryData<pb.EvaluateResponse>,
    ): void {
      callback(
        null,
        pb.EvaluateResponse.create({
          decision: false,
          evaluations: [
            pb.Decision.create({ decision: true, requestId: "one" }),
            pb.Decision.create({ decision: false, requestId: "two" }),
          ],
        }),
      );
    },
    getConfiguration(
      _call: ServerUnaryCall<
        pb.GetConfigurationRequest,
        pb.GetConfigurationResponse
      >,
      callback: sendUnaryData<pb.GetConfigurationResponse>,
    ): void {
      callback(
        null,
        pb.GetConfigurationResponse.create({
          interface: "permguard.api.pdp.native.v1",
          pdp: "grpc://test",
        }),
      );
    },
  };
  server.addService(pdpService, implementation);
  const port = await listenGrpc(server);
  const client = new Client(`grpc://127.0.0.1:${port}`, {
    headers: { authorization: "Bearer test" },
  });

  try {
    const result = await client.evaluate({
      zone: "acme",
      ledger: "documents",
      requestId: "r1",
    });
    const batch = await client.evaluateMany({
      zone: "acme",
      ledger: "documents",
      evaluations: [{}, {}],
    });
    const configuration = await client.getConfiguration();

    assert.equal(result.decision, true);
    assert.equal(result.requestId, "r1");
    assert.deepEqual(result.context?.policies, ["policy-1"]);
    assert.equal(authorization, "Bearer test");
    assert.equal(batch.decision, false);
    assert.equal(batch.evaluations.length, 2);
    assert.equal(configuration.interface, "permguard.api.pdp.native.v1");

    await assert.rejects(
      client.evaluate({ zone: "acme", ledger: "bad" }),
      (error: unknown) => {
        assert.ok(error instanceof Refusal);
        assert.equal(error.errorClass, "validation");
        assert.equal(error.code, "ledger_invalid");
        assert.equal(error.grpcCode, "INVALID_ARGUMENT");
        return true;
      },
    );
    await assert.rejects(
      client.evaluate({ zone: "acme", ledger: "conflict" }),
      (error: unknown) => {
        assert.ok(error instanceof Refusal);
        assert.equal(error.errorClass, "conflict");
        assert.equal(error.grpcCode, "FAILED_PRECONDITION");
        return true;
      },
    );
  } finally {
    client.close();
    await closeGrpc(server);
  }
});

test("wire mapping preserves presence and rejects lossy JSON numbers", () => {
  const request: EvaluateRequest = {
    zone: "acme",
    ledger: "documents",
    evaluations: [{ context: {}, partitionInputs: {} }],
  };
  const json = requestToJson(request);
  assert.deepEqual(json.evaluations, [
    { context: {}, partition_inputs: {} },
  ]);

  const proto = requestToProto(request);
  assert.ok(proto.evaluations[0]?.context);
  assert.ok(proto.evaluations[0]?.partitionInputs);

  assert.throws(
    () =>
      requestToProto({
        zone: "acme",
        ledger: "documents",
        context: { unsafe: Number.MAX_SAFE_INTEGER + 1 },
      }),
    /not exactly representable/,
  );
});

test("endpoints reject embedded credentials", () => {
  assert.throws(
    () => new Client("http://user:secret@pdp.example"),
    /must not contain credentials/,
  );
});

const pdpService: ServiceDefinition = {
  evaluate: unaryDefinition(
    "/permguard.data.v1.PolicyDecisionPoint/Evaluate",
    pb.EvaluateRequest,
    pb.EvaluateResponse,
  ),
  evaluateMany: unaryDefinition(
    "/permguard.data.v1.PolicyDecisionPoint/EvaluateMany",
    pb.EvaluateRequest,
    pb.EvaluateResponse,
  ),
  getConfiguration: unaryDefinition(
    "/permguard.data.v1.PolicyDecisionPoint/GetConfiguration",
    pb.GetConfigurationRequest,
    pb.GetConfigurationResponse,
  ),
};

interface BinaryType<T extends object> {
  toBinary(value: T): Uint8Array;
  fromBinary(value: Uint8Array): T;
}

function unaryDefinition<I extends object, O extends object>(
  path: string,
  input: BinaryType<I>,
  output: BinaryType<O>,
) {
  return {
    path,
    requestStream: false,
    responseStream: false,
    requestSerialize: (value: I) => Buffer.from(input.toBinary(value)),
    requestDeserialize: (value: Buffer) => input.fromBinary(value),
    responseSerialize: (value: O) => Buffer.from(output.toBinary(value)),
    responseDeserialize: (value: Buffer) => output.fromBinary(value),
  };
}

function sendJson(
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function listenHttp(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("HTTP test server did not expose a TCP address"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeHttp(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function listenGrpc(server: GrpcServer): Promise<number> {
  return new Promise((resolve, reject) => {
    server.bindAsync(
      "127.0.0.1:0",
      ServerCredentials.createInsecure(),
      (error, port) => (error ? reject(error) : resolve(port)),
    );
  });
}

function closeGrpc(server: GrpcServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.tryShutdown((error) => (error ? reject(error) : resolve()));
  });
}
