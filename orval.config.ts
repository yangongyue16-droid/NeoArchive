import { defineConfig } from "orval";

export default defineConfig({
  neoarchive: {
    input: "./schemas/openapi.json",
    output: {
      target: "./src/api/generated/index.ts",
      client: "fetch",
      clean: true,
    },
  },
});
