import { renderHook, act } from '@testing-library/react';
import { useAuthMachine } from './useAuthMachine';
import { authApi } from '../lib/api';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/api', () => ({
  authApi: {
    sendCode: vi.fn(),
    verifyCode: vi.fn(),
  },
}));

describe('useAuthMachine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with step email and idle status', () => {
    const { result } = renderHook(() => useAuthMachine());
    expect(result.current.step).toBe('email');
    expect(result.current.status).toBe('idle');
    expect(result.current.email).toBe('');
    expect(result.current.countdown).toBe(0);
  });

  it('should transition to otp step and start countdown on successful sendCode', async () => {
    vi.mocked(authApi.sendCode).mockResolvedValue({ success: true, message: 'OTP sent' });
    const { result } = renderHook(() => useAuthMachine());

    await act(async () => {
      await result.current.sendCode('test@example.com');
    });

    expect(result.current.step).toBe('otp');
    expect(result.current.status).toBe('idle');
    expect(result.current.email).toBe('test@example.com');
    expect(result.current.countdown).toBe(300);

    // Advance timer by 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.countdown).toBe(299);
  });

  it('should handle sendCode error', async () => {
    vi.mocked(authApi.sendCode).mockRejectedValue(new Error('Rate limited'));
    const { result } = renderHook(() => useAuthMachine());

    await act(async () => {
      await result.current.sendCode('test@example.com');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Rate limited');
    expect(result.current.step).toBe('email');
  });

  it('should handle verifyCode success', async () => {
    vi.mocked(authApi.sendCode).mockResolvedValue({ success: true, message: 'OTP sent' });
    vi.mocked(authApi.verifyCode).mockResolvedValue({ user_id: '1', email: 'test@example.com' });
    const { result } = renderHook(() => useAuthMachine());

    await act(async () => {
      await result.current.sendCode('test@example.com');
    });

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(result.current.status).toBe('success');
  });

  it('should handle verifyCode error', async () => {
    vi.mocked(authApi.sendCode).mockResolvedValue({ success: true, message: 'OTP sent' });
    vi.mocked(authApi.verifyCode).mockRejectedValue(new Error('Invalid code'));
    const { result } = renderHook(() => useAuthMachine());

    await act(async () => {
      await result.current.sendCode('test@example.com');
    });

    await act(async () => {
      await result.current.verifyCode('123456');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Invalid code');
    expect(result.current.step).toBe('otp');
  });
});
