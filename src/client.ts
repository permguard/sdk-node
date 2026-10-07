// Copyright (c) 2022 Nitro Agility S.r.l.
// SPDX-License-Identifier: Apache-2.0

import type {
  ChannelCredentials,
  ClientOptions as GrpcClientOptions,
} from "@grpc/grpc-js";
import type { ConnectionOptions } from "node:tls";
import { GrpcTransport } from "./grpc-transport";
import { HttpTransport } from "./http-transport";
import type {
  Configuration,
  EvaluateRequest,
  EvaluateResponse,
} from "./models";
import type { CallOptions, Transport } from "./transport";

export interface ClientOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  tls?: ConnectionOptions;
  grpcCredentials?: ChannelCredentials;
  grpcClientOptions?: GrpcClientOptions;
}

export class Client {
  private readonly transport: Transport;
  private readonly timeoutMs: number;

  constructor(endpoint: string, options: ClientOptions = {}) {
    this.timeoutMs = timeout(options.timeoutMs ?? 5_000);
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch (error) {
      throw new TypeError(
        `invalid Permguard endpoint: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!parsed.hostname) {
      throw new TypeError("Permguard endpoint requires a host");
    }
    const headers = { ...(options.headers ?? {}) };
    switch (parsed.protocol) {
      case "http:":
      case "https:":
        this.transport = new HttpTransport(parsed, headers, options.tls);
        break;
      case "grpc:":
      case "grpcs:":
        this.transport = new GrpcTransport(
          parsed,
          headers,
          options.grpcCredentials,
          options.grpcClientOptions,
        );
        break;
      default:
        throw new TypeError(
          `unsupported Permguard endpoint scheme ${parsed.protocol}`,
        );
    }
  }

  evaluate(
    request: EvaluateRequest,
    options: CallOptions = {},
  ): Promise<EvaluateResponse> {
    return this.transport.evaluate(request, false, this.options(options));
  }

  evaluateMany(
    request: EvaluateRequest,
    options: CallOptions = {},
  ): Promise<EvaluateResponse> {
    return this.transport.evaluate(request, true, this.options(options));
  }

  getConfiguration(options: CallOptions = {}): Promise<Configuration> {
    return this.transport.getConfiguration(this.options(options));
  }

  close(): void {
    this.transport.close();
  }

  private options(
    supplied: CallOptions,
  ): Required<Pick<CallOptions, "timeoutMs">> & CallOptions {
    return {
      ...supplied,
      timeoutMs: timeout(supplied.timeoutMs ?? this.timeoutMs),
    };
  }
}

function timeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError("timeoutMs must be greater than zero");
  }
  return value;
}
