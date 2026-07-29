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
  resourceId: string;
  currentVersion: string;
  capturedAt: string;
  exists: boolean;
}

export interface PlannedAction {
  id: string;
  sequence: number;
  kind: "read" | "create" | "update" | "delete" | "external-effect";
  resourceId: string;
  observationId?: string;
  expectedVersion?: string;
  commitAt: string;
  consistency: "none" | "if-match" | "transaction" | "lease";
  leaseScope?: string;
  revalidatedAt?: string;
  irreversible: boolean;
  mutationHash: string;
  dependsOnActionIds: string[];
}

export interface AgentPlan {
  planVersion: "1.0";
  planId: string;
  observations: ResourceObservation[];
  commitStates: CommitState[];
  actions: PlannedAction[];
}

export interface MomentPolicy {
  policyVersion: "1.0";
  planId: string;
  maximumObservationAgeMs: number;
  maximumCheckUseGapMs: number;
  maximumRevalidationAgeMs: number;
  minimumAuthority: number;
  requireConditionalForMutations: boolean;
  requireRevalidationForIrreversible: boolean;
  maximumDependencyDepth: number;
}

export interface MomentFinding {
  code: string;
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
  status: "clean" | "review" | "blocked";
  score: number;
  compiledAt: string;
  summary: { actions: number; commit: number; review: number; reject: number };
  metrics: {
    conditionalCoverage: number;
    freshObservationCoverage: number;
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
  receiptVersion: "1.0";
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
  checks: Record<"receiptHash" | "planHash" | "policyHash" | "compilationHash", boolean>;
  errors: string[];
}
