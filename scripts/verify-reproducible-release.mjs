import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workspace = await mkdtemp(join(tmpdir(), "momentseal-reproducible-"));
const first = join(workspace, "first");
const second = join(workspace, "second");
const run = (output) => spawnSync("bash", ["scripts/package-release.sh", "v0.0.0-test", output], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, SOURCE_DATE_EPOCH: "1785643200" },
});

try {
  for (const output of [first, second]) {
    const result = run(output);
    if (result.status !== 0) throw new Error(`Release packaging failed with exit ${result.status}.\n${result.stdout}\n${result.stderr}`);
  }
  const artifact = "momentseal-v0.0.0-test.tar.gz";
  const [firstBytes, secondBytes] = await Promise.all([readFile(join(first, artifact)), readFile(join(second, artifact))]);
  if (!firstBytes.equals(secondBytes)) throw new Error("Release archives are not byte-for-byte reproducible.");
  const checksum = (await readFile(join(first, "momentseal-v0.0.0-test.sha256"), "utf8")).trim();
  console.log(`MomentSeal reproducible release: ${checksum}`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}
