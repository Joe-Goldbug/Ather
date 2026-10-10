/** @vitest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnderstandingPanel } from './understanding-panel';

const api = vi.hoisted(() => ({
  capabilities: vi.fn(), create: vi.fn(), append: vi.fn(), generate: vi.fn(), get: vi.fn(), state: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ understandingApi: api }));

const session = {
  id: 'session-1', source_ref: { kind: 'free_entry' }, source_snapshot: { observation_text: null, observation_focus: null },
  locale: 'zh-CN', state: 'open', version: 1, revoked_at: null, saved_at: null, expires_at: null,
  created_at: '2026-10-10T00:00:00.000Z', turns: [],
  capabilities: { can_generate: false, can_save: false, can_reopen: false },
};

describe('UnderstandingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.capabilities.mockResolvedValue({ home_chat: true, result_followup: true });
    api.create.mockResolvedValue(session);
  });

  it('requires explicit processing consent before creating an understanding session', async () => {
    render(<UnderstandingPanel source={{ kind: 'free_entry' }} />);
    const start = await screen.findByRole('button', { name: '开始聊这件事' });
    fireEvent.click(start);
    expect(api.create).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('请先确认');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(start);
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ processing_consent: true })));
  });

  it('can explain staged availability without exposing a dead entry point', async () => {
    api.capabilities.mockResolvedValue({ home_chat: false, result_followup: false });
    render(<UnderstandingPanel source={{ kind: 'free_entry' }} unavailableMessage="正在逐步开放。" />);
    expect(await screen.findByText('正在逐步开放。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始聊这件事' })).toBeNull();
  });
});
