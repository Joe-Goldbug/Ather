import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Frontend Production Config", () => {
  test("should not contain staging URLs", () => {
    const envPath = resolve(__dirname, "../frontend/.env.production");
    const content = readFileSync(envPath, "utf-8");

    expect(content).not.toContain("staging-");
    expect(content).not.toContain("http://localhost:");
  });

  test("should use production API base", () => {
    const envPath = resolve(__dirname, "../frontend/.env.production");
    const content = readFileSync(envPath, "utf-8");

    expect(content).toContain("VITE_API_BASE=https://prod-eva-cyberpunk-self-discovery");
    expect(content).toContain("VITE_CLIENT_TARGET=https://prod-eva-cyberpunk-self-discovery");
  });
});
