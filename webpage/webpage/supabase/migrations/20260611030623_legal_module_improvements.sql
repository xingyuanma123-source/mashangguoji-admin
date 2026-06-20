DO $$ DECLARE constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.operation_logs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%action%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.operation_logs DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE public.operation_logs
    ADD CONSTRAINT operation_logs_action_check
    CHECK (action IN ('confirm','edit','create','update','delete','renew','terminate'));
END $$;

CREATE OR REPLACE FUNCTION public.search_legal_documents(
  p_keyword TEXT DEFAULT '',
  p_doc_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  title TEXT,
  doc_type TEXT,
  tags TEXT[],
  current_version_id BIGINT,
  is_active BOOLEAN,
  created_by BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  current_version JSONB,
  excerpt TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  keyword TEXT := trim(coalesce(p_keyword, ''));
  pattern TEXT;
BEGIN
  pattern := '%' || replace(replace(replace(keyword, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  SELECT
    d.id, d.title, d.doc_type, d.tags, d.current_version_id, d.is_active,
    d.created_by, d.created_at, d.updated_at, to_jsonb(v.*),
    CASE
      WHEN keyword = '' THEN NULL
      WHEN position(lower(keyword) IN lower(coalesce(v.content_text, ''))) > 0 THEN
        substr(
          coalesce(v.content_text, ''),
          greatest(1, position(lower(keyword) IN lower(coalesce(v.content_text, ''))) - 80),
          length(keyword) + 160
        )
      WHEN d.title ILIKE pattern ESCAPE '\' THEN d.title
      ELSE NULL
    END
  FROM public.legal_documents d
  LEFT JOIN public.legal_document_versions v ON v.id = d.current_version_id
  WHERE d.is_active
    AND (p_doc_type IS NULL OR p_doc_type = '' OR d.doc_type = p_doc_type)
    AND (
      keyword = ''
      OR d.title ILIKE pattern ESCAPE '\'
      OR coalesce(v.content_text, '') ILIKE pattern ESCAPE '\'
    )
  ORDER BY d.updated_at DESC
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_contract(
  p_original_id BIGINT,
  p_contract JSONB,
  p_operator_id BIGINT,
  p_operator_name TEXT
)
RETURNS public.contracts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  original public.contracts;
  renewed public.contracts;
BEGIN
  SELECT * INTO original
  FROM public.contracts
  WHERE id = p_original_id
  FOR UPDATE;

  IF original.id IS NULL THEN
    RAISE EXCEPTION '原合同不存在';
  END IF;
  IF original.status <> 'active' THEN
    RAISE EXCEPTION '仅履行中的合同可以续约';
  END IF;
  IF nullif(trim(p_contract->>'title'), '') IS NULL OR nullif(trim(p_contract->>'counterparty'), '') IS NULL THEN
    RAISE EXCEPTION '合同标题和对方单位不能为空';
  END IF;

  INSERT INTO public.contracts (
    title, contract_no, counterparty, category, amount, currency,
    sign_date, start_date, end_date, auto_renew, renew_notice_days,
    owner_staff_id, status, renewed_from_id, remark, created_by
  ) VALUES (
    trim(p_contract->>'title'),
    nullif(trim(p_contract->>'contract_no'), ''),
    trim(p_contract->>'counterparty'),
    coalesce(nullif(p_contract->>'category', ''), 'other'),
    nullif(p_contract->>'amount', '')::numeric,
    coalesce(nullif(p_contract->>'currency', ''), 'CNY'),
    nullif(p_contract->>'sign_date', '')::date,
    nullif(p_contract->>'start_date', '')::date,
    nullif(p_contract->>'end_date', '')::date,
    coalesce((p_contract->>'auto_renew')::boolean, false),
    nullif(p_contract->>'renew_notice_days', '')::int,
    nullif(p_contract->>'owner_staff_id', '')::bigint,
    'active',
    original.id,
    nullif(trim(p_contract->>'remark'), ''),
    p_operator_id
  )
  RETURNING * INTO renewed;

  UPDATE public.contracts
  SET status = 'renewed', updated_at = now()
  WHERE id = original.id;

  INSERT INTO public.operation_logs (operator_id, operator_name, action, target_type, target_id, detail)
  VALUES
    (p_operator_id, p_operator_name, 'create', 'contract', renewed.id, '续约创建新合同：' || renewed.title),
    (p_operator_id, p_operator_name, 'renew', 'contract', original.id, '续约为合同 #' || renewed.id);

  RETURN renewed;
END;
$$;

REVOKE ALL ON FUNCTION public.search_legal_documents(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_contract(BIGINT, JSONB, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_legal_documents(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_contract(BIGINT, JSONB, BIGINT, TEXT) TO service_role;
