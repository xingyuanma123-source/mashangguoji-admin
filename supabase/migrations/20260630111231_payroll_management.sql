-- Payroll, advance balance, and commission settlement module.
-- This migration intentionally appends to the single baseline sequence and does
-- not modify the baseline or dispatch migrations.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS monthly_advance_default numeric(10,2) NOT NULL DEFAULT 1000;

UPDATE public.drivers
SET monthly_advance_default = 2000
WHERE name = '陆贻祥';

CREATE TABLE public.salary_records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period text NOT NULL,
  person_type text NOT NULL,
  person_id bigint NOT NULL,
  person_name text NOT NULL,
  payee_name text,
  job_title text,
  is_fixed_salary boolean NOT NULL DEFAULT false,

  base_salary numeric(10,2) NOT NULL DEFAULT 0,
  personal_commission numeric(10,2) NOT NULL DEFAULT 0,
  attendance_bonus numeric(10,2) NOT NULL DEFAULT 0,
  overtime numeric(10,2) NOT NULL DEFAULT 0,

  post_allowance numeric(10,2) NOT NULL DEFAULT 0,
  phone_allowance numeric(10,2) NOT NULL DEFAULT 0,
  transport_allowance numeric(10,2) NOT NULL DEFAULT 0,

  month_days integer NOT NULL,
  leave_days numeric(4,1) NOT NULL DEFAULT 0,
  rest_days numeric(4,1) NOT NULL DEFAULT 0,
  has_statutory_holiday boolean NOT NULL DEFAULT false,
  used_substitute boolean NOT NULL DEFAULT false,

  advance_issued numeric(10,2) NOT NULL DEFAULT 0,
  advance_spent numeric(10,2) NOT NULL DEFAULT 0,
  advance_balance numeric(10,2) GENERATED ALWAYS AS (
    advance_issued - advance_spent
  ) STORED,

  base_salary_deduction numeric(10,2) NOT NULL DEFAULT 0,
  manual_deduction numeric(10,2) NOT NULL DEFAULT 0,
  adjustment numeric(10,2) NOT NULL DEFAULT 0,

  gross_salary numeric(10,2) GENERATED ALWAYS AS (
      base_salary + personal_commission + attendance_bonus + overtime
    + post_allowance + phone_allowance + transport_allowance
    - (advance_issued - advance_spent)
    - base_salary_deduction - manual_deduction + adjustment
  ) STORED,

  tax numeric(10,2) NOT NULL DEFAULT 0,
  social_insurance numeric(10,2) NOT NULL DEFAULT 0,

  net_salary numeric(10,2) GENERATED ALWAYS AS (
      base_salary + personal_commission + attendance_bonus + overtime
    + post_allowance + phone_allowance + transport_allowance
    - (advance_issued - advance_spent)
    - base_salary_deduction - manual_deduction + adjustment
    - tax - social_insurance
  ) STORED,

  note text,
  status text NOT NULL DEFAULT 'draft',
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (period, person_type, person_id),
  CONSTRAINT salary_person_type_chk CHECK (person_type IN ('driver', 'office', 'parttime')),
  CONSTRAINT salary_fixed_salary_chk CHECK (is_fixed_salary = false OR person_type = 'office'),
  CONSTRAINT salary_status_chk CHECK (status IN ('draft', 'finalized')),
  CONSTRAINT salary_period_chk CHECK (period ~ '^\d{4}-\d{2}$'),
  CONSTRAINT salary_month_days_chk CHECK (month_days BETWEEN 28 AND 31),
  CONSTRAINT salary_attend_chk CHECK (leave_days >= 0 AND rest_days >= 0)
);

CREATE TABLE public.driver_commission_inputs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period text NOT NULL,
  driver_id bigint NOT NULL REFERENCES public.drivers(id),
  raw_commission numeric(10,2) NOT NULL DEFAULT 0,
  transport_fee numeric(10,2) NOT NULL DEFAULT 0,
  attendance_days numeric(5,1) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (period, driver_id),
  CONSTRAINT driver_commission_period_chk CHECK (period ~ '^\d{4}-\d{2}$'),
  CONSTRAINT driver_commission_nonnegative_chk CHECK (
    raw_commission >= 0
    AND transport_fee >= 0
    AND attendance_days >= 0
  )
);

CREATE TABLE public.commission_pool_settlements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period text NOT NULL UNIQUE,
  trip_count integer NOT NULL,
  pool_total numeric(10,2) NOT NULL,
  divisor integer NOT NULL,
  per_share numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pool_period_chk CHECK (period ~ '^\d{4}-\d{2}$'),
  CONSTRAINT pool_trip_count_chk CHECK (trip_count >= 0),
  CONSTRAINT pool_divisor_chk CHECK (divisor > 0),
  CONSTRAINT pool_amounts_nonnegative_chk CHECK (pool_total >= 0 AND per_share >= 0)
);

CREATE TABLE public.commission_pool_participants (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  settlement_id bigint NOT NULL REFERENCES public.commission_pool_settlements(id) ON DELETE CASCADE,
  staff_id bigint NOT NULL REFERENCES public.service_staff(id),
  staff_name text NOT NULL,
  is_divisor boolean NOT NULL,
  share_amount numeric(10,2) NOT NULL,

  UNIQUE (settlement_id, staff_id),
  CONSTRAINT pool_participant_share_nonnegative_chk CHECK (share_amount >= 0)
);

CREATE TABLE public.salary_adjustments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  apply_period text NOT NULL,
  target_period text NOT NULL,
  person_type text NOT NULL,
  person_id bigint NOT NULL,
  amount numeric(10,2) NOT NULL,
  reason text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT salary_adjustments_apply_period_chk CHECK (apply_period ~ '^\d{4}-\d{2}$'),
  CONSTRAINT salary_adjustments_target_period_chk CHECK (target_period ~ '^\d{4}-\d{2}$'),
  CONSTRAINT salary_adjustments_person_type_chk CHECK (person_type IN ('driver', 'office', 'parttime')),
  CONSTRAINT salary_adjustments_reason_not_blank_chk CHECK (btrim(reason) <> '')
);

CREATE OR REPLACE VIEW public.driver_advance_balance
WITH (security_invoker = true) AS
WITH months AS (
  SELECT DISTINCT month AS period
  FROM public.advance_fund_records
  WHERE month ~ '^\d{4}-\d{2}$'
  UNION
  SELECT DISTINCT to_char(record_date, 'YYYY-MM') AS period
  FROM public.expense_records
),
funds AS (
  SELECT driver_id, month AS period, sum(amount)::numeric(10,2) AS issued
  FROM public.advance_fund_records
  GROUP BY driver_id, month
),
expenses AS (
  SELECT driver_id, to_char(record_date, 'YYYY-MM') AS period,
         sum(total_expense)::numeric(10,2) AS spent
  FROM public.expense_records
  WHERE status = 'confirmed'
  GROUP BY driver_id, to_char(record_date, 'YYYY-MM')
)
SELECT d.id AS driver_id, d.name AS driver_name, m.period,
       COALESCE(f.issued, 0)::numeric(10,2) AS advance_issued,
       COALESCE(e.spent, 0)::numeric(10,2) AS advance_spent,
       (COALESCE(f.issued, 0) - COALESCE(e.spent, 0))::numeric(10,2) AS balance
FROM public.drivers d
CROSS JOIN months m
LEFT JOIN funds f ON f.driver_id = d.id AND f.period = m.period
LEFT JOIN expenses e ON e.driver_id = d.id AND e.period = m.period;

CREATE UNIQUE INDEX advance_monthly_topup_uniq
  ON public.advance_fund_records (driver_id, month)
  WHERE note = '月初充值';

ALTER TABLE public.salary_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_commission_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_pool_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_pool_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_adjustments ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.salary_records TO service_role;
GRANT ALL ON TABLE public.driver_commission_inputs TO service_role;
GRANT ALL ON TABLE public.commission_pool_settlements TO service_role;
GRANT ALL ON TABLE public.commission_pool_participants TO service_role;
GRANT ALL ON TABLE public.salary_adjustments TO service_role;
GRANT SELECT ON TABLE public.driver_advance_balance TO service_role;

GRANT ALL ON SEQUENCE public.salary_records_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.driver_commission_inputs_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.commission_pool_settlements_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.commission_pool_participants_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.salary_adjustments_id_seq TO service_role;
