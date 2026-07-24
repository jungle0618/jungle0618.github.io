import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/analyze-card-values.balance.js"],
  },
});
