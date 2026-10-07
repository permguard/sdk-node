// Copyright (c) 2022 Nitro Agility S.r.l.
// SPDX-License-Identifier: Apache-2.0

export class Refusal extends Error {
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
