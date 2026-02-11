import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "qino-lab-mcp",
    globals: true,
    environment: "node",
  },
});
