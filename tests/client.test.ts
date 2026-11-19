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

const sample: EvaluateRequest = {
  zone: "acme",
  ledger: "main",
  subject: { type: "user", id: "amy" },
  resource: { type: "document", id: "report" },
  action: { name: "read" },
};

/// A gRPC PDP that counts its calls and answers after `delayMs`.
async function countingPdp(
  delayMs: number,
): Promise<{ port: number; calls: () => number; server: GrpcServer }> {
  const server = new GrpcServer();
  let calls = 0;
  const answer = (
    call: ServerUnaryCall<pb.EvaluateRequest, pb.EvaluateResponse>,
    callback: sendUnaryData<pb.EvaluateResponse>,
  ): void => {
    calls += 1;
    setTimeout(
      () =>
        callback(
          null,
          pb.EvaluateResponse.create({
            decision: true,
            requestId: call.request.requestId,
          }),
        ),
      delayMs,
    );
  };
  server.addService(pdpService, {
    evaluate: answer,
    evaluateMany: answer,
    getConfiguration: (
      _call: ServerUnaryCall<pb.GetConfigurationRequest, pb.GetConfigurationResponse>,
      callback: sendUnaryData<pb.GetConfigurationResponse>,
    ) => callback(null, pb.GetConfigurationResponse.create({})),
  });
  const port = await listenGrpc(server);
  return { port, calls: () => calls, server };
}

test("gRPC refuses an aborted signal before sending, and an abort in flight (BUG-0304)", async () => {
  const pdp = await countingPdp(300);
  const client = new Client(`grpc://127.0.0.1:${pdp.port}`);
  try {
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(client.evaluate(sample, { signal: aborted.signal }), {
      name: "AbortError",
    });
    assert.equal(pdp.calls(), 0, "nothing reached the server");

    const inFlight = new AbortController();
    const pending = client.evaluate(sample, { signal: inFlight.signal });
    setTimeout(() => inFlight.abort(), 50);
    await assert.rejects(pending, { name: "AbortError" });
  } finally {
    client.close();
    await closeGrpc(pdp.server);
  }
});

test("an unknown evaluations semantic is refused, never decided under execute_all (BUG-0305)", async () => {
  const pdp = await countingPdp(0);
  const client = new Client(`grpc://127.0.0.1:${pdp.port}`);
  try {
    const bogus = {
      ...sample,
      options: { evaluationsSemantic: "first_wins" as never },
    };
    await assert.rejects(client.evaluateMany(bogus), (error: unknown) => {
      assert.ok(error instanceof Refusal);
      assert.equal(error.errorClass, "validation");
      assert.equal(error.code, "payload_malformed");
      return true;
    });
    assert.equal(pdp.calls(), 0, "nothing sent");
  } finally {
    client.close();
    await closeGrpc(pdp.server);
  }
});

test("an HTTP timeout bounds the whole call (BUG-0309)", async () => {
  for (const mode of ["trickle", "headers", "silent"]) {
    const timers: NodeJS.Timeout[] = [];
    const server = http.createServer((_request, response) => {
      if (mode === "silent") return;
      response.writeHead(200, { "content-type": "application/json" });
      if (mode === "trickle") {
        timers.push(setInterval(() => response.write(" "), 100));
      }
    });
    const port = await listenHttp(server);
    const client = new Client(`http://127.0.0.1:${port}`, { timeoutMs: 500 });
    const started = Date.now();
    try {
      await assert.rejects(client.evaluate(sample), /timed out after 500ms/);
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 2000, `${mode}: rejected after ${elapsed}ms`);
    } finally {
      timers.forEach(clearInterval);
      client.close();
      server.closeAllConnections();
      await closeHttp(server);
    }
  }
});

test("an HTTP error whose body is not JSON is a refusal with its status (BUG-0282)", async () => {
  const server = http.createServer((request, response) => {
    const ledger = new URL(request.url ?? "/", "http://x").searchParams.get("l");
    request.resume();
    request.on("end", () => {
      const seen = request.headers["x-case"];
      if (seen === "413") {
        response.writeHead(413, { "content-type": "text/plain" });
        response.end("length limit exceeded");
      } else if (seen === "401") {
        response.writeHead(401);
        response.end();
      } else {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end(ledger ?? "not json");
      }
    });
  });
  const port = await listenHttp(server);
  const client = (value: string) =>
    new Client(`http://127.0.0.1:${port}`, { headers: { "x-case": value } });
  try {
    const big = client("413");
    await assert.rejects(big.evaluate(sample), (error: unknown) => {
      assert.ok(error instanceof Refusal);
      assert.equal(error.httpStatus, 413);
      assert.equal(error.code, "http_status");
      assert.equal(error.errorClass, "internal");
      assert.match(error.message, /length limit exceeded/);
      return true;
    });
    big.close();
    const empty = client("401");
    await assert.rejects(empty.evaluate(sample), (error: unknown) => {
      assert.ok(error instanceof Refusal);
      assert.equal(error.httpStatus, 401);
      assert.equal(error.errorClass, "authorization");
      return true;
    });
    empty.close();
    const ok = client("200");
    await assert.rejects(ok.evaluate(sample), /decode Permguard HTTP response/);
    ok.close();
  } finally {
    await closeHttp(server);
  }
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
