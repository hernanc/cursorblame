/**
 * Integration test suite entry point.
 * All .test.ts files in this directory are automatically discovered
 * by Mocha via the .vscode-test.mjs configuration.
 */

import * as path from "path";
import * as Mocha from "mocha";
import * as glob from "glob";

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", color: true, timeout: 30000 });
  const testDir = path.resolve(__dirname);

  return new Promise((resolve, reject) => {
    const files = glob.sync("**/*.test.js", { cwd: testDir });
    files.forEach((f) => mocha.addFile(path.resolve(testDir, f)));

    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
}
