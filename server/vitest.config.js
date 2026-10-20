import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup.js"],
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
    // Remote MongoDB plus bcrypt makes individual tests slower than the default allows.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
