import type { AgentPlan, MomentPolicy } from "./types.js";

const MAX_COLLECTION_ITEMS = 10_000;
const MAX_DEPENDENCIES_PER_ACTION = 256;
const MAX_STRING_LENGTH = 512;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= MAX_STRING_LENGTH && value.trim() === value;
const validTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string" || !timestampPattern.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= MAX_DEPENDENCIES_PER_ACTION && value.every(nonEmptyString);
const actionKinds = new Set(["read", "create", "update", "delete", "external-effect"]);
const consistencyModes = new Set(["none", "if-match", "if-none-match", "transaction", "lease"]);

export function assertPlan(value: unknown): asserts value is AgentPlan {
  if (!object(value) || value.planVersion !== "2.0" || !nonEmptyString(value.planId) || !Array.isArray(value.observations) || !Array.isArray(value.commitStates) || !Array.isArray(value.actions)) throw new Error("Invalid agent plan.");
  if ([value.observations, value.commitStates, value.actions].some((items) => items.length > MAX_COLLECTION_ITEMS)) throw new Error(`Plan collections cannot exceed ${MAX_COLLECTION_ITEMS} items.`);

  const observationIds = new Set<string>();
  for (const item of value.observations) {
    if (!object(item)) throw new Error("Invalid observation.");
    for (const field of ["id", "resourceId", "version", "source", "scopeHash"]) if (!nonEmptyString(item[field])) throw new Error(`Observation field "${field}" must be a trimmed, non-empty string no longer than ${MAX_STRING_LENGTH} characters.`);
    if (!validTimestamp(item.observedAt) || !validTimestamp(item.expiresAt)) throw new Error("Observation timestamps must be canonical UTC timestamps with millisecond precision.");
    if (Date.parse(item.expiresAt) <= Date.parse(item.observedAt)) throw new Error("Observation must expire after it was captured.");
    if (typeof item.authority !== "number" || !Number.isFinite(item.authority) || item.authority < 0 || item.authority > 100) throw new Error("Observation authority must be between 0 and 100.");
    const id = String(item.id);
    if (observationIds.has(id)) throw new Error(`Duplicate observation id: ${id}`);
    observationIds.add(id);
  }

  const stateIds = new Set<string>();
  const stateActions = new Set<string>();
  for (const item of value.commitStates) {
    if (!object(item) || !nonEmptyString(item.id) || !nonEmptyString(item.actionId) || !nonEmptyString(item.resourceId) || !nonEmptyString(item.currentVersion) || !validTimestamp(item.capturedAt) || typeof item.exists !== "boolean" || !nonEmptyString(item.scopeHash)) throw new Error("Invalid commit state.");
    if (stateIds.has(item.id)) throw new Error(`Duplicate commit state id: ${item.id}`);
    if (stateActions.has(item.actionId)) throw new Error(`Multiple commit states target action: ${item.actionId}`);
    stateIds.add(item.id);
    stateActions.add(item.actionId);
  }

  const actionIds = new Set<string>();
  const actionSequences = new Set<number>();
  for (const item of value.actions) {
    if (!object(item) || !nonEmptyString(item.id) || !nonEmptyString(item.resourceId) || !nonEmptyString(item.kind) || !nonEmptyString(item.consistency) || !nonEmptyString(item.scopeHash) || typeof item.mutationHash !== "string" || !digestPattern.test(item.mutationHash)) throw new Error("Invalid action or mutation hash.");
    if (!Number.isSafeInteger(item.sequence) || Number(item.sequence) < 0 || typeof item.irreversible !== "boolean" || !strings(item.dependsOnActionIds)) throw new Error("Invalid action fields.");
    if (!validTimestamp(item.commitAt)) throw new Error("Action commitAt must be a canonical UTC timestamp with millisecond precision.");
    if (!actionKinds.has(item.kind)) throw new Error(`Unknown action kind: ${item.kind}`);
    if (!consistencyModes.has(item.consistency)) throw new Error(`Unknown consistency mode: ${item.consistency}`);
    for (const field of ["observationId", "expectedVersion", "commitStateId", "leaseScope", "revalidatedVersion", "revalidatedScopeHash"]) if (item[field] !== undefined && !nonEmptyString(item[field])) throw new Error(`Action field "${field}" must be a trimmed, non-empty string no longer than ${MAX_STRING_LENGTH} characters.`);
    if (new Set(item.dependsOnActionIds).size !== item.dependsOnActionIds.length) throw new Error("Action dependencies must be unique.");
    if (item.revalidatedAt !== undefined && !validTimestamp(item.revalidatedAt)) throw new Error("revalidatedAt must be a canonical UTC timestamp with millisecond precision.");
    const revalidationFields = [item.revalidatedAt, item.revalidatedVersion, item.revalidatedScopeHash];
    if (revalidationFields.some((field) => field !== undefined) && !revalidationFields.every((field) => field !== undefined)) throw new Error("Revalidation timestamp, version, and scope must be supplied together.");
    if (actionIds.has(item.id)) throw new Error(`Duplicate action id: ${item.id}`);
    if (actionSequences.has(Number(item.sequence))) throw new Error(`Duplicate action sequence: ${String(item.sequence)}`);
    actionIds.add(item.id);
    actionSequences.add(Number(item.sequence));
  }
}

export function assertPolicy(value: unknown): asserts value is MomentPolicy {
  if (!object(value) || value.policyVersion !== "2.0" || !nonEmptyString(value.planId)) throw new Error("Invalid moment policy.");
  const numericFields = ["maximumObservationAgeMs", "maximumCheckUseGapMs", "maximumCommitStateAgeMs", "maximumRevalidationAgeMs", "minimumAuthority", "maximumDependencyDepth", "maximumActions", "maximumObservations", "maximumDependencyEdges"];
  for (const field of numericFields) if (typeof value[field] !== "number" || !Number.isSafeInteger(value[field]) || Number(value[field]) < 0) throw new Error(`${field} must be a safe, non-negative integer.`);
  if (Number(value.minimumAuthority) > 100) throw new Error("minimumAuthority must not exceed 100.");
  for (const field of ["maximumActions", "maximumObservations", "maximumDependencyEdges"]) if (Number(value[field]) > MAX_COLLECTION_ITEMS) throw new Error(`${field} cannot exceed ${MAX_COLLECTION_ITEMS}.`);
  for (const field of ["requireConditionalForMutations", "requireRevalidationForIrreversible", "requireScopeBinding"]) if (typeof value[field] !== "boolean") throw new Error(`${field} must be boolean.`);
}
