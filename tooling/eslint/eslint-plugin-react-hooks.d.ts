/**
 * Type augmentation for eslint-plugin-react-hooks v6.x
 *
 * The upstream index.d.ts uses `export * from './cjs/...'` which doesn't
 * forward the default export. This means TypeScript can't see `configs`
 * on the default import. Fixed in v7 via facebook/react#34949 — but v7
 * has its own issues (broken zod-validation-error resolution in 7.0.1,
 * loose Record<string, ...> typing in 7.0.0). Remove this file when a
 * working v7.x release is available.
 *
 * @see https://github.com/facebook/react/issues/34801
 * @see https://github.com/facebook/react/issues/35045
 */
declare module "eslint-plugin-react-hooks" {
  import type { Linter } from "eslint";

  const plugin: {
    meta: { name: string };
    rules: Record<string, unknown>;
    configs: {
      "recommended-legacy": { plugins: string[]; rules: Linter.RulesRecord };
      "recommended-latest-legacy": {
        plugins: string[];
        rules: Linter.RulesRecord;
      };
      "flat/recommended": Linter.Config[];
      "recommended-latest": Linter.Config[];
      recommended: Linter.Config[];
    };
  };

  export default plugin;
}
