// Copyright (c) 2022 Nitro Agility S.r.l.
// SPDX-License-Identifier: Apache-2.0

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface Entity {
  type: string;
  id: string;
  properties?: JsonObject;
}

export interface Action {
  name: string;
  properties?: JsonObject;
}

export interface PartitionInput {
  type: string;
  data?: JsonValue;
}

export type PartitionInputs = Record<string, PartitionInput>;

export interface Evaluation {
  subject?: Entity;
  resource?: Entity;
  action?: Action;
  context?: JsonObject;
  partitionInputs?: PartitionInputs;
  requestId?: string;
}

export enum EvaluationsSemantic {
  ExecuteAll = "execute_all",
  DenyOnFirstDeny = "deny_on_first_deny",
  PermitOnFirstPermit = "permit_on_first_permit",
}

export interface EvaluationOptions {
  evaluationsSemantic?: EvaluationsSemantic;
}

export interface EvaluateRequest {
  zone: string;
  ledger: string;
  profile?: string;
  subject?: Entity;
  resource?: Entity;
  action?: Action;
  context?: JsonObject;
  principal?: Entity;
  partitionInputs?: PartitionInputs;
  evaluations?: Evaluation[];
  options?: EvaluationOptions;
  requestId?: string;
}

export interface Reason {
  code: string;
  message: string;
}

export interface DecisionContext {
  id?: string;
  reasonAdmin?: Reason;
  reasonUser?: Reason;
  policies: string[];
  absentInputs: string[];
}

export interface Decision {
  decision: boolean;
  requestId?: string;
  context?: DecisionContext;
}

export interface EvaluateResponse extends Decision {
  evaluations: Decision[];
}

export interface Endpoints {
  evaluation: string;
  evaluations: string;
}

export interface StoreScope {
  in: string;
  zone: string;
  ledger: string;
  profile: string;
}

export interface Configuration {
  interface: string;
  pdp: string;
  endpoints: Endpoints;
  capabilities: string[];
  storeScope: StoreScope;
}
