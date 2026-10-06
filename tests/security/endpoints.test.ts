import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const PROJECT_ROOT = join(import.meta.dir, "../..");

describe("Security: Debug/Test Endpoints", () => {
  test("healthCheck debug endpoint should not use env expression", () => {
    const content = readFileSync(join(PROJECT_ROOT, "backend/auth/healthCheck.ts"), "utf-8");

    // Should use boolean literal, not env expression
    expect(content).not.toContain("process.env.NODE_ENV !== 'production'");
    expect(content).toContain('expose: true'); // Should be boolean literal
  });

  test("test endpoints should have expose: false", () => {
    const testFiles = [
      join(PROJECT_ROOT, "backend/auth/testDb.ts"),
      join(PROJECT_ROOT, "backend/auth/testEmail.ts"),
      join(PROJECT_ROOT, "backend/auth/sendLoginCode.debug.ts")
    ];

    for (const file of testFiles) {
      const content = readFileSync(file, "utf-8");
      const exposeMatch = content.match(/expose:\s*(\w+)/);
      if (exposeMatch) {
        expect(exposeMatch[1]).toBe("false");
      }
    }
  });
});
