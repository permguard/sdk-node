// Copyright (c) 2022 Nitro Agility S.r.l.
// SPDX-License-Identifier: Apache-2.0

import * as http from "node:http";
import * as https from "node:https";
import type { ConnectionOptions } from "node:tls";
import { Refusal } from "./errors";
import type {
  Configuration,
  EvaluateRequest,
  EvaluateResponse,
} from "./models";
import type { CallOptions, Transport } from "./transport";
import {
  configurationFromJson,
  requestToJson,
  responseFromJson,
} from "./wire";

const EVALUATION_PATH = "/access/v1/evaluation";
const EVALUATIONS_PATH = "/access/v1/evaluations";
const CONFIGURATION_PATH = "/.well-known/permguard-pdp-v1-configuration";
const MAX_RESPONSE_BYTES = 16 << 20;

export class HttpTransport implements Transport {
  private readonly base: URL;
  private readonly headers: Record<string, string>;
  private readonly agent: http.Agent | https.Agent;

  constructor(
    endpoint: URL,
    headers: Record<string, string>,
    tls: ConnectionOptions | undefined,
  ) {
    if (
      (endpoint.pathname !== "" && endpoint.pathname !== "/") ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.username ||
      endpoint.password
    ) {
      throw new TypeError(
        "HTTP Permguard endpoint must not contain credentials, a path, query, or fragment",
      );
    }
    this.base = endpoint;
    this.headers = { ...headers };
    this.agent =
      endpoint.protocol === "https:"
        ? new https.Agent({ keepAlive: true, ...tls })
        : new http.Agent({ keepAlive: true });
  }

  async evaluate(
    request: EvaluateRequest,
    many: boolean,
    options: Required<Pick<CallOptions, "timeoutMs">> & CallOptions,
  ): Promise<EvaluateResponse> {
    const payload = await this.call(
      "POST",
      many ? EVALUATIONS_PATH : EVALUATION_PATH,
      requestToJson(request),
      options,
    );
    return responseFromJson(payload);
  }

  async getConfiguration(
    options: Required<Pick<CallOptions, "timeoutMs">> & CallOptions,
  ): Promise<Configuration> {
    return configurationFromJson(
      await this.call("GET", CONFIGURATION_PATH, undefined, options),
    );
  }

  close(): void {
    this.agent.destroy();
  }

  private call(
    method: string,
    path: string,
    payload: Record<string, unknown> | undefined,
    options: Required<Pick<CallOptions, "timeoutMs">> & CallOptions,
  ): Promise<unknown> {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const url = new URL(path, this.base);
    const requester = url.protocol === "https:" ? https.request : http.request;

    return new Promise((resolve, reject) => {
      const request = requester(
        url,
        {
          method,
          agent: this.agent,
          signal: options.signal,
          headers: {
            ...this.headers,
            accept: "application/json",
            ...(body === undefined
              ? {}
              : {
                  "content-type": "application/json",
                  "content-length": Buffer.byteLength(body).toString(),
                }),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_RESPONSE_BYTES) {
              request.destroy(
                new Error(
                  `Permguard HTTP response exceeds ${MAX_RESPONSE_BYTES} bytes`,
                ),
              );
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            clearTimeout(deadline);
            const raw = Buffer.concat(chunks).toString("utf8");
            const status = response.statusCode ?? 0;
            // The status first: an error body need not be JSON, a proxy's or the PDP's own
            // `413` (BUG-0282).
            if (status < 200 || status >= 300) {
              let decoded: unknown;
              try {
                decoded = JSON.parse(raw);
              } catch {
                decoded = undefined;
              }
              reject(refusal(status, decoded, raw));
              return;
            }
            let decoded: unknown;
            try {
              decoded = JSON.parse(raw);
            } catch (error) {
              reject(
                new Error(
                  `decode Permguard HTTP response: ${error instanceof Error ? error.message : String(error)}`,
                ),
              );
              return;
            }
            resolve(decoded);
          });
        },
      );
      // The timeout bounds the whole call, not the time between bytes: a server trickling its
      // answer never keeps it pending past it (BUG-0309).
      // A call that fails in the client is a refusal too, the same as over gRPC and in every
      // Permguard SDK: `unavailable/timeout`, `unavailable/unreachable` (BUG-0284). The caller's
      // own abort stays an `AbortError`.
      let timedOut = false;
      const deadline = setTimeout(() => {
        timedOut = true;
        // With an error, so the request settles even when the answer had already begun.
        request.destroy(new Error(`Permguard request timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
      deadline.unref();
      request.on("error", (error) => {
        clearTimeout(deadline);
        if (options.signal?.aborted) {
          reject(error);
        } else if (timedOut) {
          reject(
            new Refusal(
              Refusal.UNAVAILABLE,
              Refusal.TIMEOUT,
              `the data plane did not answer within ${options.timeoutMs}ms`,
            ),
          );
        } else if (unreachable(error)) {
          reject(
            new Refusal(
              Refusal.UNAVAILABLE,
              Refusal.UNREACHABLE,
              `the data plane could not be reached: ${error.message}`,
            ),
          );
        } else {
          reject(error);
        }
      });
      request.end(body);
    });
  }
}

/// Whether a socket error says the data plane was not reached at all.
function unreachable(error: Error): boolean {
  const code = (error as NodeJS.ErrnoException).code ?? "";
  return [
    "ECONNREFUSED",
    "ECONNRESET",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EPIPE",
  ].includes(code);
}

function refusal(status: number, value: unknown, raw: string): Refusal {
  const payload =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  // A body that is not a JSON object is the message as the server wrote it.
  const body = value === undefined ? raw.trim() : "";
  return new Refusal(
    text(payload.class) || httpClass(status),
    text(payload.code) || "http_status",
    text(payload.message) || body || http.STATUS_CODES[status] || "HTTP request failed",
    { httpStatus: status },
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function httpClass(status: number): string {
  if (status === 400 || status === 422) return "validation";
  if (status === 409) return "conflict";
  if (status === 401 || status === 403) return "authorization";
  if (status === 404) return "not_found";
  if (status === 503 || status === 504) return "unavailable";
  return "internal";
}
