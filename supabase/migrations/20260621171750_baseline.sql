


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."contracts" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "contract_no" "text",
    "counterparty" "text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "amount" numeric(14,2),
    "currency" "text" DEFAULT 'CNY'::"text" NOT NULL,
    "sign_date" "date",
    "start_date" "date",
    "end_date" "date",
    "auto_renew" boolean DEFAULT false NOT NULL,
    "renew_notice_days" integer,
    "owner_staff_id" bigint,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "renewed_from_id" bigint,
    "remark" "text",
    "ocr_text" "text",
    "extracted" "jsonb",
    "created_by" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contracts_category_check" CHECK (("category" = ANY (ARRAY['transport'::"text", 'lease'::"text", 'labor'::"text", 'purchase'::"text", 'service'::"text", 'other'::"text"]))),
    CONSTRAINT "contracts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'renewed'::"text", 'terminated'::"text"])))
);


ALTER TABLE "public"."contracts" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."renew_contract"("p_original_id" bigint, "p_contract" "jsonb", "p_operator_id" bigint, "p_operator_name" "text") RETURNS "public"."contracts"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."renew_contract"("p_original_id" bigint, "p_contract" "jsonb", "p_operator_id" bigint, "p_operator_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_legal_documents"("p_keyword" "text" DEFAULT ''::"text", "p_doc_type" "text" DEFAULT NULL::"text") RETURNS TABLE("id" bigint, "title" "text", "doc_type" "text", "tags" "text"[], "current_version_id" bigint, "is_active" boolean, "created_by" bigint, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "current_version" "jsonb", "excerpt" "text")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."search_legal_documents"("p_keyword" "text", "p_doc_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."advance_fund_records" (
    "id" bigint NOT NULL,
    "driver_id" bigint NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "fund_date" "date" NOT NULL,
    "month" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."advance_fund_records" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."advance_fund_records_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."advance_fund_records_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."advance_fund_records_id_seq" OWNED BY "public"."advance_fund_records"."id";



CREATE TABLE IF NOT EXISTS "public"."agent_runs" (
    "id" bigint NOT NULL,
    "matter_id" bigint,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "user_message" "text" NOT NULL,
    "steps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "pending_approval" "jsonb",
    "final_text" "text",
    "model" "text",
    "token_usage" "jsonb",
    "created_by" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "agent_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'suspended'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."agent_runs" OWNER TO "postgres";


ALTER TABLE "public"."agent_runs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."agent_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contract_alert_acks" (
    "id" bigint NOT NULL,
    "contract_id" bigint NOT NULL,
    "level" integer NOT NULL,
    "acked_by" bigint,
    "acked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text",
    CONSTRAINT "contract_alert_acks_level_check" CHECK (("level" = ANY (ARRAY[90, 60, 30])))
);


ALTER TABLE "public"."contract_alert_acks" OWNER TO "postgres";


ALTER TABLE "public"."contract_alert_acks" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."contract_alert_acks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contract_files" (
    "id" bigint NOT NULL,
    "contract_id" bigint NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text",
    "file_size" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contract_files" OWNER TO "postgres";


ALTER TABLE "public"."contract_files" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."contract_files_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contract_reviews" (
    "id" bigint NOT NULL,
    "contract_id" bigint NOT NULL,
    "review_type" "text" DEFAULT 'risk_scan'::"text" NOT NULL,
    "template_version_id" bigint,
    "model" "text",
    "risk_level" "text",
    "summary" "text",
    "findings" "jsonb",
    "created_by" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contract_reviews_review_type_check" CHECK (("review_type" = ANY (ARRAY['risk_scan'::"text", 'template_diff'::"text"]))),
    CONSTRAINT "contract_reviews_risk_level_check" CHECK (("risk_level" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"])))
);


ALTER TABLE "public"."contract_reviews" OWNER TO "postgres";


ALTER TABLE "public"."contract_reviews" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."contract_reviews_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."contracts_expiring" WITH ("security_invoker"='true') AS
 WITH "alertable" AS (
         SELECT "c"."id",
            "c"."title",
            "c"."contract_no",
            "c"."counterparty",
            "c"."category",
            "c"."amount",
            "c"."currency",
            "c"."sign_date",
            "c"."start_date",
            "c"."end_date",
            "c"."auto_renew",
            "c"."renew_notice_days",
            "c"."owner_staff_id",
            "c"."status",
            "c"."renewed_from_id",
            "c"."remark",
            "c"."ocr_text",
            "c"."extracted",
            "c"."created_by",
            "c"."created_at",
            "c"."updated_at",
            ("c"."end_date" - CURRENT_DATE) AS "days_left",
                CASE
                    WHEN ("c"."auto_renew" AND ("c"."renew_notice_days" IS NOT NULL)) THEN (("c"."end_date" - "c"."renew_notice_days") - CURRENT_DATE)
                    ELSE ("c"."end_date" - CURRENT_DATE)
                END AS "effective_days_left"
           FROM "public"."contracts" "c"
          WHERE (("c"."status" = 'active'::"text") AND ("c"."end_date" IS NOT NULL))
        )
 SELECT "id",
    "title",
    "contract_no",
    "counterparty",
    "category",
    "amount",
    "currency",
    "sign_date",
    "start_date",
    "end_date",
    "auto_renew",
    "renew_notice_days",
    "owner_staff_id",
    "status",
    "renewed_from_id",
    "remark",
    "ocr_text",
    "extracted",
    "created_by",
    "created_at",
    "updated_at",
    "days_left",
    "effective_days_left",
        CASE
            WHEN ("effective_days_left" <= 30) THEN 30
            WHEN ("effective_days_left" <= 60) THEN 60
            WHEN ("effective_days_left" <= 90) THEN 90
            ELSE NULL::integer
        END AS "alert_level",
    (EXISTS ( SELECT 1
           FROM "public"."contract_alert_acks" "ack"
          WHERE (("ack"."contract_id" = "a"."id") AND ("ack"."level" =
                CASE
                    WHEN ("a"."effective_days_left" <= 30) THEN 30
                    WHEN ("a"."effective_days_left" <= 60) THEN 60
                    ELSE 90
                END)))) AS "acked"
   FROM "alertable" "a"
  WHERE ("effective_days_left" <= 90);


ALTER VIEW "public"."contracts_expiring" OWNER TO "postgres";


ALTER TABLE "public"."contracts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."contracts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."deadline_rules" (
    "id" bigint NOT NULL,
    "rule_key" "text" NOT NULL,
    "description" "text" NOT NULL,
    "base_event" "text" NOT NULL,
    "duration_days" integer NOT NULL,
    "legal_basis" "text" NOT NULL
);


ALTER TABLE "public"."deadline_rules" OWNER TO "postgres";


ALTER TABLE "public"."deadline_rules" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."deadline_rules_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."driver_documents" (
    "id" bigint NOT NULL,
    "driver_id" bigint NOT NULL,
    "document_type" "text" NOT NULL,
    "image_url" "text" NOT NULL,
    "document_number" "text",
    "issue_date" "date",
    "expiry_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "driver_documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['qualification'::"text", 'license_front'::"text", 'license_back'::"text", 'id_card'::"text", 'pass'::"text"])))
);


ALTER TABLE "public"."driver_documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."driver_documents" IS '司机证件表（每条记录1张证件，type区分类别）';



CREATE SEQUENCE IF NOT EXISTS "public"."driver_documents_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."driver_documents_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."driver_documents_id_seq" OWNED BY "public"."driver_documents"."id";



CREATE TABLE IF NOT EXISTS "public"."drivers" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "username" "text" NOT NULL,
    "password" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone" "text",
    "emergency_contact_name" "text",
    "emergency_contact_phone" "text"
);


ALTER TABLE "public"."drivers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."drivers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."drivers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."drivers_id_seq" OWNED BY "public"."drivers"."id";



CREATE TABLE IF NOT EXISTS "public"."expense_other_fees" (
    "id" bigint NOT NULL,
    "expense_record_id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."expense_other_fees" OWNER TO "postgres";


ALTER TABLE "public"."expense_other_fees" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."expense_other_fees_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."expense_records" (
    "id" bigint NOT NULL,
    "driver_id" bigint NOT NULL,
    "record_date" "date" NOT NULL,
    "plate_number" "text" NOT NULL,
    "route" "text",
    "fee_weighing" numeric(10,2) DEFAULT 0 NOT NULL,
    "fee_container" numeric(10,2) DEFAULT 0 NOT NULL,
    "fee_overnight" numeric(10,2) DEFAULT 0 NOT NULL,
    "fee_vn_overtime" numeric(10,2) DEFAULT 0 NOT NULL,
    "fee_vn_key" numeric(10,2) DEFAULT 0 NOT NULL,
    "fee_parking" numeric(10,2) DEFAULT 0 NOT NULL,
    "fee_newpost" numeric(10,2) DEFAULT 0 NOT NULL,
    "fee_taxi" numeric(10,2) DEFAULT 0 NOT NULL,
    "fee_water" numeric(10,2) DEFAULT 0 NOT NULL,
    "fee_tarpaulin" numeric(10,2) DEFAULT 0 NOT NULL,
    "fee_highway" numeric(10,2) DEFAULT 0 NOT NULL,
    "fee_stamp" numeric(10,2) DEFAULT 0 NOT NULL,
    "note_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "note_detail" "text",
    "total_expense" numeric(10,2) DEFAULT 0 NOT NULL,
    "commission" numeric(10,2) DEFAULT 0 NOT NULL,
    "receipt_images" "text"[],
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "confirmed_by" "text",
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_overtime" boolean DEFAULT false NOT NULL,
    "fee_location_detail" "text",
    "unconfirmed_at" timestamp with time zone,
    "unconfirmed_by" "text",
    "unconfirm_reason" "text",
    "idempotency_key" "uuid",
    CONSTRAINT "expense_records_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text"])))
);


ALTER TABLE "public"."expense_records" OWNER TO "postgres";


COMMENT ON COLUMN "public"."expense_records"."unconfirmed_at" IS '最近一次反审核时间';



COMMENT ON COLUMN "public"."expense_records"."unconfirmed_by" IS '最近一次反审核操作人 username';



COMMENT ON COLUMN "public"."expense_records"."unconfirm_reason" IS '反审核原因（管理员填写）';



CREATE SEQUENCE IF NOT EXISTS "public"."expense_records_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."expense_records_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."expense_records_id_seq" OWNED BY "public"."expense_records"."id";



CREATE TABLE IF NOT EXISTS "public"."fee_types" (
    "id" bigint NOT NULL,
    "field_name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "sort_order" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."fee_types" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."fee_types_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."fee_types_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."fee_types_id_seq" OWNED BY "public"."fee_types"."id";



CREATE TABLE IF NOT EXISTS "public"."legal_document_versions" (
    "id" bigint NOT NULL,
    "document_id" bigint NOT NULL,
    "version_no" integer NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text",
    "file_size" bigint,
    "content_text" "text",
    "text_status" "text" DEFAULT 'done'::"text" NOT NULL,
    "note" "text",
    "created_by" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "legal_document_versions_text_status_check" CHECK (("text_status" = ANY (ARRAY['done'::"text", 'pending'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."legal_document_versions" OWNER TO "postgres";


ALTER TABLE "public"."legal_document_versions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."legal_document_versions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."legal_documents" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "doc_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "current_version_id" bigint,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "legal_documents_doc_type_check" CHECK (("doc_type" = ANY (ARRAY['template'::"text", 'policy'::"text", 'regulation'::"text", 'litigation'::"text", 'authorization'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."legal_documents" OWNER TO "postgres";


ALTER TABLE "public"."legal_documents" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."legal_documents_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."legal_drafts" (
    "id" bigint NOT NULL,
    "matter_id" bigint NOT NULL,
    "doc_kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "approved_by" bigint,
    "sent_at" timestamp with time zone,
    "created_by" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "legal_drafts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'approved'::"text", 'sent'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."legal_drafts" OWNER TO "postgres";


ALTER TABLE "public"."legal_drafts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."legal_drafts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."legal_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "file_name" "text" NOT NULL,
    "review_result" "text" NOT NULL,
    "risk_level" "text",
    "contract_start_date" "date",
    "contract_end_date" "date",
    "reminder_days_before" integer,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."legal_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legal_tasks" (
    "id" bigint NOT NULL,
    "matter_id" bigint,
    "title" "text" NOT NULL,
    "detail" "text",
    "assignee_staff_id" bigint,
    "due_date" "date",
    "source" "text" DEFAULT 'agent'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "legal_tasks_source_check" CHECK (("source" = ANY (ARRAY['agent'::"text", 'radar'::"text", 'manual'::"text"]))),
    CONSTRAINT "legal_tasks_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'done'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."legal_tasks" OWNER TO "postgres";


ALTER TABLE "public"."legal_tasks" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."legal_tasks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."matter_links" (
    "id" bigint NOT NULL,
    "matter_id" bigint NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" bigint NOT NULL,
    "relation" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "matter_links_target_type_check" CHECK (("target_type" = ANY (ARRAY['contract'::"text", 'legal_document'::"text", 'file'::"text", 'draft'::"text"])))
);


ALTER TABLE "public"."matter_links" OWNER TO "postgres";


ALTER TABLE "public"."matter_links" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."matter_links_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."matters" (
    "id" bigint NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "counterparty" "text",
    "amount" numeric(14,2),
    "statute_deadline" "date",
    "owner_staff_id" bigint,
    "summary" "text",
    "created_by" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "matters_priority_check" CHECK (("priority" = ANY (ARRAY['urgent'::"text", 'high'::"text", 'normal'::"text", 'low'::"text"]))),
    CONSTRAINT "matters_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'awaiting'::"text", 'resolved'::"text", 'closed'::"text"]))),
    CONSTRAINT "matters_type_check" CHECK (("type" = ANY (ARRAY['claim'::"text", 'contract_review'::"text", 'collection'::"text", 'consult'::"text", 'dispute'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."matters" OWNER TO "postgres";


ALTER TABLE "public"."matters" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."matters_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."obligations" (
    "id" bigint NOT NULL,
    "contract_id" bigint,
    "matter_id" bigint,
    "description" "text" NOT NULL,
    "due_date" "date" NOT NULL,
    "recurrence" "text",
    "owner_staff_id" bigint,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "obligations_recurrence_check" CHECK (("recurrence" = ANY (ARRAY['monthly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "obligations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'done'::"text", 'overdue'::"text", 'waived'::"text"])))
);


ALTER TABLE "public"."obligations" OWNER TO "postgres";


ALTER TABLE "public"."obligations" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."obligations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."operating_companies" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "short_name" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."operating_companies" OWNER TO "postgres";


COMMENT ON TABLE "public"."operating_companies" IS '营运公司字典表';



CREATE SEQUENCE IF NOT EXISTS "public"."operating_companies_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."operating_companies_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."operating_companies_id_seq" OWNED BY "public"."operating_companies"."id";



CREATE TABLE IF NOT EXISTS "public"."operation_logs" (
    "id" bigint NOT NULL,
    "operator_id" bigint NOT NULL,
    "operator_name" "text" NOT NULL,
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" bigint NOT NULL,
    "detail" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operation_logs_action_check" CHECK (("action" = ANY (ARRAY['confirm'::"text", 'edit'::"text", 'create'::"text", 'update'::"text", 'delete'::"text", 'renew'::"text", 'terminate'::"text"]))),
    CONSTRAINT "operation_logs_target_type_check" CHECK (("target_type" = ANY (ARRAY['expense_record'::"text", 'driver'::"text", 'vehicle'::"text", 'advance_fund'::"text", 'fee_type'::"text", 'staff'::"text", 'contract'::"text", 'legal_document'::"text", 'matter'::"text", 'legal_draft'::"text"])))
);


ALTER TABLE "public"."operation_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."operation_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."operation_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."operation_logs_id_seq" OWNED BY "public"."operation_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."playbook_rules" (
    "id" bigint NOT NULL,
    "contract_category" "text" NOT NULL,
    "clause_topic" "text" NOT NULL,
    "ideal_position" "text" NOT NULL,
    "fallback_position" "text",
    "red_line" "text",
    "suggested_language" "text",
    "negotiation_tip" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "playbook_rules_contract_category_check" CHECK (("contract_category" = ANY (ARRAY['transport'::"text", 'lease'::"text", 'labor'::"text", 'purchase'::"text", 'service'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."playbook_rules" OWNER TO "postgres";


ALTER TABLE "public"."playbook_rules" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."playbook_rules_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."service_staff" (
    "id" bigint NOT NULL,
    "username" "text" NOT NULL,
    "password" "text" NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" DEFAULT 'staff'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_staff_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))
);


ALTER TABLE "public"."service_staff" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."service_staff_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."service_staff_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."service_staff_id_seq" OWNED BY "public"."service_staff"."id";



CREATE TABLE IF NOT EXISTS "public"."truck_trailer_assignments" (
    "id" bigint NOT NULL,
    "truck_id" bigint NOT NULL,
    "trailer_id" bigint NOT NULL,
    "assigned_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_until" timestamp with time zone,
    "is_current" boolean DEFAULT true NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."truck_trailer_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."truck_trailer_assignments" IS '车头/车挂动态分配关系（一个车头可拉不同车挂）';



CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" bigint NOT NULL,
    "plate_number" "text" NOT NULL,
    "vehicle_type" "text" NOT NULL,
    "source" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "terminal_phone" "text",
    "fleet_name" "text",
    "group_number" integer,
    "group_leader" "text",
    "asset_owner" "text",
    "vehicle_model_short" "text",
    "vehicle_category" "text",
    "operating_company_id" bigint,
    "brand" "text",
    "model" "text",
    "vin" "text",
    "engine_number" "text",
    "registration_date" "date",
    "license_issue_date" "date",
    "archive_number" "text",
    "approved_passengers" integer,
    "total_mass_kg" integer,
    "curb_mass_kg" integer,
    "load_mass_kg" integer,
    "traction_mass_kg" integer,
    "dimensions" "text",
    "scrap_date" "date",
    "inspection_expiry" "date",
    "barcode" "text",
    "insurance_expiry" "date",
    "filing_expiry" "date",
    "data_source" "text" DEFAULT 'legacy'::"text",
    CONSTRAINT "vehicles_data_source_check" CHECK (("data_source" = ANY (ARRAY['verified'::"text", 'legacy'::"text", 'manual'::"text"]))),
    CONSTRAINT "vehicles_vehicle_type_check" CHECK (("vehicle_type" = ANY (ARRAY['own'::"text", 'affiliated'::"text", 'rented'::"text"])))
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."vehicles"."data_source" IS 'verified=已核对（来自权威车辆明细），legacy=遗留数据未核对，manual=手动新增';



CREATE TABLE IF NOT EXISTS "public"."vehicles_trailer" (
    "id" bigint NOT NULL,
    "plate_number" "text" NOT NULL,
    "asset_owner" "text",
    "vehicle_category" "text",
    "operating_company_id" bigint,
    "brand" "text",
    "model" "text",
    "vin" "text",
    "registration_date" "date",
    "license_issue_date" "date",
    "archive_number" "text",
    "total_mass_kg" integer,
    "curb_mass_kg" integer,
    "load_mass_kg" integer,
    "dimensions" "text",
    "scrap_date" "date",
    "inspection_expiry" "date",
    "barcode" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vehicles_trailer" OWNER TO "postgres";


COMMENT ON TABLE "public"."vehicles_trailer" IS '车挂（挂车）表';



CREATE OR REPLACE VIEW "public"."trailers_sorted" AS
 SELECT "t"."id",
    "t"."plate_number",
    "t"."asset_owner",
    "t"."vehicle_category",
    "t"."operating_company_id",
    "t"."brand",
    "t"."model",
    "t"."vin",
    "t"."registration_date",
    "t"."license_issue_date",
    "t"."archive_number",
    "t"."total_mass_kg",
    "t"."curb_mass_kg",
    "t"."load_mass_kg",
    "t"."dimensions",
    "t"."scrap_date",
    "t"."inspection_expiry",
    "t"."barcode",
    "t"."is_active",
    "t"."created_at",
    "oc"."name" AS "operating_company_name",
    "oc"."short_name" AS "operating_company_short_name",
    ( SELECT "v"."plate_number"
           FROM ("public"."truck_trailer_assignments" "a"
             JOIN "public"."vehicles" "v" ON (("v"."id" = "a"."truck_id")))
          WHERE (("a"."trailer_id" = "t"."id") AND ("a"."is_current" = true))
         LIMIT 1) AS "current_truck_plate"
   FROM ("public"."vehicles_trailer" "t"
     LEFT JOIN "public"."operating_companies" "oc" ON (("oc"."id" = "t"."operating_company_id")));


ALTER VIEW "public"."trailers_sorted" OWNER TO "postgres";


COMMENT ON VIEW "public"."trailers_sorted" IS '车挂列表视图：联表带出营运公司名和当前在拉的车头';



CREATE SEQUENCE IF NOT EXISTS "public"."truck_trailer_assignments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."truck_trailer_assignments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."truck_trailer_assignments_id_seq" OWNED BY "public"."truck_trailer_assignments"."id";



CREATE TABLE IF NOT EXISTS "public"."vehicle_documents" (
    "id" bigint NOT NULL,
    "vehicle_kind" "text" NOT NULL,
    "vehicle_id" bigint NOT NULL,
    "document_type" "text" NOT NULL,
    "image_url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vehicle_documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['license_front'::"text", 'license_back'::"text", 'green_book_1'::"text", 'green_book_2'::"text", 'green_book_3'::"text"]))),
    CONSTRAINT "vehicle_documents_vehicle_kind_check" CHECK (("vehicle_kind" = ANY (ARRAY['truck'::"text", 'trailer'::"text"])))
);


ALTER TABLE "public"."vehicle_documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."vehicle_documents" IS '车辆证件表（行驶证、绿本等图片）';



CREATE SEQUENCE IF NOT EXISTS "public"."vehicle_documents_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."vehicle_documents_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."vehicle_documents_id_seq" OWNED BY "public"."vehicle_documents"."id";



CREATE TABLE IF NOT EXISTS "public"."vehicle_locations" (
    "id" bigint NOT NULL,
    "vehicle_id" bigint,
    "terminal_phone" "text" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "speed" double precision,
    "direction" integer,
    "altitude" integer,
    "gps_time" timestamp with time zone NOT NULL,
    "alarm_flag" integer DEFAULT 0,
    "status_flag" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vehicle_locations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."vehicle_locations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."vehicle_locations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."vehicle_locations_id_seq" OWNED BY "public"."vehicle_locations"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."vehicles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."vehicles_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."vehicles_id_seq" OWNED BY "public"."vehicles"."id";



CREATE OR REPLACE VIEW "public"."vehicles_sorted" AS
 SELECT "v"."id",
    "v"."plate_number",
    "v"."vehicle_type",
    "v"."source",
    "v"."is_active",
    "v"."created_at",
    "v"."terminal_phone",
    "v"."fleet_name",
    "v"."group_number",
    "v"."group_leader",
    "v"."asset_owner",
    "v"."vehicle_model_short",
    "v"."vehicle_category",
    "v"."operating_company_id",
    "v"."brand",
    "v"."model",
    "v"."vin",
    "v"."engine_number",
    "v"."registration_date",
    "v"."license_issue_date",
    "v"."archive_number",
    "v"."approved_passengers",
    "v"."total_mass_kg",
    "v"."curb_mass_kg",
    "v"."load_mass_kg",
    "v"."traction_mass_kg",
    "v"."dimensions",
    "v"."scrap_date",
    "v"."inspection_expiry",
    "v"."barcode",
    "v"."insurance_expiry",
    "v"."filing_expiry",
    "v"."data_source",
        CASE "v"."data_source"
            WHEN 'verified'::"text" THEN 1
            WHEN 'manual'::"text" THEN 2
            WHEN 'legacy'::"text" THEN 3
            ELSE 9
        END AS "data_source_rank",
    "oc"."name" AS "operating_company_name",
    "oc"."short_name" AS "operating_company_short_name"
   FROM ("public"."vehicles" "v"
     LEFT JOIN "public"."operating_companies" "oc" ON (("oc"."id" = "v"."operating_company_id")));


ALTER VIEW "public"."vehicles_sorted" OWNER TO "postgres";


COMMENT ON VIEW "public"."vehicles_sorted" IS '车头列表视图：按 verified→manual→legacy 排序，并联表带出营运公司名';



CREATE SEQUENCE IF NOT EXISTS "public"."vehicles_trailer_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."vehicles_trailer_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."vehicles_trailer_id_seq" OWNED BY "public"."vehicles_trailer"."id";



ALTER TABLE ONLY "public"."advance_fund_records" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."advance_fund_records_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."driver_documents" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."driver_documents_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."drivers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."drivers_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."expense_records" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."expense_records_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."fee_types" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fee_types_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."operating_companies" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."operating_companies_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."operation_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."operation_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."service_staff" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."service_staff_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."truck_trailer_assignments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."truck_trailer_assignments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."vehicle_documents" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vehicle_documents_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."vehicle_locations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vehicle_locations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."vehicles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vehicles_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."vehicles_trailer" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vehicles_trailer_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."advance_fund_records"
    ADD CONSTRAINT "advance_fund_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_alert_acks"
    ADD CONSTRAINT "contract_alert_acks_contract_id_level_key" UNIQUE ("contract_id", "level");



ALTER TABLE ONLY "public"."contract_alert_acks"
    ADD CONSTRAINT "contract_alert_acks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_files"
    ADD CONSTRAINT "contract_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_reviews"
    ADD CONSTRAINT "contract_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deadline_rules"
    ADD CONSTRAINT "deadline_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deadline_rules"
    ADD CONSTRAINT "deadline_rules_rule_key_key" UNIQUE ("rule_key");



ALTER TABLE ONLY "public"."driver_documents"
    ADD CONSTRAINT "driver_documents_driver_id_document_type_key" UNIQUE ("driver_id", "document_type");



ALTER TABLE ONLY "public"."driver_documents"
    ADD CONSTRAINT "driver_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."expense_other_fees"
    ADD CONSTRAINT "expense_other_fees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_records"
    ADD CONSTRAINT "expense_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fee_types"
    ADD CONSTRAINT "fee_types_field_name_key" UNIQUE ("field_name");



ALTER TABLE ONLY "public"."fee_types"
    ADD CONSTRAINT "fee_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_document_versions"
    ADD CONSTRAINT "legal_document_versions_document_id_version_no_key" UNIQUE ("document_id", "version_no");



ALTER TABLE ONLY "public"."legal_document_versions"
    ADD CONSTRAINT "legal_document_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_documents"
    ADD CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_drafts"
    ADD CONSTRAINT "legal_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_reviews"
    ADD CONSTRAINT "legal_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_tasks"
    ADD CONSTRAINT "legal_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matter_links"
    ADD CONSTRAINT "matter_links_matter_id_target_type_target_id_key" UNIQUE ("matter_id", "target_type", "target_id");



ALTER TABLE ONLY "public"."matter_links"
    ADD CONSTRAINT "matter_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matters"
    ADD CONSTRAINT "matters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."obligations"
    ADD CONSTRAINT "obligations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operating_companies"
    ADD CONSTRAINT "operating_companies_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."operating_companies"
    ADD CONSTRAINT "operating_companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operation_logs"
    ADD CONSTRAINT "operation_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."playbook_rules"
    ADD CONSTRAINT "playbook_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_staff"
    ADD CONSTRAINT "service_staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_staff"
    ADD CONSTRAINT "service_staff_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."truck_trailer_assignments"
    ADD CONSTRAINT "truck_trailer_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_vehicle_kind_vehicle_id_document_type_key" UNIQUE ("vehicle_kind", "vehicle_id", "document_type");



ALTER TABLE ONLY "public"."vehicle_locations"
    ADD CONSTRAINT "vehicle_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_plate_number_key" UNIQUE ("plate_number");



ALTER TABLE ONLY "public"."vehicles_trailer"
    ADD CONSTRAINT "vehicles_trailer_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles_trailer"
    ADD CONSTRAINT "vehicles_trailer_plate_number_key" UNIQUE ("plate_number");



ALTER TABLE ONLY "public"."vehicles_trailer"
    ADD CONSTRAINT "vehicles_trailer_vin_key" UNIQUE ("vin");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_vin_key" UNIQUE ("vin");



CREATE INDEX "idx_agent_runs_matter" ON "public"."agent_runs" USING "btree" ("matter_id", "created_at" DESC);



CREATE INDEX "idx_assign_current" ON "public"."truck_trailer_assignments" USING "btree" ("is_current") WHERE ("is_current" = true);



CREATE INDEX "idx_assign_trailer" ON "public"."truck_trailer_assignments" USING "btree" ("trailer_id");



CREATE INDEX "idx_assign_truck" ON "public"."truck_trailer_assignments" USING "btree" ("truck_id");



CREATE INDEX "idx_contracts_end_date" ON "public"."contracts" USING "btree" ("end_date") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_contracts_trgm" ON "public"."contracts" USING "gin" ((((((COALESCE("title", ''::"text") || ' '::"text") || COALESCE("counterparty", ''::"text")) || ' '::"text") || COALESCE("contract_no", ''::"text"))) "public"."gin_trgm_ops");



CREATE INDEX "idx_driver_documents_driver" ON "public"."driver_documents" USING "btree" ("driver_id");



CREATE INDEX "idx_driver_documents_expiry" ON "public"."driver_documents" USING "btree" ("expiry_date");



CREATE INDEX "idx_expense_other_fees_record_id" ON "public"."expense_other_fees" USING "btree" ("expense_record_id");



CREATE INDEX "idx_expense_records_idempotency" ON "public"."expense_records" USING "btree" ("driver_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_ldv_content_trgm" ON "public"."legal_document_versions" USING "gin" ("content_text" "public"."gin_trgm_ops");



CREATE INDEX "idx_legal_documents_title_trgm" ON "public"."legal_documents" USING "gin" ("title" "public"."gin_trgm_ops");



CREATE INDEX "idx_legal_tasks_open" ON "public"."legal_tasks" USING "btree" ("status", "due_date");



CREATE INDEX "idx_matters_status" ON "public"."matters" USING "btree" ("status", "statute_deadline");



CREATE INDEX "idx_obligations_due" ON "public"."obligations" USING "btree" ("status", "due_date");



CREATE INDEX "idx_trailer_inspection_expiry" ON "public"."vehicles_trailer" USING "btree" ("inspection_expiry");



CREATE INDEX "idx_trailer_operating_company" ON "public"."vehicles_trailer" USING "btree" ("operating_company_id");



CREATE INDEX "idx_vehicle_documents_vehicle" ON "public"."vehicle_documents" USING "btree" ("vehicle_kind", "vehicle_id");



CREATE INDEX "idx_vehicle_locations_gps_time" ON "public"."vehicle_locations" USING "btree" ("gps_time" DESC);



CREATE INDEX "idx_vehicle_locations_terminal_phone" ON "public"."vehicle_locations" USING "btree" ("terminal_phone");



CREATE INDEX "idx_vehicle_locations_vehicle_id" ON "public"."vehicle_locations" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicles_data_source" ON "public"."vehicles" USING "btree" ("data_source");



CREATE INDEX "idx_vehicles_inspection_expiry" ON "public"."vehicles" USING "btree" ("inspection_expiry");



CREATE INDEX "idx_vehicles_operating_company" ON "public"."vehicles" USING "btree" ("operating_company_id");



CREATE UNIQUE INDEX "uniq_trailer_current" ON "public"."truck_trailer_assignments" USING "btree" ("trailer_id") WHERE ("is_current" = true);



CREATE OR REPLACE TRIGGER "update_expense_records_updated_at" BEFORE UPDATE ON "public"."expense_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."advance_fund_records"
    ADD CONSTRAINT "advance_fund_records_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."service_staff"("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contract_alert_acks"
    ADD CONSTRAINT "contract_alert_acks_acked_by_fkey" FOREIGN KEY ("acked_by") REFERENCES "public"."service_staff"("id");



ALTER TABLE ONLY "public"."contract_alert_acks"
    ADD CONSTRAINT "contract_alert_acks_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_files"
    ADD CONSTRAINT "contract_files_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_reviews"
    ADD CONSTRAINT "contract_reviews_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_reviews"
    ADD CONSTRAINT "contract_reviews_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."service_staff"("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."service_staff"("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_owner_staff_id_fkey" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."service_staff"("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_renewed_from_id_fkey" FOREIGN KEY ("renewed_from_id") REFERENCES "public"."contracts"("id");



ALTER TABLE ONLY "public"."driver_documents"
    ADD CONSTRAINT "driver_documents_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_other_fees"
    ADD CONSTRAINT "expense_other_fees_expense_record_id_fkey" FOREIGN KEY ("expense_record_id") REFERENCES "public"."expense_records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_records"
    ADD CONSTRAINT "expense_records_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id");



ALTER TABLE ONLY "public"."contract_reviews"
    ADD CONSTRAINT "fk_cr_template_version" FOREIGN KEY ("template_version_id") REFERENCES "public"."legal_document_versions"("id");



ALTER TABLE ONLY "public"."legal_documents"
    ADD CONSTRAINT "fk_ld_current_version" FOREIGN KEY ("current_version_id") REFERENCES "public"."legal_document_versions"("id");



ALTER TABLE ONLY "public"."legal_document_versions"
    ADD CONSTRAINT "legal_document_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."service_staff"("id");



ALTER TABLE ONLY "public"."legal_document_versions"
    ADD CONSTRAINT "legal_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."legal_documents"
    ADD CONSTRAINT "legal_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."service_staff"("id");



ALTER TABLE ONLY "public"."legal_drafts"
    ADD CONSTRAINT "legal_drafts_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."service_staff"("id");



ALTER TABLE ONLY "public"."legal_drafts"
    ADD CONSTRAINT "legal_drafts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."service_staff"("id");



ALTER TABLE ONLY "public"."legal_drafts"
    ADD CONSTRAINT "legal_drafts_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."legal_tasks"
    ADD CONSTRAINT "legal_tasks_assignee_staff_id_fkey" FOREIGN KEY ("assignee_staff_id") REFERENCES "public"."service_staff"("id");



ALTER TABLE ONLY "public"."legal_tasks"
    ADD CONSTRAINT "legal_tasks_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matter_links"
    ADD CONSTRAINT "matter_links_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matters"
    ADD CONSTRAINT "matters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."service_staff"("id");



ALTER TABLE ONLY "public"."matters"
    ADD CONSTRAINT "matters_owner_staff_id_fkey" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."service_staff"("id");



ALTER TABLE ONLY "public"."obligations"
    ADD CONSTRAINT "obligations_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."obligations"
    ADD CONSTRAINT "obligations_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."obligations"
    ADD CONSTRAINT "obligations_owner_staff_id_fkey" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."service_staff"("id");



ALTER TABLE ONLY "public"."operation_logs"
    ADD CONSTRAINT "operation_logs_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."service_staff"("id");



ALTER TABLE ONLY "public"."truck_trailer_assignments"
    ADD CONSTRAINT "truck_trailer_assignments_trailer_id_fkey" FOREIGN KEY ("trailer_id") REFERENCES "public"."vehicles_trailer"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."truck_trailer_assignments"
    ADD CONSTRAINT "truck_trailer_assignments_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_locations"
    ADD CONSTRAINT "vehicle_locations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_operating_company_id_fkey" FOREIGN KEY ("operating_company_id") REFERENCES "public"."operating_companies"("id");



ALTER TABLE ONLY "public"."vehicles_trailer"
    ADD CONSTRAINT "vehicles_trailer_operating_company_id_fkey" FOREIGN KEY ("operating_company_id") REFERENCES "public"."operating_companies"("id");



ALTER TABLE "public"."advance_fund_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anon can insert vehicle_locations" ON "public"."vehicle_locations" FOR INSERT TO "anon" WITH CHECK (true);



ALTER TABLE "public"."contract_alert_acks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contracts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deadline_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."driver_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drivers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expense_other_fees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expense_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fee_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legal_document_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legal_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legal_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legal_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legal_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matter_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."obligations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operating_companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operation_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."playbook_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_staff" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."truck_trailer_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles_trailer" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON TABLE "public"."contracts" TO "service_role";



REVOKE ALL ON FUNCTION "public"."renew_contract"("p_original_id" bigint, "p_contract" "jsonb", "p_operator_id" bigint, "p_operator_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."renew_contract"("p_original_id" bigint, "p_contract" "jsonb", "p_operator_id" bigint, "p_operator_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_legal_documents"("p_keyword" "text", "p_doc_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_legal_documents"("p_keyword" "text", "p_doc_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";
























GRANT ALL ON TABLE "public"."advance_fund_records" TO "service_role";



GRANT ALL ON SEQUENCE "public"."advance_fund_records_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."agent_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."agent_runs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contract_alert_acks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contract_alert_acks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contract_files" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contract_files_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contract_reviews" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contract_reviews_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contracts_expiring" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contracts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."deadline_rules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."deadline_rules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."driver_documents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."driver_documents_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."drivers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."drivers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."expense_other_fees" TO "service_role";



GRANT ALL ON SEQUENCE "public"."expense_other_fees_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."expense_records" TO "service_role";



GRANT ALL ON SEQUENCE "public"."expense_records_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fee_types" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fee_types_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."legal_document_versions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."legal_document_versions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."legal_documents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."legal_documents_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."legal_drafts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."legal_drafts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."legal_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."legal_tasks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."legal_tasks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."matter_links" TO "service_role";



GRANT ALL ON SEQUENCE "public"."matter_links_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."matters" TO "service_role";



GRANT ALL ON SEQUENCE "public"."matters_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."obligations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."obligations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."operating_companies" TO "service_role";



GRANT ALL ON SEQUENCE "public"."operating_companies_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."operation_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."operation_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."playbook_rules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."playbook_rules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."service_staff" TO "service_role";



GRANT ALL ON SEQUENCE "public"."service_staff_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."truck_trailer_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles_trailer" TO "service_role";



GRANT ALL ON TABLE "public"."trailers_sorted" TO "service_role";



GRANT ALL ON SEQUENCE "public"."truck_trailer_assignments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_documents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vehicle_documents_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_locations" TO "service_role";
GRANT INSERT ON TABLE "public"."vehicle_locations" TO "anon";



GRANT ALL ON SEQUENCE "public"."vehicle_locations_id_seq" TO "service_role";
GRANT SELECT,USAGE ON SEQUENCE "public"."vehicle_locations_id_seq" TO "anon";



GRANT ALL ON SEQUENCE "public"."vehicles_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles_sorted" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vehicles_trailer_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

































--
-- storage.objects RLS 策略（司机端 anon 限定上传/读取，从 prod storage schema 摘出）
--
CREATE POLICY "allow public upload 13hfyy5_0" ON "storage"."objects" FOR INSERT TO "anon" WITH CHECK (("bucket_id" = 'receipt-images'::"text"));
CREATE POLICY "driver_documents_anon_delete" ON "storage"."objects" FOR DELETE TO "anon" USING ((("bucket_id" = 'driver-documents'::"text") AND ("name" ~~ 'drivers/%'::"text")));
CREATE POLICY "driver_documents_anon_read" ON "storage"."objects" FOR SELECT TO "anon" USING ((("bucket_id" = 'driver-documents'::"text") AND ("name" ~~ 'drivers/%'::"text")));
CREATE POLICY "driver_documents_anon_update" ON "storage"."objects" FOR UPDATE TO "anon" USING ((("bucket_id" = 'driver-documents'::"text") AND ("name" ~~ 'drivers/%'::"text")));
CREATE POLICY "driver_documents_anon_write" ON "storage"."objects" FOR INSERT TO "anon" WITH CHECK ((("bucket_id" = 'driver-documents'::"text") AND ("name" ~~ 'drivers/%'::"text")));
CREATE POLICY "vehicle_documents_anon_delete" ON "storage"."objects" FOR DELETE TO "anon" USING ((("bucket_id" = 'vehicle-documents'::"text") AND (("name" ~~ 'trucks/%'::"text") OR ("name" ~~ 'trailers/%'::"text"))));
CREATE POLICY "vehicle_documents_anon_read" ON "storage"."objects" FOR SELECT TO "anon" USING ((("bucket_id" = 'vehicle-documents'::"text") AND (("name" ~~ 'trucks/%'::"text") OR ("name" ~~ 'trailers/%'::"text"))));
CREATE POLICY "vehicle_documents_anon_update" ON "storage"."objects" FOR UPDATE TO "anon" USING ((("bucket_id" = 'vehicle-documents'::"text") AND (("name" ~~ 'trucks/%'::"text") OR ("name" ~~ 'trailers/%'::"text"))));
CREATE POLICY "vehicle_documents_anon_write" ON "storage"."objects" FOR INSERT TO "anon" WITH CHECK ((("bucket_id" = 'vehicle-documents'::"text") AND (("name" ~~ 'trucks/%'::"text") OR ("name" ~~ 'trailers/%'::"text"))));

--
-- 复刻 prod lockdown（pg_dump 不导出 REVOKE，全新库默认放权，故显式收回以与 prod 一致）
-- 先收回 anon/authenticated 在 public 的全部权限，再只重授 prod 实际保留的精确授权
--
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES  IN SCHEMA public FROM anon, authenticated;

-- prod 实际保留的精确授权：
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT INSERT ON TABLE "public"."vehicle_locations" TO "anon";
GRANT SELECT,USAGE ON SEQUENCE "public"."vehicle_locations_id_seq" TO "anon";

-- 撤销 postgres 角色在 public 的默认授权，使未来新建对象不自动放权给 anon/authenticated（与 prod 一致）
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
