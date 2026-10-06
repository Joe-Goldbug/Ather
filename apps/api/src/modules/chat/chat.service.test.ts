import { ForbiddenException } from '@nestjs/common';
import { computeUBVEvidenceEvents, processChat } from '@eva/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatService } from './chat.service.js';

vi.mock('@eva/core', () => ({
  processChat: vi.fn(),
  computeUBVEvidenceEvents: vi.fn(() => []),
}));

describe('legacy chat consent during a request', () => {
  let granted: boolean;
  let query: ReturnType<typeof vi.fn>;
  let saveUserMemory: ReturnType<typeof vi.fn>;
  let getUserMemory: ReturnType<typeof vi.fn>;
  let writeMany: ReturnType<typeof vi.fn>;
  let service: ChatService;
  let client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    granted = true;
    query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM consent_grants')) return { rows: [{ granted }] };
      if (sql.includes('INSERT INTO conversations') && sql.includes('RETURNING id')) {
        return { rows: [{ id: 'conversation-1' }] };
      }
      return { rows: [] };
    });
    client = { query, release: vi.fn() };
    saveUserMemory = vi.fn();
    getUserMemory = vi.fn(async () => ({
      meta: {},
      quick_state: { active_topics: [] },
      conversation_history: [],
    }));
    writeMany = vi.fn();
    service = new ChatService(
      { pool: { query, connect: vi.fn(async () => client) } } as never,
      {
        getUserMemory,
        getBaselineCompleted: vi.fn(async () => true),
        saveUserMemory,
      } as never,
      { getReportByConversation: vi.fn(), triggerReport: vi.fn() } as never,
      { getRecentCorrections: vi.fn(async () => []), getInsightCandidates: vi.fn(async () => ({ candidates: [] })), writeMany } as never,
      { get: vi.fn(), set: vi.fn() } as never,
    );
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('checks consent again immediately before an LLM request', async () => {
    vi.mocked(processChat).mockImplementation(async ({ llm_caller }) => {
      granted = false;
      await llm_caller({ system: 'system', messages: [{ role: 'user', content: 'private' }] });
      throw new Error('unexpected model response');
    });

    await expect(service.sendMessage('user-1', 'private')).rejects.toThrow(ForbiddenException);
    expect(saveUserMemory).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => String(sql).includes('ON CONFLICT (id) DO UPDATE'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('BEGIN'))).toBe(false);
  });

  it('does not persist the result if consent is revoked while processing', async () => {
    vi.mocked(processChat).mockImplementation(async () => {
      granted = false;
      return {
        updated_memory: { meta: {}, conversation_history: [], quick_state: { active_topics: [] } },
        updated_state: { phase: 'probing' },
      } as never;
    });

    await expect(service.sendMessage('user-1', 'private')).rejects.toThrow(ForbiddenException);
    expect(saveUserMemory).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => String(sql).includes('ON CONFLICT (id) DO UPDATE'))).toBe(false);
    expect(query.mock.calls.map(([sql]) => sql)).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('persists the result when consent remains granted', async () => {
    vi.mocked(processChat).mockResolvedValue({
      updated_memory: { meta: {}, conversation_history: [], quick_state: { active_topics: [] } },
      updated_state: { phase: 'probing' },
    } as never);

    await service.sendMessage('user-1', 'private');

    expect(saveUserMemory).toHaveBeenCalledOnce();
    expect(saveUserMemory).toHaveBeenCalledWith('user-1', expect.any(Object), client);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('ON CONFLICT (id) DO UPDATE'))).toBe(true);
    expect(query.mock.calls.map(([sql]) => sql)).toContain('COMMIT');
    expect(query.mock.calls.filter(([sql]) => String(sql).includes('FROM consent_grants'))).toHaveLength(2);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('FROM consent_grants') && String(sql).includes('FOR SHARE'))).toBe(true);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back the turn if a write fails before commit', async () => {
    vi.mocked(processChat).mockResolvedValue({
      updated_memory: { meta: {}, conversation_history: [], quick_state: { active_topics: [] } },
      updated_state: { phase: 'probing' },
    } as never);
    saveUserMemory.mockRejectedValue(new Error('write failed'));

    await expect(service.sendMessage('user-1', 'private')).rejects.toThrow('write failed');

    expect(query.mock.calls.map(([sql]) => sql)).toContain('ROLLBACK');
    expect(query.mock.calls.map(([sql]) => sql)).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('writes chat evidence through the same transaction client', async () => {
    getUserMemory.mockResolvedValue({
      meta: {}, quick_state: { active_topics: [] }, conversation_history: [], ubv: { work: { value: 50 } },
    });
    vi.mocked(processChat).mockResolvedValue({
      updated_memory: { meta: {}, conversation_history: [], quick_state: { active_topics: [] }, ubv: { work: { value: 60 } } },
      updated_state: { phase: 'probing' },
    } as never);
    vi.mocked(computeUBVEvidenceEvents).mockReturnValue([{ userId: 'user-1', sourceType: 'chat' }] as never);

    await service.sendMessage('user-1', 'private');

    expect(writeMany).toHaveBeenCalledWith(expect.any(Array), client);
    expect(query.mock.calls.map(([sql]) => sql)).toContain('COMMIT');
  });
});
