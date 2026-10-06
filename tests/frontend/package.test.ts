import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT_DIR = "D:/start-up/eva-cyberpunk-self-discovery/.worktrees/db-critical-fixes";

describe("Frontend Package Configuration", () => {
  test("should have meaningful test script", () => {
    const content = readFileSync(join(ROOT_DIR, "frontend/package.json"), "utf-8");
    const pkg = JSON.parse(content);

    expect(pkg.scripts.test).not.toBe("echo \"No tests configured yet\"");
    expect(pkg.scripts.test).toBeTruthy();
  });

  test("should have test:unit or test script with actual command", () => {
    const content = readFileSync(join(ROOT_DIR, "frontend/package.json"), "utf-8");
    const pkg = JSON.parse(content);

    const testScript = pkg.scripts.test || "";
    const hasTestCommand = testScript.includes("vitest") ||
                          testScript.includes("jest") ||
                          testScript.includes("playwright") ||
                          testScript.includes("bun test");

    expect(hasTestCommand).toBe(true);
  });

  test("should have vitest as dev dependency", () => {
    const content = readFileSync(join(ROOT_DIR, "frontend/package.json"), "utf-8");
    const pkg = JSON.parse(content);

    expect(pkg.devDependencies?.vitest).toBeTruthy();
  });
});
