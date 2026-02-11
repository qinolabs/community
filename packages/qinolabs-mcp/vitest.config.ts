import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "qinolabs-mcp",
    globals: true,
    environment: "node",
  },
});
