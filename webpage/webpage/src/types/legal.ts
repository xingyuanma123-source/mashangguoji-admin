export type ContractCategory = 'transport' | 'lease' | 'labor' | 'purchase' | 'service' | 'other';
export type ContractStatus = 'active' | 'renewed' | 'terminated';
export type RiskLevel = 'high' | 'medium' | 'low';
export type LegalDocumentType = 'template' | 'policy' | 'regulation' | 'litigation' | 'authorization' | 'other';

export interface Contract {
  id: number;
  title: string;
  contract_no?: string | null;
  counterparty: string;
  category: ContractCategory;
  amount?: number | null;
  currency: string;
  sign_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  auto_renew: boolean;
  renew_notice_days?: number | null;
  owner_staff_id?: number | null;
  status: ContractStatus;
  renewed_from_id?: number | null;
  remark?: string | null;
  ocr_text?: string | null;
  extracted?: Record<string, unknown> | null;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ExpiringContract extends Contract {
  days_left: number;
  effective_days_left: number;
  alert_level: 90 | 60 | 30;
  acked: boolean;
}

export interface ContractReviewRecord {
  id: number;
  contract_id: number;
  review_type: 'risk_scan' | 'template_diff';
  template_version_id?: number | null;
  model?: string | null;
  risk_level?: RiskLevel | null;
  summary?: string | null;
  findings?: ContractFinding[] | null;
  created_at: string;
}

export interface ContractFile {
  id: number;
  contract_id: number;
  storage_path: string;
  file_name: string;
  mime_type?: string | null;
  file_size?: number | null;
  created_at: string;
}

export interface ContractFinding {
  clause?: string;
  risk: string;
  suggestion: string;
  severity: RiskLevel;
}

export interface LegalDocument {
  id: number;
  title: string;
  doc_type: LegalDocumentType;
  tags: string[];
  current_version_id?: number | null;
  is_active: boolean;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
  current_version?: LegalDocumentVersion | null;
  excerpt?: string | null;
}

export interface LegalDocumentVersion {
  id: number;
  document_id: number;
  version_no: number;
  storage_path: string;
  file_name: string;
  mime_type?: string | null;
  file_size?: number | null;
  content_text?: string | null;
  text_status: 'done' | 'pending' | 'failed';
  note?: string | null;
  created_by?: number | null;
  created_at: string;
}
