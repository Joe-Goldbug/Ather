/**
 * EVA API Client for Synthetic User Agents
 * Reuses validated patterns from smoke-test.ts
 */

const API_BASE = process.env.VITE_API_BASE || process.env.API_BASE || 'http://localhost:3001';

export interface AuthSession {
  token: string;
  userId: string;
  email: string;
}

export interface QuestionOption {
  id: 'A' | 'B' | 'C' | 'D';
  label?: string;
  text?: string;
}

export interface RoundNextState {
  state: 'question' | 'ready' | 'completed';
  item_id?: string;
  question?: {
    id: string;
    text: string;
    options: QuestionOption[];
  };
}

export interface StartRoundResponse {
  round: {
    id: string;
    theme_lens: string;
    status: string;
  };
  next: RoundNextState;
}

export interface CompleteRoundResponse {
  result_revision_id: string;
  feedback_state: string;
  latest_feedback: unknown | null;
}

export interface FeedbackResponse {
  response_id: string;
  action: 'confirm' | 'partial' | 'refute' | 'clarify';
  state: string;
  replayed: boolean;
}

function extractSessionToken(rawSetCookie: string | null): string | null {
  if (!rawSetCookie) return null;
  const match = rawSetCookie.match(/(?:^|;\s*|,\s*)eva_session=([^;,\s]+)/);
  return match?.[1] ?? null;
}

async function readJsonSafe(res: Response): Promise<any> {
  return res.json().catch(async () => ({ message: await res.text().catch(() => res.statusText) }));
}

export class AtherAgentApiClient {
  private base: string;
  private token?: string;
  private clientIp: string;

  constructor(token?: string, clientIp: string = '192.0.2.10') {
    this.base = API_BASE;
    this.token = token;
    this.clientIp = clientIp;
  }

  setToken(token: string) {
    this.token = token;
  }

  private async request<T = any>(
    path: string,
    opts: RequestInit = {}
  ): Promise<{ response: Response; data: T; durationMs: number }> {
    const start = Date.now();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-forwarded-for': this.clientIp,
      ...(opts.headers as Record<string, string>),
    };

    if (this.token) {
      headers.Cookie = `eva_session=${this.token}`;
    }

    const response = await fetch(`${this.base}${path}`, {
      ...opts,
      headers,
    });

    const data = await readJsonSafe(response);
    const durationMs = Date.now() - start;

    if (!response.ok) {
      const errMsg = (data as any)?.message || response.statusText;
      throw new Error(`${opts.method ?? 'GET'} ${path} -> HTTP ${response.status}: ${errMsg}`);
    }

    return { response, data, durationMs };
  }

  /**
   * Register or Authenticate a unique synthetic user email
   */
  async authenticate(email: string): Promise<AuthSession> {
    const start = Date.now();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-forwarded-for': this.clientIp,
    };

    const response = await fetch(`${this.base}/auth/send-code`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email }),
    });

    const data = await readJsonSafe(response);
    if (!response.ok) {
      throw new Error(`POST /auth/send-code -> HTTP ${response.status}: ${data?.message || response.statusText}`);
    }

    const token = extractSessionToken(response.headers.get('set-cookie'));
    if (data?.dev_auto_login && token) {
      this.token = token;
      return {
        token,
        userId: String(data.user_id),
        email,
      };
    }

    // If OTP challenge mode is returned, attempt dev-auto-verify or fallback
    throw new Error(`Auto-login not enabled for email: ${email}. Ensure dev mode auto login is active.`);
  }

  /**
   * Start a theme assessment round
   */
  async startThemeRound(themeLens: string = 'emotion', locale: string = 'zh-CN'): Promise<StartRoundResponse> {
    const { data } = await this.request<StartRoundResponse>('/v1/assessment-rounds', {
      method: 'POST',
      body: JSON.stringify({ theme_lens: themeLens, locale }),
    });
    return data;
  }

  /**
   * Submit an answer to a question in a round
   */
  async answerThemeItem(
    roundId: string,
    itemId: string,
    choiceId: string,
    freeText?: string
  ): Promise<RoundNextState> {
    const { data } = await this.request<RoundNextState>(
      `/v1/assessment-rounds/${roundId}/items/${itemId}/responses`,
      {
        method: 'POST',
        body: JSON.stringify({
          operation_id: crypto.randomUUID(),
          choice_id: choiceId,
          free_text: freeText,
        }),
      }
    );
    return data;
  }

  /**
   * Complete the theme round
   */
  async completeThemeRound(roundId: string): Promise<CompleteRoundResponse> {
    const { data } = await this.request<CompleteRoundResponse>(
      `/v1/assessment-rounds/${roundId}/complete`,
      {
        method: 'POST',
      }
    );
    return data;
  }

  /**
   * Submit portrait feedback (confirm / partial / refute / clarify)
   */
  async submitResultResponse(
    roundId: string,
    action: 'confirm' | 'partial' | 'refute' | 'clarify',
    explanation?: string
  ): Promise<FeedbackResponse> {
    const { data } = await this.request<FeedbackResponse>(
      `/v1/assessment-rounds/${roundId}/result/responses`,
      {
        method: 'POST',
        body: JSON.stringify({
          operation_id: crypto.randomUUID(),
          action,
          explanation: explanation || '根据当前情境生成的评估反馈。',
        }),
      }
    );
    return data;
  }

  /**
   * Read the latest result
   */
  async getResult(roundId: string): Promise<any> {
    const { data } = await this.request(`/v1/assessment-rounds/${roundId}/result`);
    return data;
  }
}
