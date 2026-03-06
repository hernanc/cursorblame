import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "test/integration/suite/**/*.test.ts",
  extensionDevelopmentPath: ".",
  launchArgs: ["--disable-extensions"],
  mocha: {
    require: ["ts-node/register/transpile-only"],
    timeout: 30000,
  },
  workspaceFolder: "./test/fixtures",
});
