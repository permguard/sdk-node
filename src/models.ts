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
  /** Asks for a signed response: base64url without padding, 16 to 64 bytes. */
  requestNonce?: string;
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
  /** How the decision was recorded, when the PDP records evidence. */
  evidence?: Evidence;
}

/** Where a recorded decision sits in its host's evidence stream. */
export interface EvidencePosition {
  hostId: string;
  run: string;
  sequence: string;
}

/** The evidence record of a decision. */
export interface Evidence {
  mode: string;
  status: string;
  recordId?: string;
  position?: EvidencePosition;
}

/** A signed response: the flattened JWS parts over the decision. */
export interface Attestation {
  protected: string;
  payload: string;
  signature: string;
}

export interface Decision {
  decision: boolean;
  requestId?: string;
  context?: DecisionContext;
}

export interface EvaluateResponse extends Decision {
  evaluations: Decision[];
  /** Present when the request carried a nonce and the PDP signed the response. */
  attestation?: Attestation;
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
  version: string;
  component: string;
  state: string;
  stage: string;
  sunset?: string;
  limits: Record<string, number>;
  responseSigning: ResponseSigning;
}

/** Whether the PDP signs a response a request asks it to sign. */
export interface ResponseSigning {
  state: string;
  validitySeconds?: number;
  clockSkewSeconds?: number;
}
