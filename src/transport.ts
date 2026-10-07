// Copyright (c) 2022 Nitro Agility S.r.l.
// SPDX-License-Identifier: Apache-2.0

import type {
  Configuration,
  EvaluateRequest,
  EvaluateResponse,
} from "./models";

export interface CallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface Transport {
  evaluate(
    request: EvaluateRequest,
    many: boolean,
    options: Required<Pick<CallOptions, "timeoutMs">> & CallOptions,
  ): Promise<EvaluateResponse>;
  getConfiguration(
    options: Required<Pick<CallOptions, "timeoutMs">> & CallOptions,
  ): Promise<Configuration>;
  close(): void;
}
