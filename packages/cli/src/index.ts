#!/usr/bin/env node
import {
  compileMoments,
  assertPlan,
  issueReceipt,
  racyPlan,
  racyPolicy,
  safePlan,
  safePolicy,
  verifyReceipt,
  type AgentPlan,
  type MomentCompilation,
  type MomentPolicy,
} from "@momentseal/core";
import { mkdir, open, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { formatCompilation, formatDot } from "./format.js";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const MAX_INPUT_BYTES = 1_048_576;
const has = (name: string) => args.includes(name);
const flag = (name: string): string | undefined => {
  const indexes = args.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length > 1) throw new Error(`Flag ${name} can only be supplied once.`);
  if (!indexes.length) return undefined;
  const value = args[indexes[0]! + 1];
  if (!value || value.startsWith("--")) throw new Error(`Flag ${name} requires a value.`);
  return value;
};
const readJson = async <T>(file: string): Promise<T> => {
  const target = resolve(file);
  const metadata = await stat(target);
  if (!metadata.isFile()) throw new Error(`Input is not a regular file: ${target}`);
  if (metadata.size > MAX_INPUT_BYTES) throw new Error(`Input exceeds the ${MAX_INPUT_BYTES}-byte limit: ${target}`);
  try {
    return JSON.parse(await readFile(target, "utf8")) as T;
  } catch (error) {
    throw new Error(`Cannot parse JSON from ${target}: ${error instanceof Error ? error.message : String(error)}`);
  }
};
const saveText = async (file: string, content: string, mode = 0o644) => {
  const target = resolve(file);
  await mkdir(dirname(target), { recursive: true });
  const handle = await open(target, has("--force") ? "w" : "wx", mode);
  try {
    await handle.writeFile(`${content}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
};
const saveJson = (file: string, value: unknown) => saveText(file, JSON.stringify(value, null, 2));
const statusExit = (status: MomentCompilation["status"]) => {
  process.exitCode = status === "blocked" ? 2 : status === "review" ? 3 : 0;
};
const inputs = async () => {
  const planFile = args[1];
  const policyFile = flag("--policy");
  if (!planFile || !policyFile) throw new Error("Provide a plan plus --policy <policy.json>.");
  return { plan: await readJson<AgentPlan>(planFile), policy: await readJson<MomentPolicy>(policyFile) };
};
const help = `MomentSeal — snapshot-to-commit consistency compiler for AI-agent plans

Usage:
  moment-seal inspect <plan.json>
  moment-seal compile <plan.json> --policy <policy.json> [--json]
  moment-seal explain <plan.json> --policy <policy.json> --action <id>
  moment-seal timeline <plan.json> --policy <policy.json> --resource <id>
  moment-seal graph <plan.json> --policy <policy.json> [--output graph.dot] [--force]
  moment-seal receipt <plan.json> --policy <policy.json> --output <receipt.json> [--force]
  moment-seal verify <receipt.json> --plan <plan.json> --policy <policy.json>
  moment-seal demo [safe|racy] [--json]
  moment-seal init [directory] [--force]

Inputs are limited to 1 MiB. Existing output files are never replaced unless --force is explicit.`;

async function main(): Promise<void> {
  if (command === "help" || has("--help") || has("-h")) return console.log(help);
  if (command === "inspect") {
    const plan = await readJson<AgentPlan>(args[1] ?? "");
    assertPlan(plan);
    console.log(JSON.stringify({
      planId: plan.planId,
      observations: plan.observations.length,
      commitStates: plan.commitStates.length,
      actions: plan.actions.length,
      resources: [...new Set(plan.actions.map((item) => item.resourceId))].sort(),
      irreversibleActions: plan.actions.filter((item) => item.irreversible).length,
    }, null, 2));
    return;
  }
  if (command === "demo") {
    const racy = args[1] === "racy";
    const result = await compileMoments({ plan: racy ? racyPlan : safePlan, policy: racy ? racyPolicy : safePolicy });
    console.log(has("--json") ? JSON.stringify(result, null, 2) : formatCompilation(result));
    statusExit(result.status);
    return;
  }
  if (command === "init") {
    const directory = resolve(args[1] ?? "moment-seal-example");
    await Promise.all([
      saveJson(`${directory}/safe-plan.json`, safePlan),
      saveJson(`${directory}/racy-plan.json`, racyPlan),
      saveJson(`${directory}/safe-policy.json`, safePolicy),
      saveJson(`${directory}/racy-policy.json`, racyPolicy),
    ]);
    console.log(`Created starter plans in ${directory}`);
    return;
  }
  if (command === "verify") {
    const planFile = flag("--plan");
    const policyFile = flag("--policy");
    if (!planFile || !policyFile) throw new Error("Provide --plan and --policy.");
    const plan = await readJson<AgentPlan>(planFile);
    const policy = await readJson<MomentPolicy>(policyFile);
    const receipt = await readJson<unknown>(args[1] ?? "");
    const receiptCompiledAt = receipt !== null && typeof receipt === "object" && "compiledAt" in receipt && typeof receipt.compiledAt === "string" ? receipt.compiledAt : undefined;
    if (!receiptCompiledAt || !Number.isFinite(Date.parse(receiptCompiledAt))) {
      console.log(JSON.stringify({ valid: false, errors: ["Receipt compilation timestamp is invalid."] }, null, 2));
      process.exitCode = 4;
      return;
    }
    const compilation = await compileMoments({ plan, policy, compiledAt: new Date(receiptCompiledAt) });
    const result = await verifyReceipt({ receipt, plan, policy, compilation });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.valid ? 0 : 4;
    return;
  }
  const source = await inputs();
  const result = await compileMoments(source);
  if (command === "compile") {
    console.log(has("--json") ? JSON.stringify(result, null, 2) : formatCompilation(result));
    statusExit(result.status);
    return;
  }
  if (command === "explain") {
    const actionId = flag("--action");
    const action = source.plan.actions.find((item) => item.id === actionId);
    const decision = result.decisions.find((item) => item.actionId === actionId);
    if (!action || !decision) throw new Error("Unknown or missing --action.");
    console.log(JSON.stringify({ action, observation: source.plan.observations.find((item) => item.id === action.observationId) ?? null, commitState: source.plan.commitStates.find((item) => item.resourceId === action.resourceId) ?? null, decision }, null, 2));
    statusExit(decision.status === "reject" ? "blocked" : decision.status === "review" ? "review" : "clean");
    return;
  }
  if (command === "timeline") {
    const resourceId = flag("--resource");
    if (!resourceId) throw new Error("Provide --resource.");
    const events = [
      ...source.plan.observations.filter((item) => item.resourceId === resourceId).map((item) => ({ at: item.observedAt, type: "observation", id: item.id, version: item.version })),
      ...source.plan.commitStates.filter((item) => item.resourceId === resourceId).map((item) => ({ at: item.capturedAt, type: "commit-state", id: item.resourceId, version: item.currentVersion })),
      ...source.plan.actions.filter((item) => item.resourceId === resourceId).map((item) => ({ at: item.commitAt, type: "action", id: item.id, version: item.expectedVersion ?? null })),
    ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    console.log(JSON.stringify({ resourceId, events }, null, 2));
    statusExit(result.status);
    return;
  }
  if (command === "graph") {
    const dot = formatDot(result);
    const output = flag("--output");
    if (output) {
      await saveText(output, dot);
      console.log(`Wrote Graphviz consistency graph to ${resolve(output)}`);
    } else console.log(dot);
    statusExit(result.status);
    return;
  }
  if (command === "receipt") {
    const output = flag("--output");
    if (!output) throw new Error("Provide --output <receipt.json>.");
    const receipt = await issueReceipt({ ...source, compilation: result });
    await saveText(output, JSON.stringify(receipt, null, 2), 0o600);
    console.log(`Issued ${receipt.receiptHash} to ${resolve(output)}`);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${help}`);
}

main().catch((error: unknown) => {
  console.error(`MomentSeal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 5;
});
