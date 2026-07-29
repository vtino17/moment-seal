import type { AgentPlan, MomentPolicy } from "./types.js";

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const validDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const actionKinds = new Set(["read", "create", "update", "delete", "external-effect"]);
const consistencyModes = new Set(["none", "if-match", "transaction", "lease"]);

export function assertPlan(value: unknown): asserts value is AgentPlan {
  if (!object(value) || value.planVersion !== "1.0" || typeof value.planId !== "string" || !value.planId.trim() || !Array.isArray(value.observations) || !Array.isArray(value.commitStates) || !Array.isArray(value.actions)) throw new Error("Invalid agent plan.");
  const observationIds = new Set<string>();
  for (const item of value.observations) {
    if (!object(item)) throw new Error("Invalid observation.");
    for (const field of ["id", "resourceId", "version", "source", "scopeHash"]) if (typeof item[field] !== "string" || !String(item[field]).trim()) throw new Error(`Observation field "${field}" must be a non-empty string.`);
    if (!validDate(item.observedAt) || !validDate(item.expiresAt)) throw new Error("Observation timestamps are invalid.");
    if (Date.parse(String(item.expiresAt)) < Date.parse(String(item.observedAt))) throw new Error("Observation expires before it was captured.");
    if (typeof item.authority !== "number" || !Number.isFinite(item.authority) || item.authority < 0 || item.authority > 100) throw new Error("Observation authority must be between 0 and 100.");
    const id = String(item.id);
    if (observationIds.has(id)) throw new Error(`Duplicate observation id: ${id}`);
    observationIds.add(id);
  }
  const stateIds = new Set<string>();
  for (const item of value.commitStates) {
    if (!object(item) || typeof item.resourceId !== "string" || !item.resourceId.trim() || typeof item.currentVersion !== "string" || !item.currentVersion.trim() || !validDate(item.capturedAt) || typeof item.exists !== "boolean") throw new Error("Invalid commit state.");
    if (stateIds.has(item.resourceId)) throw new Error(`Duplicate commit state: ${item.resourceId}`);
    stateIds.add(item.resourceId);
  }
  const actionIds = new Set<string>();
  const actionSequences = new Set<number>();
  for (const item of value.actions) {
    if (!object(item) || typeof item.id !== "string" || !item.id.trim() || typeof item.resourceId !== "string" || !item.resourceId.trim() || typeof item.kind !== "string" || typeof item.consistency !== "string" || typeof item.mutationHash !== "string" || !item.mutationHash.trim()) throw new Error("Invalid action.");
    if (!Number.isSafeInteger(item.sequence) || Number(item.sequence) < 0 || !validDate(item.commitAt) || typeof item.irreversible !== "boolean" || !strings(item.dependsOnActionIds)) throw new Error("Invalid action fields.");
    if (!actionKinds.has(String(item.kind))) throw new Error(`Unknown action kind: ${String(item.kind)}`);
    if (!consistencyModes.has(String(item.consistency))) throw new Error(`Unknown consistency mode: ${String(item.consistency)}`);
    for (const field of ["observationId", "expectedVersion", "leaseScope"]) if (item[field] !== undefined && (typeof item[field] !== "string" || !String(item[field]).trim())) throw new Error(`Action field "${field}" must be a non-empty string.`);
    if (new Set(item.dependsOnActionIds).size !== item.dependsOnActionIds.length) throw new Error("Action dependencies must be unique.");
    if (item.revalidatedAt !== undefined && !validDate(item.revalidatedAt)) throw new Error("Invalid revalidatedAt.");
    if (actionIds.has(item.id)) throw new Error(`Duplicate action id: ${item.id}`);
    if (actionSequences.has(Number(item.sequence))) throw new Error(`Duplicate action sequence: ${String(item.sequence)}`);
    actionIds.add(item.id);
    actionSequences.add(Number(item.sequence));
  }
}

export function assertPolicy(value: unknown): asserts value is MomentPolicy {
  if (!object(value) || value.policyVersion !== "1.0" || typeof value.planId !== "string" || !value.planId.trim()) throw new Error("Invalid moment policy.");
  for (const field of ["maximumObservationAgeMs", "maximumCheckUseGapMs", "maximumRevalidationAgeMs", "minimumAuthority", "maximumDependencyDepth"]) if (typeof value[field] !== "number" || !Number.isFinite(value[field]) || Number(value[field]) < 0) throw new Error(`${field} must be finite and non-negative.`);
  if (Number(value.minimumAuthority) > 100) throw new Error("minimumAuthority must not exceed 100.");
  if (!Number.isSafeInteger(value.maximumDependencyDepth)) throw new Error("maximumDependencyDepth must be an integer.");
  for (const field of ["requireConditionalForMutations", "requireRevalidationForIrreversible"]) if (typeof value[field] !== "boolean") throw new Error(`${field} must be boolean.`);
}
