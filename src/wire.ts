// Copyright (c) 2022 Nitro Agility S.r.l.
// SPDX-License-Identifier: Apache-2.0

import { Struct, Value } from "./internal/grpc/v1/generated/google/protobuf/struct";
import * as pb from "./internal/grpc/v1/generated/permguard/data/v1/pdp";
import {
  type Action,
  type Configuration,
  type Decision,
  type DecisionContext,
  type Entity,
  type EvaluateRequest,
  type EvaluateResponse,
  type Evaluation,
  EvaluationsSemantic,
  type JsonObject,
  type JsonValue,
  type PartitionInput,
  type PartitionInputs,
  type Reason,
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
  return result;
}

export function responseFromJson(value: unknown): EvaluateResponse {
  const payload = object(value, "evaluation response");
  return {
    decision: Boolean(payload.decision),
    requestId: optionalString(payload.request_id),
    context: contextFromJson(payload.context),
    evaluations: array(payload.evaluations).map(decisionFromJson),
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
  });
}

export function responseFromProto(response: pb.EvaluateResponse): EvaluateResponse {
  return {
    decision: response.decision,
    requestId: response.requestId || undefined,
    context: contextFromProto(response.context),
    evaluations: response.evaluations.map(decisionFromProto),
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
  validateJson(request.context);
  validateJson(request.subject?.properties);
  validateJson(request.resource?.properties);
  validateJson(request.action?.properties);
  validateJson(request.principal?.properties);
  for (const input of Object.values(request.partitionInputs ?? {})) {
    validateJson(input.data);
  }
  for (const evaluation of request.evaluations ?? []) {
    validateJson(evaluation.context);
    validateJson(evaluation.subject?.properties);
    validateJson(evaluation.resource?.properties);
    validateJson(evaluation.action?.properties);
    for (const input of Object.values(evaluation.partitionInputs ?? {})) {
      validateJson(input.data);
    }
  }
}

function validateJson(value: JsonValue | undefined): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("JSON numbers must be finite");
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new TypeError(
        `integer ${value} is not exactly representable by protobuf Value`,
      );
    }
  } else if (Array.isArray(value)) {
    value.forEach(validateJson);
  } else if (value !== null && typeof value === "object") {
    Object.values(value).forEach(validateJson);
  }
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
