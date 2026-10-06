import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const NEON_TS_PATH = join(import.meta.dirname, "..", "..", "backend", "db", "neon.ts");

describe("Database Connection Pool", () => {
  test("should configure max_connections", () => {
    const content = readFileSync(NEON_TS_PATH, "utf-8");

    // Should contain max_connections configuration
    expect(content).toContain("max_connections");
    expect(content).toMatch(/max_connections:\s*\d+/);
  });

  test("should have reasonable connection limit", () => {
    const content = readFileSync(NEON_TS_PATH, "utf-8");

    const match = content.match(/max_connections:\s*(\d+)/);
    if (match) {
      const maxConnections = parseInt(match[1], 10);
      expect(maxConnections).toBeGreaterThanOrEqual(10);
      expect(maxConnections).toBeLessThanOrEqual(50);
    }
  });
});
