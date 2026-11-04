import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(__dirname, "../..");

// Runs the coach comparison through vitest so the real tool definitions and
// context rendering load with the database mocked. Not part of `npm test`.
export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "server-only": path.resolve(root, "vitest.server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/coach-eval/*.eval.ts"],
    testTimeout: 6 * 60 * 60 * 1000,
    hookTimeout: 60_000,
    globals: true,
  },
});
