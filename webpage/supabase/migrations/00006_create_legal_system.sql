CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS contracts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL, contract_no TEXT, counterparty TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('transport','lease','labor','purchase','service','other')),
  amount NUMERIC(14,2), currency TEXT NOT NULL DEFAULT 'CNY', sign_date DATE, start_date DATE, end_date DATE,
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE, renew_notice_days INT,
  owner_staff_id BIGINT REFERENCES service_staff(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','renewed','terminated')),
  renewed_from_id BIGINT REFERENCES contracts(id), remark TEXT, ocr_text TEXT, extracted JSONB,
  created_by BIGINT REFERENCES service_staff(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts (end_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_contracts_trgm ON contracts USING gin ((coalesce(title,'') || ' ' || coalesce(counterparty,'') || ' ' || coalesce(contract_no,'')) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS contract_files (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, contract_id BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL, file_name TEXT NOT NULL, mime_type TEXT, file_size BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contract_reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, contract_id BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL DEFAULT 'risk_scan' CHECK (review_type IN ('risk_scan','template_diff')),
  template_version_id BIGINT, model TEXT, risk_level TEXT CHECK (risk_level IN ('high','medium','low')),
  summary TEXT, findings JSONB, created_by BIGINT REFERENCES service_staff(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contract_alert_acks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, contract_id BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  level INT NOT NULL CHECK (level IN (90,60,30)), acked_by BIGINT REFERENCES service_staff(id), acked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT, UNIQUE (contract_id, level)
);
CREATE TABLE IF NOT EXISTS legal_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'other' CHECK (doc_type IN ('template','policy','regulation','litigation','authorization','other')),
  tags TEXT[] NOT NULL DEFAULT '{}', current_version_id BIGINT, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES service_staff(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_documents_title_trgm ON legal_documents USING gin (title gin_trgm_ops);
CREATE TABLE IF NOT EXISTS legal_document_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, document_id BIGINT NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
  version_no INT NOT NULL, storage_path TEXT NOT NULL, file_name TEXT NOT NULL, mime_type TEXT, file_size BIGINT, content_text TEXT,
  text_status TEXT NOT NULL DEFAULT 'done' CHECK (text_status IN ('done','pending','failed')), note TEXT,
  created_by BIGINT REFERENCES service_staff(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (document_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_ldv_content_trgm ON legal_document_versions USING gin (content_text gin_trgm_ops);
DO $$ BEGIN
  ALTER TABLE legal_documents ADD CONSTRAINT fk_ld_current_version FOREIGN KEY (current_version_id) REFERENCES legal_document_versions(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE contract_reviews ADD CONSTRAINT fk_cr_template_version FOREIGN KEY (template_version_id) REFERENCES legal_document_versions(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE VIEW contracts_expiring WITH (security_invoker = true) AS
WITH alertable AS (
  SELECT c.*, (c.end_date - CURRENT_DATE) AS days_left,
    CASE WHEN c.auto_renew AND c.renew_notice_days IS NOT NULL THEN c.end_date - c.renew_notice_days - CURRENT_DATE
         ELSE c.end_date - CURRENT_DATE END AS effective_days_left
  FROM contracts c WHERE c.status = 'active' AND c.end_date IS NOT NULL
)
SELECT a.*,
  CASE WHEN effective_days_left <= 30 THEN 30 WHEN effective_days_left <= 60 THEN 60 WHEN effective_days_left <= 90 THEN 90 END AS alert_level,
  EXISTS (SELECT 1 FROM contract_alert_acks ack WHERE ack.contract_id = a.id AND ack.level =
    CASE WHEN effective_days_left <= 30 THEN 30 WHEN effective_days_left <= 60 THEN 60 ELSE 90 END) AS acked
FROM alertable a WHERE effective_days_left <= 90;

INSERT INTO storage.buckets (id, name, public) VALUES ('contracts','contracts',false), ('legal-library','legal-library',false)
ON CONFLICT (id) DO NOTHING;

DO $$ DECLARE constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name FROM pg_constraint WHERE conrelid = 'operation_logs'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%target_type%';
  IF constraint_name IS NOT NULL THEN EXECUTE format('ALTER TABLE operation_logs DROP CONSTRAINT %I', constraint_name); END IF;
  ALTER TABLE operation_logs ADD CONSTRAINT operation_logs_target_type_check CHECK (target_type IN ('expense_record','driver','vehicle','advance_fund','fee_type','staff','contract','legal_document'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_alert_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_document_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON contracts, contract_files, contract_reviews, contract_alert_acks, legal_documents, legal_document_versions
  FROM anon, authenticated;
REVOKE ALL ON contracts_expiring FROM anon, authenticated;
