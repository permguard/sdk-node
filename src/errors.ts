// Copyright (c) 2022 Nitro Agility S.r.l.
// SPDX-License-Identifier: Apache-2.0

export class Refusal extends Error {
  /** The class of a call that failed in the client: the data plane did not answer in time, or at all. */
  static readonly UNAVAILABLE = "unavailable";
  /** The code of a call whose timeout passed, the same on HTTP and gRPC and in every Permguard SDK. */
  static readonly TIMEOUT = "timeout";
  /** The code of a call whose data plane could not be reached, the same on HTTP and gRPC. */
  static readonly UNREACHABLE = "unreachable";

  readonly errorClass: string;
  readonly code: string;
  readonly httpStatus?: number;
  readonly grpcCode?: string;

  constructor(
    errorClass: string,
    code: string,
    message: string,
    details: { httpStatus?: number; grpcCode?: string } = {},
  ) {
    super(code ? `${code}: ${message}` : message);
    this.name = "Refusal";
    this.errorClass = errorClass;
    this.code = code;
    this.httpStatus = details.httpStatus;
    this.grpcCode = details.grpcCode;
  }
}
