import type { MomentCompilation } from "@momentseal/core";

const percent = (value: number) => `${Math.round(value * 100)}%`;
const duration = (milliseconds: number | null) => milliseconds === null ? "—" : milliseconds < 1_000 ? `${milliseconds}ms` : `${(milliseconds / 1_000).toFixed(milliseconds % 1_000 ? 1 : 0)}s`;

export function formatCompilation(result: MomentCompilation): string {
  const lines = [
    `MOMENTSEAL ${result.status.toUpperCase()} · ${result.score}/100`,
    `Plan ${result.planId} · ${result.summary.commit} commit · ${result.summary.review} review · ${result.summary.reject} reject`,
    `Fresh evidence ${percent(result.metrics.freshObservationCoverage)} · Conditional mutations ${percent(result.metrics.conditionalCoverage)} · Max gap ${duration(result.metrics.maximumCheckUseGapMs)}`,
    "",
  ];
  for (const decision of result.decisions) {
    lines.push(`${decision.status === "commit" ? "✓" : "×"} ${decision.actionId} [${decision.status}] · gap ${duration(decision.checkUseGapMs)} · depth ${decision.dependencyDepth ?? "cycle"}`);
    for (const item of decision.findings) lines.push(`  ${item.severity === "blocked" ? "BLOCK" : "WARN"} ${item.code}: ${item.message}`);
  }
  for (const item of result.findings) lines.push(`BLOCK ${item.code}${item.actionId ? ` (${item.actionId})` : ""}: ${item.message}`);
  lines.push("", `Compilation ${result.compilationHash}`);
  return lines.join("\n");
}

export function formatDot(result: MomentCompilation): string {
  const quote = (value: string) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  const lines = ["digraph MomentSeal {", "  rankdir=LR;", '  node [fontname="Inter", shape=box, style=rounded];'];
  for (const observation of result.graph.observations) lines.push(`  ${quote(`observation:${observation.id}`)} [label=${quote(`${observation.id}\\n${observation.version}`)}, color="#7dd3fc"];`);
  for (const state of result.graph.states) lines.push(`  ${quote(`state:${state.resourceId}`)} [label=${quote(`commit ${state.resourceId}\\n${state.currentVersion}`)}, color="#c4b5fd"];`);
  for (const action of result.graph.actions) {
    const rejected = result.decisions.find((item) => item.actionId === action.id)?.status === "reject";
    lines.push(`  ${quote(`action:${action.id}`)} [label=${quote(`${action.sequence}. ${action.id}`)}, color="${rejected ? "#fb7185" : "#86efac"}"];`);
  }
  for (const edge of result.graph.evidenceEdges) lines.push(`  ${quote(`observation:${edge.from}`)} -> ${quote(`action:${edge.to}`)} [label="observed"];`);
  for (const action of result.graph.actions) lines.push(`  ${quote(`state:${action.resourceId}`)} -> ${quote(`action:${action.id}`)} [label="commit state", style=dashed];`);
  for (const edge of result.graph.dependencyEdges) lines.push(`  ${quote(`action:${edge.from}`)} -> ${quote(`action:${edge.to}`)} [label="depends"];`);
  return [...lines, "}"].join("\n");
}
