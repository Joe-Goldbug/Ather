import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";

describe("Auth Transaction Safety", () => {
  test("verifyLoginCode should use transaction wrapper", () => {
    const content = readFileSync("backend/auth/verifyLoginCode.ts", "utf-8");

    // Should import withTransaction
    expect(content).toContain("withTransaction");

    // Should use transaction for critical operations
    expect(content).toMatch(/withTransaction\s*\(/);
  });

  test("sendLoginCode should use transaction for challenge operations", () => {
    const content = readFileSync("backend/auth/sendLoginCode.ts", "utf-8");

    // Should import transaction utilities
    expect(content).toContain("withTransaction");

    // Challenge invalidation and creation should be atomic
    expect(content).toMatch(/withTransaction\s*\(/);
  });
});
