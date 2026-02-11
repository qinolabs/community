/**
 * Manual type declarations for ESLint plugins that don't ship their own types.
 *
 * Plugins that now ship types and no longer need declarations here:
 * - eslint-plugin-react (v7.37+)
 * - eslint-plugin-react-hooks (v6+)
 */

declare module "@tanstack/eslint-config" {
  import type { Linter, Rule } from "eslint";

  export const tanstackConfig: Linter.Config<Linter.RulesRecord>[];
  export const rules: Record<string, Rule.RuleModule>;
}
