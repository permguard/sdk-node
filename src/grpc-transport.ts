// Copyright (c) 2022 Nitro Agility S.r.l.
// SPDX-License-Identifier: Apache-2.0

import {
  ChannelCredentials,
  type ClientOptions,
} from "@grpc/grpc-js";
import { GrpcTransport as ProtobufGrpcTransport } from "@protobuf-ts/grpc-transport";
import { RpcError, type RpcMetadata } from "@protobuf-ts/runtime-rpc";
import { Refusal } from "./errors";
import { PolicyDecisionPointClient } from "./internal/grpc/v1/generated/permguard/data/v1/pdp.client";
import { GetConfigurationRequest } from "./internal/grpc/v1/generated/permguard/data/v1/pdp";
import type {
  Configuration,
  EvaluateRequest,
  EvaluateResponse,
} from "./models";
import type { CallOptions, Transport } from "./transport";
import {
  configurationFromProto,
  requestToProto,
  responseFromProto,
} from "./wire";

const ERROR_CLASS = "permguard-error-class";
const ERROR_CODE = "permguard-error-code";

export class GrpcTransport implements Transport {
  private readonly transport: ProtobufGrpcTransport;
  private readonly client: PolicyDecisionPointClient;
  private readonly metadata: RpcMetadata;

  constructor(
    endpoint: URL,
    headers: Record<string, string>,
    credentials: ChannelCredentials | undefined,
    clientOptions: ClientOptions | undefined,
  ) {
    if (
      (endpoint.pathname !== "" && endpoint.pathname !== "/") ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.username ||
      endpoint.password
    ) {
      throw new TypeError(
        "gRPC Permguard endpoint must not contain credentials, a path, query, or fragment",
      );
    }
    const secure = endpoint.protocol === "grpcs:";
    if (!secure && credentials !== undefined) {
      throw new TypeError("gRPC credentials require a grpcs:// endpoint");
    }
    this.transport = new ProtobufGrpcTransport({
      host: endpoint.host,
      channelCredentials:
        credentials ??
        (secure
          ? ChannelCredentials.createSsl()
          : ChannelCredentials.createInsecure()),
      clientOptions,
    });
    this.client = new PolicyDecisionPointClient(this.transport);
    this.metadata = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
    );
  }

  async evaluate(
    request: EvaluateRequest,
    many: boolean,
    options: Required<Pick<CallOptions, "timeoutMs">> & CallOptions,
  ): Promise<EvaluateResponse> {
    refuseAborted(options.signal);
    try {
      const method = many ? this.client.evaluateMany : this.client.evaluate;
      const response = await method.call(this.client, requestToProto(request), {
        timeout: options.timeoutMs,
        abort: options.signal,
        meta: this.metadata,
      }).response;
      return responseFromProto(response);
    } catch (error) {
      throw mapError(error, options.signal);
    }
  }

  async getConfiguration(
    options: Required<Pick<CallOptions, "timeoutMs">> & CallOptions,
  ): Promise<Configuration> {
    refuseAborted(options.signal);
    try {
      const response = await this.client.getConfiguration(
        GetConfigurationRequest.create(),
        {
          timeout: options.timeoutMs,
          abort: options.signal,
          meta: this.metadata,
        },
      ).response;
      return configurationFromProto(response);
    } catch (error) {
      throw mapError(error, options.signal);
    }
  }

  close(): void {
    this.transport.close();
  }
}

/// An abort, as the HTTP transport rejects one: a `DOMException` named `AbortError` (BUG-0304).
function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error && reason.name === "AbortError") return reason;
  return new DOMException("This operation was aborted", "AbortError");
}

/// A signal aborted before the call is refused before anything is sent: the gRPC library only
/// listens for an abort to come (BUG-0304).
function refuseAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal);
}

function mapError(error: unknown, signal?: AbortSignal): Error {
  if (signal?.aborted) return abortError(signal);
  if (!(error instanceof RpcError)) {
    return error instanceof Error ? error : new Error(String(error));
  }
  return new Refusal(
    first(error.meta[ERROR_CLASS]) || grpcClass(error.code),
    first(error.meta[ERROR_CODE]) || error.code.toLowerCase(),
    error.message,
    { grpcCode: error.code },
  );
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function grpcClass(code: string): string {
  if (code === "INVALID_ARGUMENT" || code === "OUT_OF_RANGE") {
    return "validation";
  }
  if (
    code === "FAILED_PRECONDITION" ||
    code === "ALREADY_EXISTS" ||
    code === "ABORTED"
  ) {
    return "conflict";
  }
  if (code === "UNAUTHENTICATED" || code === "PERMISSION_DENIED") {
    return "authorization";
  }
  if (code === "NOT_FOUND") return "not_found";
  if (code === "UNAVAILABLE" || code === "DEADLINE_EXCEEDED") {
    return "unavailable";
  }
  return "internal";
}
