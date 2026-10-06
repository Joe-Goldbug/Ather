import { describe, test, expect } from "bun:test";

describe("Health Check", () => {
  test("should verify deployment health", async () => {
    // Get the API base from environment or use default
    const apiBase = process.env.VITE_API_BASE || process.env.API_BASE || 'http://localhost:4000';

    console.log(`Testing health at: ${apiBase}/health`);

    try {
      const response = await fetch(`${apiBase}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      console.log('Health check response:', JSON.stringify(data, null, 2));

      expect(data.status).toBe('ok');
      expect(data.database).toBeDefined();
      expect(data.timestamp).toBeDefined();
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  });
});
