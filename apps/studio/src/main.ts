import { compileMoments, racyPlan, racyPolicy, safePlan, safePolicy, type AgentPlan, type MomentCompilation, type MomentPolicy } from "@momentseal/core";
import "./style.css";

type Scenario = "safe" | "racy";
let scenario: Scenario = "racy";
let selectedAction = "refund-ticket";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing application root.");
const root = app;

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
const shortTime = (value: string) => new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(value));
const duration = (milliseconds: number | null) => milliseconds === null ? "NO EVIDENCE" : milliseconds < 60_000 ? `${Math.round(milliseconds / 1_000)} SEC` : `${(milliseconds / 60_000).toFixed(1)} MIN`;
const percent = (value: number) => `${Math.round(value * 100)}%`;

function metric(label: string, value: string, tone = "") {
  return `<article class="metric ${tone}"><span>${label}</span><strong>${value}</strong></article>`;
}

function timeline(plan: AgentPlan, result: MomentCompilation) {
  const moments = [
    ...plan.observations.map((item) => ({ at: item.observedAt, type: "OBSERVE", title: item.id, detail: `${item.resourceId} · ${item.version}`, tone: "cyan" })),
    ...plan.commitStates.map((item) => ({ at: item.capturedAt, type: "STATE", title: item.id, detail: `${item.resourceId} · ${item.currentVersion}`, tone: "violet" })),
    ...plan.actions.map((item) => {
      const decision = result.decisions.find((candidate) => candidate.actionId === item.id);
      return { at: item.commitAt, type: "ACTION", title: item.id, detail: `${item.kind} · ${decision?.status ?? "unknown"}`, tone: decision?.status === "commit" ? "green" : "red" };
    }),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const minimum = Math.min(...moments.map((item) => Date.parse(item.at)));
  const maximum = Math.max(...moments.map((item) => Date.parse(item.at)));
  const range = Math.max(1, maximum - minimum);
  return `<div class="time-ruler">${moments.map((item, index) => {
    const left = moments.length === 1 ? 50 : 4 + ((Date.parse(item.at) - minimum) / range) * 92;
    return `<button class="moment ${item.tone}" style="left:${left}%;--level:${index % 2}" data-action="${item.type === "ACTION" ? escapeHtml(item.title) : ""}">
      <i></i><small>${shortTime(item.at)}Z · ${item.type}</small><b>${escapeHtml(item.title)}</b><em>${escapeHtml(item.detail)}</em>
    </button>`;
  }).join("")}<div class="rail"></div></div>`;
}

function inspector(plan: AgentPlan, result: MomentCompilation) {
  const action = plan.actions.find((item) => item.id === selectedAction) ?? plan.actions[0];
  if (!action) return "";
  selectedAction = action.id;
  const decision = result.decisions.find((item) => item.actionId === action.id);
  const observation = plan.observations.find((item) => item.id === action.observationId);
  const state = plan.commitStates.find((item) => item.id === action.commitStateId);
  return `<aside class="inspector">
    <div class="eyebrow">ACTION INSPECTOR / ${String(action.sequence).padStart(2, "0")}</div>
    <h2>${escapeHtml(action.id)}</h2>
    <div class="status-row"><span class="status ${decision?.status}">${decision?.status ?? "unknown"}</span><code>${escapeHtml(action.kind)}</code></div>
    <dl>
      <div><dt>Resource</dt><dd>${escapeHtml(action.resourceId)}</dd></div>
      <div><dt>Observed</dt><dd>${observation ? `${escapeHtml(observation.version)} @ ${shortTime(observation.observedAt)}Z` : "not bound"}</dd></div>
      <div><dt>Commit state</dt><dd>${state ? `${escapeHtml(state.currentVersion)} @ ${shortTime(state.capturedAt)}Z` : "not captured"}</dd></div>
      <div><dt>Guard</dt><dd>${escapeHtml(action.consistency)}${action.expectedVersion ? ` / ${escapeHtml(action.expectedVersion)}` : ""}</dd></div>
      <div><dt>Check-use gap</dt><dd>${duration(decision?.checkUseGapMs ?? null)}</dd></div>
    </dl>
    <div class="findings">
      <div class="eyebrow">COMPILE FINDINGS</div>
      ${decision?.findings.length ? decision.findings.map((item) => `<article><span>${escapeHtml(item.code)}</span><p>${escapeHtml(item.message)}</p></article>`).join("") : `<div class="empty">No consistency violations. This action can commit.</div>`}
    </div>
  </aside>`;
}

async function render() {
  const plan = scenario === "safe" ? safePlan : racyPlan;
  const policy: MomentPolicy = scenario === "safe" ? safePolicy : racyPolicy;
  if (!plan.actions.some((item) => item.id === selectedAction)) selectedAction = plan.actions[0]?.id ?? "";
  const result = await compileMoments({ plan, policy, compiledAt: new Date("2026-07-29T03:09:00.000Z") });
  root.innerHTML = `
    <header>
      <a class="brand" href="#" aria-label="MomentSeal home"><span class="mark">M</span><span>Moment<em>Seal</em></span></a>
      <div class="header-meta"><span>PLAN / ${escapeHtml(plan.planId)}</span><span>POLICY / ${policy.policyVersion}</span></div>
      <a class="github" href="https://github.com/vtino17/moment-seal">VIEW SOURCE ↗</a>
    </header>
    <main>
      <section class="hero">
        <div>
          <div class="eyebrow">SNAPSHOT-TO-COMMIT CONSISTENCY COMPILER</div>
          <h1>Did reality change<br><span>between check and use?</span></h1>
          <p>Bind every agent action to the exact resource version it observed. Reject stale assumptions before they become irreversible side effects.</p>
        </div>
        <div class="seal ${result.status}">
          <small>COMPILE STATUS</small><strong>${result.status.toUpperCase()}</strong><span>${result.score}<i>/100</i></span>
        </div>
      </section>
      <section class="controls">
        <div class="toggle" role="group" aria-label="Scenario">
          <button data-scenario="racy" class="${scenario === "racy" ? "active" : ""}">RACY PLAN <span>13+ violations</span></button>
          <button data-scenario="safe" class="${scenario === "safe" ? "active" : ""}">SEALED PLAN <span>commit ready</span></button>
        </div>
        <span class="compiled">COMPILED ${shortTime(result.compiledAt)}Z · SHA ${result.compilationHash.slice(0, 10)}</span>
      </section>
      <section class="metrics">
        ${metric("FRESH EVIDENCE", percent(result.metrics.freshObservationCoverage), result.metrics.freshObservationCoverage === 1 ? "good" : "bad")}
        ${metric("FRESH COMMIT STATE", percent(result.metrics.freshCommitStateCoverage), result.metrics.freshCommitStateCoverage === 1 ? "good" : "bad")}
        ${metric("SCOPE BINDING", percent(result.metrics.scopeBindingCoverage), result.metrics.scopeBindingCoverage === 1 ? "good" : "bad")}
        ${metric("CONDITIONAL WRITES", percent(result.metrics.conditionalCoverage), result.metrics.conditionalCoverage === 1 ? "good" : "bad")}
        ${metric("VERSION DRIFTS", String(result.metrics.driftedResources), result.metrics.driftedResources ? "bad" : "good")}
        ${metric("MAX CHECK → USE", duration(result.metrics.maximumCheckUseGapMs), result.metrics.maximumCheckUseGapMs > policy.maximumCheckUseGapMs ? "bad" : "good")}
      </section>
      <section class="timeline-panel">
        <div class="panel-title"><div><div class="eyebrow">TEMPORAL TRACE</div><h2>Observation → State → Commit</h2></div><div class="legend"><span class="cyan">OBSERVATION</span><span class="violet">COMMIT STATE</span><span class="red">REJECTED</span></div></div>
        ${timeline(plan, result)}
      </section>
      <section class="workbench">
        <div class="actions">
          <div class="panel-title"><div><div class="eyebrow">ACTION GRAPH</div><h2>Commit decisions</h2></div><span>${result.summary.actions} ACTIONS</span></div>
          ${result.decisions.map((decision) => {
            const action = plan.actions.find((item) => item.id === decision.actionId);
            return `<button data-action="${escapeHtml(decision.actionId)}" class="action-row ${selectedAction === decision.actionId ? "selected" : ""}">
              <span class="seq">${String(action?.sequence ?? 0).padStart(2, "0")}</span>
              <span><b>${escapeHtml(decision.actionId)}</b><small>${escapeHtml(action?.resourceId ?? "")}</small></span>
              <span class="guard">${escapeHtml(action?.consistency ?? "")}</span>
              <span class="status ${decision.status}">${decision.status}</span>
            </button>`;
          }).join("")}
        </div>
        ${inspector(plan, result)}
      </section>
      <section class="terminal"><span>$</span><code>pnpm moment compile examples/${scenario}-plan.json --policy examples/${scenario}-policy.json</code><b>${scenario === "safe" ? "exit 0" : "exit 2"}</b></section>
    </main>
    <footer><span>MOMENTSEAL / OPEN SOURCE</span><p>Make the gap visible. Make the commit conditional.</p><span>CWE-367 AWARE</span></footer>`;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-scenario]")) button.addEventListener("click", () => {
    scenario = button.dataset.scenario as Scenario;
    void render();
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-action]")) button.addEventListener("click", () => {
    if (!button.dataset.action) return;
    selectedAction = button.dataset.action;
    void render();
  });
}

void render();
