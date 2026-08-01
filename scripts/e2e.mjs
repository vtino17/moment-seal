import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const cli = join(root, "packages/cli/dist/index.js");
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
const runWithPassphrase = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8", env: { ...process.env, MOMENTSEAL_KEY_PASSPHRASE: "e2e-only-passphrase-2026" } });
const expectExit = (result, expected, label) => {
  if (result.status !== expected) throw new Error(`${label}: expected exit ${expected}, received ${result.status}\n${result.stdout}\n${result.stderr}`);
};
const workspace = await mkdtemp(join(tmpdir(), "moment-seal-e2e-"));

try {
  const safe = run("compile", "examples/safe-plan.json", "--policy", "examples/safe-policy.json");
  expectExit(safe, 0, "safe compile");
  if (!safe.stdout.includes("MOMENTSEAL CLEAN")) throw new Error("Safe compilation did not report CLEAN.");

  const racy = run("compile", "examples/racy-plan.json", "--policy", "examples/racy-policy.json");
  expectExit(racy, 2, "racy compile");
  if (!racy.stdout.includes("state-version-drift")) throw new Error("Racy compilation did not explain version drift.");

  const receiptFile = join(workspace, "receipt.json");
  expectExit(run("receipt", "examples/safe-plan.json", "--policy", "examples/safe-policy.json", "--output", receiptFile), 0, "receipt issuance");
  expectExit(run("receipt", "examples/safe-plan.json", "--policy", "examples/safe-policy.json", "--output", receiptFile), 5, "exclusive receipt write");
  expectExit(run("verify", receiptFile, "--plan", "examples/safe-plan.json", "--policy", "examples/safe-policy.json"), 0, "receipt verification");

  const privateKeyFile = join(workspace, "receipt-signing-private.pem");
  const publicKeyFile = join(workspace, "receipt-signing-public.pem");
  const signedReceiptFile = join(workspace, "signed-receipt.json");
  expectExit(runWithPassphrase("keygen", "--private-output", privateKeyFile, "--public-output", publicKeyFile), 0, "encrypted signing key generation");
  if (((await stat(privateKeyFile)).mode & 0o777) !== 0o600) throw new Error("Private signing key permissions are not 0600.");
  expectExit(runWithPassphrase("sign", receiptFile, "--private-key", privateKeyFile, "--plan", "examples/safe-plan.json", "--policy", "examples/safe-policy.json", "--output", signedReceiptFile), 0, "receipt signing");
  expectExit(run("verify-signed", signedReceiptFile, "--public-key", publicKeyFile, "--plan", "examples/safe-plan.json", "--policy", "examples/safe-policy.json"), 0, "signed receipt verification");
  const signedReceipt = JSON.parse(await readFile(signedReceiptFile, "utf8"));
  signedReceipt.signature.value = `${signedReceipt.signature.value.slice(0, -1)}A`;
  await writeFile(signedReceiptFile, `${JSON.stringify(signedReceipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  expectExit(run("verify-signed", signedReceiptFile, "--public-key", publicKeyFile, "--plan", "examples/safe-plan.json", "--policy", "examples/safe-policy.json"), 4, "tampered signature verification");

  const receipt = JSON.parse(await readFile(receiptFile, "utf8"));
  receipt.committedActionIds = [];
  await writeFile(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  expectExit(run("verify", receiptFile, "--plan", "examples/safe-plan.json", "--policy", "examples/safe-policy.json"), 4, "tampered receipt verification");

  const graphFile = join(workspace, "graph.dot");
  expectExit(run("graph", "examples/safe-plan.json", "--policy", "examples/safe-policy.json", "--output", graphFile), 0, "graph export");
  if (!(await readFile(graphFile, "utf8")).includes("state:invoice-at-commit")) throw new Error("Graph omitted the per-action commit state.");

  const oversized = join(workspace, "oversized.json");
  await writeFile(oversized, " ".repeat(1_048_577));
  expectExit(run("inspect", oversized), 5, "oversized input rejection");
  console.log("MomentSeal E2E: compile/receipt/signature/tamper/permissions/overwrite/graph/input-limit checks passed.");
} finally {
  await rm(workspace, { recursive: true, force: true });
}
