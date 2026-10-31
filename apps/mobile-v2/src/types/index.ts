/** ODIN V2 — Shared domain types.

 * Core request/response shapes mirrored from the backend contract
 * (apps/odin-v2/docs/api-contract.md + backend/app/schemas).
 *
 * Centralizes the shape of data flowing between @/services/api and the UI
 * so the presentation layer never depends on the concrete API module.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export interface UserResponse {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
  last_login?: string | null;
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

export interface Conversation {
  id: string;
  title: string | null;
  hermes_session_id: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ConversationList {
  items: Conversation[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateConversationInput {
  title?: string;
  initial_message?: string;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled' | 'interrupted';

export interface Run {
  id: string;
  conversation_id: string;
  hermes_run_id: string | null;
  hermes_session_id: string | null;
  status: RunStatus;
  started_at: string;
  completed_at: string | null;
  result_summary: string | null;
  error: string | null;
  events: Array<{ type: string; data: Record<string, unknown>; timestamp: string }>;
  queue_position: number;
}

export interface RunList {
  items: Run[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateRunInput {
  message: string;
  stream?: boolean;
}

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface Approval {
  id: string;
  run_id: string;
  hermes_approval_id: string | null;
  operation: string;
  details: Record<string, unknown>;
  status: ApprovalStatus;
  created_at: string;
  resolved_at: string | null;
  expires_at: string | null;
}

export interface ApprovalList {
  items: Approval[];
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export type SystemStatus = 'ok' | 'degraded';

export interface SystemStatusComponent {
  status: 'ok' | 'degraded' | 'unknown';
  details: Record<string, unknown> | null;
}

export interface SystemStatusResponse {
  version: string;
  overall: SystemStatus;
  components: Record<string, SystemStatusComponent>;
  hermes_connected: boolean;
  database_connected: boolean;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthResponse {
  ok: boolean;
  version: string;
  timestamp: string;
}
