export type MatterType = 'claim' | 'contract_review' | 'collection' | 'consult' | 'dispute' | 'other';
export type MatterStatus = 'open' | 'in_progress' | 'awaiting' | 'resolved' | 'closed';
export type MatterPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface Matter {
  id: number;
  type: MatterType;
  title: string;
  status: MatterStatus;
  priority: MatterPriority;
  counterparty?: string | null;
  amount?: number | null;
  statute_deadline?: string | null;
  owner_staff_id?: number | null;
  summary?: string | null;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
}

export interface MatterLink {
  id: number;
  matter_id: number;
  target_type: 'contract' | 'legal_document' | 'file' | 'draft';
  target_id: number;
  relation?: string | null;
  created_at: string;
}

export type AgentRunStatus = 'running' | 'suspended' | 'completed' | 'failed' | 'cancelled';

export interface AgentRunStep {
  tool: string;
  args: Record<string, unknown>;
  result_digest?: string;
  approved_by?: number;
  rejected_by?: number;
  ts: string;
}

export interface AgentRun {
  id: number;
  matter_id?: number | null;
  status: AgentRunStatus;
  user_message: string;
  steps: AgentRunStep[];
  pending_approval?: { tool_call_id: string; name: string; arguments: Record<string, unknown> } | null;
  final_text?: string | null;
  model?: string | null;
  created_by?: number | null;
  created_at: string;
  completed_at?: string | null;
}

export interface LegalDraft {
  id: number;
  matter_id: number;
  doc_kind: string;
  title: string;
  content: string;
  status: 'draft' | 'approved' | 'sent' | 'void';
  approved_by?: number | null;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LegalTask {
  id: number;
  matter_id?: number | null;
  title: string;
  detail?: string | null;
  assignee_staff_id?: number | null;
  due_date?: string | null;
  source: 'agent' | 'radar' | 'manual';
  status: 'open' | 'done' | 'dismissed';
  created_at: string;
}

export interface PlaybookRule {
  id: number;
  contract_category: 'transport' | 'lease' | 'labor' | 'purchase' | 'service' | 'other';
  clause_topic: string;
  ideal_position: string;
  fallback_position?: string | null;
  red_line?: string | null;
  suggested_language?: string | null;
  negotiation_tip?: string | null;
  is_active: boolean;
  updated_at: string;
}

// SSE 事件（与 agent-proxy 对齐）
export type AgentStreamEvent =
  | { type: 'run_created'; run_id: number }
  | { type: 'tool_start'; name: string; arguments: Record<string, unknown>; approved?: boolean }
  | { type: 'tool_result'; name: string; result_digest: string }
  | { type: 'tool_rejected'; name: string }
  | { type: 'approval_required'; run_id: number; call: { name: string; arguments: Record<string, unknown> } }
  | { type: 'delta'; text: string }
  | { type: 'final'; text: string }
  | { type: 'error'; error: string };
