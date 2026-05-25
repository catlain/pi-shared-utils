import { defineConfig } from "vitest/config";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

export default defineConfig({
  resolve: {
    alias: {
      "pi-shared-utils": path.resolve(ROOT, "packages/pi-shared-utils/src/index"),
      "@pi-atelier/shared-utils": path.resolve(ROOT, "packages/pi-shared-utils/src/index"),
    },
  },
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    environment: "node",
    testTimeout: 10000,
  },
});
