import { describe, expect, it } from "vitest";
import { compileMoments, racyPlan, racyPolicy, safePlan, safePolicy } from "@momentseal/core";
import { formatCompilation, formatDot } from "./format.js";

describe("CLI formatting", () => {
  it("renders a clean terminal report", async () => {
    const output = formatCompilation(await compileMoments({ plan: safePlan, policy: safePolicy }));
    expect(output).toContain("MOMENTSEAL CLEAN · 100/100");
    expect(output).toContain("✓ settle-invoice");
  });

  it("renders blocked finding codes", async () => {
    const output = formatCompilation(await compileMoments({ plan: racyPlan, policy: racyPolicy }));
    expect(output).toContain("state-version-drift");
    expect(output).toContain("BLOCK");
  });

  it("renders an evidence and dependency graph", async () => {
    const output = formatDot(await compileMoments({ plan: safePlan, policy: safePolicy }));
    expect(output).toContain("digraph MomentSeal");
    expect(output).toContain("observation:invoice-v7");
    expect(output).toContain("action:settle-invoice");
    expect(output).toContain("state:invoice-at-commit");
    expect(output).toContain("label=\"depends\"");
  });
});
