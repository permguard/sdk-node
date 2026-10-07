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
    try {
      const method = many ? this.client.evaluateMany : this.client.evaluate;
      const response = await method.call(this.client, requestToProto(request), {
        timeout: options.timeoutMs,
        abort: options.signal,
        meta: this.metadata,
      }).response;
      return responseFromProto(response);
    } catch (error) {
      throw mapError(error);
    }
  }

  async getConfiguration(
    options: Required<Pick<CallOptions, "timeoutMs">> & CallOptions,
  ): Promise<Configuration> {
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
      throw mapError(error);
    }
  }

  close(): void {
    this.transport.close();
  }
}

function mapError(error: unknown): Error {
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
  if (code === "UNAUTHENTICATED" || code === "PERMISSION_DENIED") {
    return "authorization";
  }
  if (code === "NOT_FOUND") return "not_found";
  if (code === "UNAVAILABLE" || code === "DEADLINE_EXCEEDED") {
    return "unavailable";
  }
  return "internal";
}
