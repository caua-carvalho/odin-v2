/** ODIN V2 — API client.

 * Typed axios client wired to the backend contract
 * (apps/odin-v2/backend/app/api/routes + backend/app/schemas).
 *
 * Auth model: native clients carry their own refresh token (X-Odin-Client: mobile)
 * because the web client relies on an HttpOnly cookie. The server returns the
 * refresh token only when that header is present.
 *
 * Auth state is held by the client instance (accessToken / refreshTokenValue),
 * so the http interceptors can transparently refresh an expired token and
 * re-issue the request.
 */

import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { getApiBase, saveStoredServerUrl } from './serverConfig';
import type {
  Approval,
  ApprovalList,
  Conversation,
  ConversationList,
  CreateConversationInput,
  CreateRunInput,
  HealthResponse,
  Run,
  RunList,
  SystemStatusResponse,
  UserResponse,
} from '../types';

export const MOBILE_CLIENT_ID = 'mobile';

interface LoginPayload {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  user?: UserResponse;
}

function isAuthCall(url: string): boolean {
  return /\/api\/auth\/login$|\/api\/auth\/refresh$/.test(url ?? '');
}

class ApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private refreshTokenValue: string | null = null;
  private refreshPromise: Promise<string> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: getApiBase(),
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        [MOBILE_CLIENT_ID]: MOBILE_CLIENT_ID,
      },
    });

    this.client.interceptors.request.use(
      (config) => {
        if (this.accessToken && config.headers) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
        const status = error.response?.status;
        const url = originalRequest?.url ?? '';

        if (status === 401 && originalRequest && !originalRequest._retry && !isAuthCall(url)) {
          originalRequest._retry = true;
          try {
            const newToken = await this.refreshAccessToken();
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            return this.client(originalRequest);
          } catch {
            await this.clearTokens();
            return Promise.reject(error);
          }
        }

        if (status === 401 && !isAuthCall(url)) {
          await this.clearTokens();
        }

        return Promise.reject(error);
      },
    );

    void this.hydrateTokens();
  }

  // ---------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------

  async login(email: string, password: string): Promise<{ user: UserResponse; tokens: { accessToken: string; refreshToken: string; expiresIn: number } }> {
    const res = await this.client.post<LoginPayload>('/api/auth/login', { email, password });
    const data = res.data;
    if (!data.user) throw new Error('Resposta de login inválida no servidor.');

    this.accessToken = data.access_token;
    this.refreshTokenValue = data.refresh_token ?? null;

    await this.saveTokens(data.access_token, this.refreshTokenValue);

    return {
      user: data.user,
      tokens: {
        accessToken: data.access_token,
        refreshToken: this.refreshTokenValue ?? '',
        expiresIn: data.expires_in,
      },
    };
  }

  /** Refresh the access token using the stored refresh token. */
  async refreshAccessToken(): Promise<string> {
    const refreshToken = this.refreshTokenValue;
    if (!refreshToken) throw new Error('Refresh token não encontrado.');

    const res = await this.client.post<LoginPayload>('/api/auth/refresh', { refresh_token: refreshToken });
    const data = res.data;

    this.accessToken = data.access_token;
    this.refreshTokenValue = data.refresh_token ?? null;

    await this.saveTokens(data.access_token, this.refreshTokenValue);

    return data.access_token;
  }

  // ---------------------------------------------------------------------
  // Server configuration
  // ---------------------------------------------------------------------

  async setServerUrl(value: string): Promise<string> {
    const normalized = await saveStoredServerUrl(value);
    this.client.defaults.baseURL = normalized;
    return normalized;
  }

  // ---------------------------------------------------------------------
  // Health / system
  // ---------------------------------------------------------------------

  async getHealth(): Promise<HealthResponse> {
    const res = await this.client.get('/api/health');
    return res.data;
  }

  async getSystemStatus(): Promise<SystemStatusResponse> {
    const res = await this.client.get<SystemStatusResponse>('/api/system/status');
    return res.data;
  }

  async getMe(): Promise<UserResponse> {
    const res = await this.client.get<UserResponse>('/api/auth/me');
    return res.data;
  }

  // ---------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------

  async listConversations(params?: { page?: number; page_size?: number }): Promise<ConversationList> {
    const res = await this.client.get<ConversationList>('/api/conversations', { params });
    return res.data;
  }

  async getConversation(id: string): Promise<Conversation> {
    const res = await this.client.get<Conversation>(`/api/conversations/${id}`);
    return res.data;
  }

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    const res = await this.client.post<Conversation>('/api/conversations', input);
    return res.data;
  }

  // ---------------------------------------------------------------------
  // Runs
  // ---------------------------------------------------------------------

  async listRuns(params?: { page?: number; page_size?: number; status?: string }): Promise<RunList> {
    const res = await this.client.get<RunList>('/api/runs', { params });
    return res.data;
  }

  async getActiveRun(conversationId: string): Promise<Run | null> {
    try {
      const res = await this.client.get<Run>(`/api/conversations/${conversationId}/runs/active`);
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      throw err;
    }
  }

  async createRun(conversationId: string, input: CreateRunInput): Promise<Run> {
    const res = await this.client.post<Run>(`/api/conversations/${conversationId}/runs`, input);
    return res.data;
  }

  async stopRun(runId: string): Promise<{ ok: boolean; run_id: string; status: string }> {
    const res = await this.client.post<{ ok: boolean; run_id: string; status: string }>(`/api/runs/${runId}/stop`, undefined, { headers: { 'Content-Type': 'application/json' } });
    return res.data;
  }

  // ---------------------------------------------------------------------
  // Approvals
  // ---------------------------------------------------------------------

  async listApprovals(): Promise<ApprovalList> {
    const res = await this.client.get<ApprovalList>('/api/approvals');
    return res.data;
  }

  async approve(approvalId: string, choice?: string): Promise<{ ok: boolean; approval_id: string; status: string }> {
    const res = await this.client.post<{ ok: boolean; approval_id: string; status: string }>(`/api/approvals/${approvalId}/approve${choice ? `?choice=${choice}` : ''}`);
    return res.data;
  }

  async deny(approvalId: string, choice?: string): Promise<{ ok: boolean; approval_id: string; status: string }> {
    const res = await this.client.post<{ ok: boolean; approval_id: string; status: string }>(`/api/approvals/${approvalId}/deny${choice ? `?choice=${choice}` : ''}`);
    return res.data;
  }

  // ---------------------------------------------------------------------
  // Knowledge (Memory module)
  // ---------------------------------------------------------------------

  async listKnowledge(params?: { page?: number; page_size?: number; type?: string; query?: string }): Promise<{ items: Array<{ id: string; type: string; title: string; content: string; url: string | null; tags: string[] }>; total: number; page: number; page_size: number }> {
    const res = await this.client.get('/api/knowledge', { params });
    return res.data;
  }

  // ---------------------------------------------------------------------
  // Token persistence
  // ---------------------------------------------------------------------

  async saveTokens(accessToken: string, refreshToken: string | null): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync('odin_access_token', accessToken),
      SecureStore.setItemAsync('odin_refresh_token', refreshToken ?? ''),
    ]);
  }

  async loadTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync('odin_access_token').catch(() => null),
      SecureStore.getItemAsync('odin_refresh_token').catch(() => null),
    ]);
    return { accessToken, refreshToken: refreshToken ?? null };
  }

  /** Populate the instance auth fields from persisted (possibly expired) tokens. */
  private async hydrateTokens(): Promise<void> {
    const { accessToken, refreshToken } = await api.loadTokens();
    this.accessToken = accessToken;
    this.refreshTokenValue = refreshToken;
  }

  async clearTokens(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync('odin_access_token').catch(() => undefined),
      SecureStore.deleteItemAsync('odin_refresh_token').catch(() => undefined),
    ]);
    this.accessToken = null;
    this.refreshTokenValue = null;
  }
}

export const api = new ApiClient();

// Re-export domain types for convenience in the presentation layer.
export type {
  Approval,
  ApprovalList,
  Conversation,
  ConversationList,
  CreateConversationInput,
  CreateRunInput,
  HealthResponse,
  Run,
  RunList,
  SystemStatusResponse,
  UserResponse,
};
