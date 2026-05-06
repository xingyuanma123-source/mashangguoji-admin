ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS unconfirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unconfirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS unconfirm_reason TEXT;

COMMENT ON COLUMN expense_records.unconfirmed_at IS '最近一次反审核时间';
COMMENT ON COLUMN expense_records.unconfirmed_by IS '最近一次反审核操作人 username';
COMMENT ON COLUMN expense_records.unconfirm_reason IS '反审核原因（管理员填写）';
