export interface ResourceObservation {
  id: string;
  resourceId: string;
  version: string;
  observedAt: string;
  expiresAt: string;
  source: string;
  authority: number;
  scopeHash: string;
}

export interface CommitState {
  id: string;
  actionId: string;
  resourceId: string;
  currentVersion: string;
  capturedAt: string;
  exists: boolean;
  scopeHash: string;
}

export interface PlannedAction {
  id: string;
  sequence: number;
  kind: "read" | "create" | "update" | "delete" | "external-effect";
  resourceId: string;
  observationId?: string;
  expectedVersion?: string;
  commitAt: string;
  consistency: "none" | "if-match" | "if-none-match" | "transaction" | "lease";
  commitStateId?: string;
  scopeHash: string;
  leaseScope?: string;
  revalidatedAt?: string;
  revalidatedVersion?: string;
  revalidatedScopeHash?: string;
  irreversible: boolean;
  mutationHash: string;
  dependsOnActionIds: string[];
}

export interface AgentPlan {
  planVersion: "2.0";
  planId: string;
  observations: ResourceObservation[];
  commitStates: CommitState[];
  actions: PlannedAction[];
}

export interface MomentPolicy {
  policyVersion: "2.0";
  planId: string;
  maximumObservationAgeMs: number;
  maximumCheckUseGapMs: number;
  maximumCommitStateAgeMs: number;
  maximumRevalidationAgeMs: number;
  minimumAuthority: number;
  requireConditionalForMutations: boolean;
  requireRevalidationForIrreversible: boolean;
  requireScopeBinding: boolean;
  maximumDependencyDepth: number;
  maximumActions: number;
  maximumObservations: number;
  maximumDependencyEdges: number;
}

export type MomentFindingCode =
  | "action-dependency-cycle"
  | "action-limit-exceeded"
  | "check-use-gap-exceeded"
  | "commit-before-observation"
  | "commit-state-action-mismatch"
  | "commit-state-age-exceeded"
  | "commit-state-from-future"
  | "commit-state-missing"
  | "commit-state-resource-mismatch"
  | "competing-plan-writes"
  | "conditional-mutation-missing"
  | "create-guard-invalid"
  | "dependency-edge-limit-exceeded"
  | "dependency-depth-exceeded"
  | "dependency-order-invalid"
  | "expected-version-missing"
  | "expected-version-observation-mismatch"
  | "if-match-would-fail"
  | "internally-invalidated-observation"
  | "irreversible-revalidation-missing"
  | "irreversible-revalidation-stale"
  | "lease-scope-mismatch"
  | "lease-scope-missing"
  | "mutation-observation-missing"
  | "observation-authority-low"
  | "observation-expired"
  | "observation-limit-exceeded"
  | "observation-missing"
  | "observation-resource-mismatch"
  | "orphan-action-dependency"
  | "orphan-commit-state"
  | "resource-already-exists"
  | "resource-missing-at-commit"
  | "revalidation-scope-mismatch"
  | "revalidation-version-mismatch"
  | "scope-commit-state-mismatch"
  | "scope-observation-mismatch"
  | "state-version-drift"
  | "unexpected-version-guard"
  | "unbound-commit-state";

export interface MomentFinding {
  code: MomentFindingCode;
  severity: "warning" | "blocked";
  message: string;
  actionId?: string;
  observationId?: string;
  resourceId?: string;
  relatedIds: string[];
}

export interface ActionDecision {
  actionId: string;
  status: "commit" | "review" | "reject";
  checkUseGapMs: number | null;
  dependencyDepth: number | null;
  findings: MomentFinding[];
}

export interface MomentCompilation {
  planId: string;
  planHash: string;
  policyHash: string;
  status: "clean" | "review" | "blocked";
  score: number;
  compiledAt: string;
  summary: { actions: number; commit: number; review: number; reject: number };
  metrics: {
    conditionalCoverage: number;
    freshObservationCoverage: number;
    freshCommitStateCoverage: number;
    scopeBindingCoverage: number;
    driftedResources: number;
    maximumCheckUseGapMs: number;
    maximumDependencyDepth: number;
    irreversibleActions: number;
    internallyInvalidatedActions: number;
  };
  decisions: ActionDecision[];
  findings: MomentFinding[];
  graph: {
    observations: ResourceObservation[];
    states: CommitState[];
    actions: PlannedAction[];
    dependencyEdges: Array<{ from: string; to: string }>;
    evidenceEdges: Array<{ from: string; to: string }>;
  };
  compilationHash: string;
}

export interface MomentReceipt {
  receiptVersion: "2.0";
  planId: string;
  planHash: string;
  policyHash: string;
  compilationHash: string;
  compiledAt: string;
  issuedAt: string;
  committedActionIds: string[];
  receiptHash: string;
}

export interface ReceiptVerification {
  valid: boolean;
  checks: Record<"receiptHash" | "planHash" | "policyHash" | "compilationHash" | "committedActions" | "timeline", boolean>;
  errors: string[];
}
