import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["paquetes/**/src/**/*.test.ts", "apps/**/src/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
  },
});
