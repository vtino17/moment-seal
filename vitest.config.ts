import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    exclude: ["packages/*/src/**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**/*.ts", "packages/node/src/**/*.ts", "packages/cli/src/format.ts"],
      exclude: ["**/*.test.ts", "**/sample.ts", "**/index.ts", "**/types.ts"],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 },
    },
  },
});
