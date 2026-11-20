// Copyright (c) 2022 Nitro Agility S.r.l.
// SPDX-License-Identifier: Apache-2.0

import { Refusal } from "./errors";
import { Struct, Value } from "./internal/grpc/v1/generated/google/protobuf/struct";
import * as pb from "./internal/grpc/v1/generated/permguard/data/v1/pdp";
import {
  type Action,
  type Attestation,
  type Configuration,
  type Decision,
  type DecisionContext,
  type Entity,
  type EvaluateRequest,
  type EvaluateResponse,
  type Evaluation,
  EvaluationsSemantic,
  type Evidence,
  type JsonObject,
  type JsonValue,
  type PartitionInput,
  type PartitionInputs,
  type Reason,
  type ResponseSigning,
} from "./models";

type WireObject = Record<string, unknown>;

export function requestToJson(request: EvaluateRequest): WireObject {
  validateRequest(request);
  const result: WireObject = { zone: request.zone, ledger: request.ledger };
  put(result, "profile", request.profile);
  put(result, "subject", entityToJson(request.subject));
  put(result, "resource", entityToJson(request.resource));
  put(result, "action", actionToJson(request.action));
  put(result, "context", request.context);
  put(result, "principal", entityToJson(request.principal));
  put(result, "partition_inputs", inputsToJson(request.partitionInputs));
  if (request.evaluations !== undefined) {
    result.evaluations = request.evaluations.map(evaluationToJson);
  }
  if (request.options?.evaluationsSemantic !== undefined) {
    result.options = {
      evaluations_semantic: request.options.evaluationsSemantic,
    };
  }
  put(result, "request_id", request.requestId);
  put(result, "request_nonce", request.requestNonce);
  return result;
}

export function responseFromJson(value: unknown): EvaluateResponse {
  const payload = object(value, "evaluation response");
  return {
    decision: Boolean(payload.decision),
    requestId: optionalString(payload.request_id),
    context: contextFromJson(payload.context),
    evaluations: array(payload.evaluations).map(decisionFromJson),
    attestation: attestationFromJson(payload.attestation),
  };
}

export function configurationFromJson(value: unknown): Configuration {
  const payload = object(value, "configuration response");
  const endpoints = optionalObject(payload.endpoints);
  const scope = optionalObject(payload.store_scope);
  return {
    interface: string(payload.interface),
    pdp: string(payload.pdp),
    endpoints: {
      evaluation: string(endpoints.evaluation),
      evaluations: string(endpoints.evaluations),
    },
    capabilities: array(payload.capabilities).map(string),
    storeScope: {
      in: string(scope.in),
      zone: string(scope.zone),
      ledger: string(scope.ledger),
      profile: string(scope.profile),
    },
    version: string(payload.version),
    component: string(payload.component),
    state: string(payload.state),
    stage: string(payload.stage),
    sunset: optionalString(payload.sunset),
    limits: Object.fromEntries(
      Object.entries(optionalObject(payload.limits)).map(([name, value]) => [
        name,
        typeof value === "number" ? value : 0,
      ]),
    ),
    responseSigning: signingFromJson(payload.response_signing),
  };
}

export function requestToProto(request: EvaluateRequest): pb.EvaluateRequest {
  validateRequest(request);
  return pb.EvaluateRequest.create({
    zone: request.zone,
    ledger: request.ledger,
    profile: request.profile ?? "",
    subject: entityToProto(request.subject),
    resource: entityToProto(request.resource),
    action: actionToProto(request.action),
    context: structToProto(request.context),
    principal: entityToProto(request.principal),
    evaluations: (request.evaluations ?? []).map(evaluationToProto),
    evaluationsSemantic: semanticToProto(
      request.options?.evaluationsSemantic,
    ),
    requestId: request.requestId ?? "",
    partitionInputs: inputsToProto(request.partitionInputs),
    requestNonce: request.requestNonce ?? "",
  });
}

export function responseFromProto(response: pb.EvaluateResponse): EvaluateResponse {
  return {
    decision: response.decision,
    requestId: response.requestId || undefined,
    context: contextFromProto(response.context),
    evaluations: response.evaluations.map(decisionFromProto),
    attestation:
      response.attestation === undefined
        ? undefined
        : {
            protected: response.attestation.protected,
            payload: response.attestation.payload,
            signature: response.attestation.signature,
          },
  };
}

export function configurationFromProto(
  response: pb.GetConfigurationResponse,
): Configuration {
  return {
    interface: response.interface,
    pdp: response.pdp,
    endpoints: {
      evaluation: response.endpoints?.evaluation ?? "",
      evaluations: response.endpoints?.evaluations ?? "",
    },
    capabilities: [...response.capabilities],
    storeScope: {
      in: response.storeScope?.in ?? "",
      zone: response.storeScope?.zone ?? "",
      ledger: response.storeScope?.ledger ?? "",
      profile: response.storeScope?.profile ?? "",
    },
    version: response.version,
    component: response.component,
    state: response.state,
    stage: response.stage,
    sunset: response.sunset,
    limits: Object.fromEntries(
      Object.entries(response.limits).map(([name, value]) => [name, Number(value)]),
    ),
    responseSigning: {
      state: response.responseSigning?.state ?? "",
      validitySeconds: response.responseSigning?.validitySeconds || undefined,
      clockSkewSeconds: response.responseSigning?.clockSkewSeconds || undefined,
    },
  };
}

function entityToJson(value: Entity | undefined): WireObject | undefined {
  if (value === undefined) return undefined;
  const result: WireObject = { type: value.type, id: value.id };
  put(result, "properties", value.properties);
  return result;
}

function actionToJson(value: Action | undefined): WireObject | undefined {
  if (value === undefined) return undefined;
  const result: WireObject = { name: value.name };
  put(result, "properties", value.properties);
  return result;
}

function inputToJson(value: PartitionInput): WireObject {
  const result: WireObject = { type: value.type };
  put(result, "data", value.data);
  return result;
}

function inputsToJson(
  values: PartitionInputs | undefined,
): WireObject | undefined {
  if (values === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, inputToJson(value)]),
  );
}

function evaluationToJson(value: Evaluation): WireObject {
  const result: WireObject = {};
  put(result, "subject", entityToJson(value.subject));
  put(result, "resource", entityToJson(value.resource));
  put(result, "action", actionToJson(value.action));
  put(result, "context", value.context);
  put(result, "partition_inputs", inputsToJson(value.partitionInputs));
  put(result, "request_id", value.requestId);
  return result;
}

function entityToProto(value: Entity | undefined): pb.Entity | undefined {
  if (value === undefined) return undefined;
  return pb.Entity.create({
    type: value.type,
    id: value.id,
    properties: structToProto(value.properties),
  });
}

function actionToProto(value: Action | undefined): pb.Action | undefined {
  if (value === undefined) return undefined;
  return pb.Action.create({
    name: value.name,
    properties: structToProto(value.properties),
  });
}

function inputToProto(value: PartitionInput): pb.PartitionInput {
  return pb.PartitionInput.create({
    type: value.type,
    data: value.data === undefined ? undefined : Value.fromJson(value.data),
  });
}

function inputsToProto(
  values: PartitionInputs | undefined,
): Record<string, pb.PartitionInput> {
  if (values === undefined) return {};
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, inputToProto(value)]),
  );
}

function evaluationToProto(value: Evaluation): pb.Evaluation {
  return pb.Evaluation.create({
    subject: entityToProto(value.subject),
    resource: entityToProto(value.resource),
    action: actionToProto(value.action),
    context: structToProto(value.context),
    partitionInputs:
      value.partitionInputs === undefined
        ? undefined
        : pb.PartitionInputs.create({ inputs: inputsToProto(value.partitionInputs) }),
    requestId: value.requestId ?? "",
  });
}

function structToProto(value: JsonObject | undefined): Struct | undefined {
  return value === undefined ? undefined : Struct.fromJson(value);
}

function semanticToProto(
  value: EvaluationsSemantic | undefined,
): pb.EvaluationsSemantic {
  switch (value) {
    case undefined:
      return pb.EvaluationsSemantic.UNSPECIFIED;
    case EvaluationsSemantic.ExecuteAll:
      return pb.EvaluationsSemantic.EXECUTE_ALL;
    case EvaluationsSemantic.DenyOnFirstDeny:
      return pb.EvaluationsSemantic.DENY_ON_FIRST_DENY;
    case EvaluationsSemantic.PermitOnFirstPermit:
      return pb.EvaluationsSemantic.PERMIT_ON_FIRST_PERMIT;
    default:
      // A semantic this SDK does not know is refused as the PDP refuses it over HTTP, never sent
      // as unspecified and decided under `execute_all` (BUG-0305).
      throw new Refusal(
        "validation",
        "payload_malformed",
        `unknown evaluations semantic ${JSON.stringify(value)}: execute_all, deny_on_first_deny or permit_on_first_permit`,
      );
  }
}

function decisionFromJson(value: unknown): Decision {
  const payload = object(value, "evaluation decision");
  return {
    decision: Boolean(payload.decision),
    requestId: optionalString(payload.request_id),
    context: contextFromJson(payload.context),
  };
}

function contextFromJson(value: unknown): DecisionContext | undefined {
  if (value === undefined || value === null) return undefined;
  const payload = object(value, "decision context");
  return {
    id: optionalString(payload.id),
    reasonAdmin: reasonFromJson(payload.reason_admin),
    reasonUser: reasonFromJson(payload.reason_user),
    policies: array(payload.policies).map(string),
    absentInputs: array(payload.absent_inputs).map(string),
    evidence: evidenceFromJson(payload.evidence),
  };
}

function evidenceFromJson(value: unknown): Evidence | undefined {
  if (value === undefined || value === null) return undefined;
  const payload = object(value, "decision evidence");
  const position =
    payload.position === undefined || payload.position === null
      ? undefined
      : object(payload.position, "evidence position");
  return {
    mode: string(payload.mode),
    status: string(payload.status),
    recordId: optionalString(payload.record_id),
    position: position && {
      hostId: string(position.host_id),
      run: string(position.run),
      sequence: string(position.sequence),
    },
  };
}

function attestationFromJson(value: unknown): Attestation | undefined {
  if (value === undefined || value === null) return undefined;
  const payload = object(value, "attestation");
  return {
    protected: string(payload.protected),
    payload: string(payload.payload),
    signature: string(payload.signature),
  };
}

function signingFromJson(value: unknown): ResponseSigning {
  const payload = optionalObject(value);
  const seconds = (field: unknown): number | undefined =>
    typeof field === "number" && field > 0 ? field : undefined;
  return {
    state: string(payload.state),
    validitySeconds: seconds(payload.validity_seconds),
    clockSkewSeconds: seconds(payload.clock_skew_seconds),
  };
}

function reasonFromJson(value: unknown): Reason | undefined {
  if (value === undefined || value === null) return undefined;
  const payload = object(value, "decision reason");
  return { code: string(payload.code), message: string(payload.message) };
}

function decisionFromProto(value: pb.Decision): Decision {
  return {
    decision: value.decision,
    requestId: value.requestId || undefined,
    context: contextFromProto(value.context),
  };
}

function contextFromProto(
  value: pb.DecisionContext | undefined,
): DecisionContext | undefined {
  if (value === undefined) return undefined;
  return {
    id: value.id || undefined,
    reasonAdmin: reasonFromProto(value.reasonAdmin),
    reasonUser: reasonFromProto(value.reasonUser),
    policies: [...value.policies],
    absentInputs: [...value.absentInputs],
    evidence:
      value.evidence === undefined
        ? undefined
        : {
            mode: value.evidence.mode,
            status: value.evidence.status,
            recordId: value.evidence.recordId,
            position: value.evidence.position && {
              hostId: value.evidence.position.hostId,
              run: value.evidence.position.run,
              sequence: value.evidence.position.sequence,
            },
          },
  };
}

function reasonFromProto(value: pb.Reason | undefined): Reason | undefined {
  if (value === undefined) return undefined;
  return { code: value.code, message: value.message };
}

function validateRequest(request: EvaluateRequest): void {
  if (!request || typeof request !== "object") {
    throw new TypeError("Permguard evaluation request is required");
  }
  // An absent member is left out; a value inside one that is not JSON is refused.
  const present = (value: unknown): void => {
    if (value !== undefined) validateJson(value);
  };
  present(request.context);
  present(request.subject?.properties);
  present(request.resource?.properties);
  present(request.action?.properties);
  present(request.principal?.properties);
  for (const input of Object.values(request.partitionInputs ?? {})) {
    present(input.data);
  }
  for (const evaluation of request.evaluations ?? []) {
    present(evaluation.context);
    present(evaluation.subject?.properties);
    present(evaluation.resource?.properties);
    present(evaluation.action?.properties);
    for (const input of Object.values(evaluation.partitionInputs ?? {})) {
      present(input.data);
    }
  }
}

/// The largest integer both transports carry exactly, the server's bound: 2^53 (BUG-0306).
const EXACT = 2 ** 53;

/// A value the PDP takes, checked the same before either transport sends it, with the codes the
/// PDP answers over HTTP (BUG-0306, BUG-0307): an integer past ±2^53 is `value_unrepresentable`;
/// what is not JSON at all (NaN, Infinity, `undefined`, a function, a symbol, a BigInt) is
/// `payload_malformed`, never dropped or rewritten.
function validateJson(value: unknown): void {
  switch (typeof value) {
    case "number":
      if (!Number.isFinite(value)) {
        throw malformed(`${value} is not a JSON number`);
      }
      // An integer written as one: what JSON.stringify writes without an exponent, which the PDP
      // reads as an integer and bounds at 2^53.
      if (Number.isInteger(value) && Math.abs(value) > EXACT && !/e/i.test(String(value))) {
        throw new Refusal(
          "validation",
          "value_unrepresentable",
          `${value} is beyond the largest integer both transports carry exactly (2^53): send it as a string`,
        );
      }
      return;
    case "string":
    case "boolean":
      return;
    case "undefined":
    case "function":
    case "symbol":
    case "bigint":
      throw malformed(`a ${typeof value} is not a JSON value`);
    default:
      if (value === null) return;
      if (Array.isArray(value)) {
        for (let at = 0; at < value.length; at += 1) validateJson(value[at]);
        return;
      }
      Object.values(value as Record<string, unknown>).forEach(validateJson);
  }
}

function malformed(message: string): Refusal {
  return new Refusal("validation", "payload_malformed", message);
}

function put(target: WireObject, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}

function object(value: unknown, name: string): WireObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`invalid Permguard ${name}: expected an object`);
  }
  return value as WireObject;
}

function optionalObject(value: unknown): WireObject {
  return value === undefined || value === null ? {} : object(value, "object");
}

function array(value: unknown): unknown[] {
  return value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [];
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown): string | undefined {
  const result = string(value);
  return result || undefined;
}
