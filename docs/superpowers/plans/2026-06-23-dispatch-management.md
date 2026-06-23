# Vehicle Dispatch Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first-version PC web dispatch board from `车辆派遣管理模块_spec.md`, including monthly vehicle/day visualization, customer entry, soft delete, idle surfacing, summary stats, and an Excel import dry-run script.

**Architecture:** Use the existing React/Vite admin app and the existing service-staff session proxy. Persist dispatch data in new Supabase tables while adapting spec UUID/auth terms to the current bigint `service_staff` and `vehicles` tables. Enforce practical write ownership in `db-proxy` because the frontend currently reaches Supabase through a service-role proxy that bypasses RLS.

**Tech Stack:** React, Vite, TypeScript, TanStack Query, Tailwind/shadcn UI, Supabase/PostgREST, Node test, Vitest, xlsx.

---

## File Structure

- Create `webpage/src/features/dispatch/logic.ts`: pure date, board, stats, idle, and sorting helpers.
- Create `webpage/src/features/dispatch/logic.test.ts`: failing-first tests for board calculations and idle sorting.
- Create `webpage/src/features/dispatch/api.ts`: Supabase reads/writes for vehicles, customers, records, and logs.
- Create `webpage/src/pages/DispatchBoardPage.tsx`: PC dispatch board UI, filters, dialogs, summaries, and row stats.
- Create `webpage/scripts/import-dispatch-excel.ts`: dry-run importer for monthly Excel sheets with mismatch review output.
- Modify `supabase/migrations/20260623120000_dispatch_management.sql`: new tables, indexes, grants, RLS enablement, vehicle metadata columns.
- Modify `webpage/db-proxy/authorize.js`: allow dispatch tables and enforce session-owned writes for staff.
- Modify `webpage/db-proxy/authorize.test.js`: tests for dispatch proxy rules.
- Modify `webpage/src/types/database.ts`: add dispatch/customer types and vehicle dispatch metadata.
- Modify `webpage/src/routes.tsx`, `webpage/src/components/layouts/MainLayout.tsx`, `webpage/src/components/layouts/Navbar.tsx`, `webpage/src/i18n/locales/zh.json`, `webpage/src/i18n/locales/en.json`, `webpage/package.json`: route, nav labels, script entry.

## Tasks

### Task 1: Tests First

- [ ] **Step 1: Add failing dispatch logic tests**

Create `webpage/src/features/dispatch/logic.test.ts` with examples for:
- month day generation for June 2026.
- one vehicle with no records is idle for the whole month.
- a row with two records on one date renders first customer plus `+1`.
- idle sort orders lowest monthly count first, then oldest last-dispatch date.

Run: `npm --prefix webpage test -- src/features/dispatch/logic.test.ts`
Expected: FAIL because `logic.ts` does not exist yet.

- [ ] **Step 2: Add failing proxy authorization tests**

Extend `webpage/db-proxy/authorize.test.js` with examples for:
- dispatch tables are allowlisted.
- non-admin `POST /dispatch_records` gets `agent_id` injected from session.
- non-admin `PATCH /dispatch_records?id=eq.1` is constrained with `agent_id=eq.<session.id>`.
- `DELETE /dispatch_records` is rejected.

Run: `node --test webpage/db-proxy/authorize.test.js`
Expected: FAIL until proxy logic is implemented.

### Task 2: Database and Proxy

- [ ] **Step 1: Implement migration**

Create `customers`, `dispatch_records`, `dispatch_operation_logs`, add `vehicles.type_seq` and `vehicles.operator`, create indexes and update trigger, enable RLS, and add explicit grants to `authenticated` and `service_role`.

- [ ] **Step 2: Implement proxy rules**

Update `authorize.js` so current `service_staff` session is the authority for dispatch writes:
- always force `agent_id=session.id` on dispatch record creation.
- strip `agent_id` from updates.
- for staff updates, append `agent_id=eq.<session.id>`.
- reject hard deletes.
- force `operator_id=session.id` on dispatch log creation.

- [ ] **Step 3: Verify proxy tests pass**

Run: `node --test webpage/db-proxy/authorize.test.js`
Expected: PASS.

### Task 3: Frontend Data and Board

- [ ] **Step 1: Implement pure board logic**

Create `logic.ts` with `getMonthDays`, `buildDispatchBoard`, `sortDispatchRows`, and idle/stat helpers.

- [ ] **Step 2: Verify logic tests pass**

Run: `npm --prefix webpage test -- src/features/dispatch/logic.test.ts`
Expected: PASS.

- [ ] **Step 3: Implement API**

Create `api.ts` for:
- active truck list from `vehicles_sorted`.
- monthly active dispatch records with embedded customer and agent.
- customer history names.
- create/update/soft-delete dispatch records and insert dispatch operation logs.

- [ ] **Step 4: Implement page**

Create `DispatchBoardPage.tsx` with month picker, type filters, idle threshold input, idle-sort switch, board grid, entry dialog, detail dialog, row stats, top summaries, and a retained period-distribution row.

### Task 4: Integration and Import

- [ ] **Step 1: Wire route and nav**

Add `/dispatch` to routes and fleet navigation, plus Chinese/English labels.

- [ ] **Step 2: Add import script**

Add `import:dispatch` script that parses workbook sheets into normalized rows and writes a JSON review report by default. Keep production writes off by default.

- [ ] **Step 3: Type-check and build**

Run:
- `npm --prefix webpage run lint`
- `npm --prefix webpage test -- src/features/dispatch/logic.test.ts`
- `node --test webpage/db-proxy/authorize.test.js`
- `npm --prefix webpage run build`

Expected: PASS.

### Task 5: Manual Verification

- [ ] **Step 1: Start local app**

Run `npm --prefix webpage run dev -- --host 127.0.0.1` and provide the local URL.

- [ ] **Step 2: Inspect the board**

Open `/dispatch` in browser, verify layout is non-overlapping on desktop and mobile width, and confirm dialogs and filters render.

## Self-Review

- Spec coverage: tables, customer sedimentation, soft delete/logging, month board, multi-record cells, idle highlighting, idle sorting, type filtering, row/top stats, and import dry-run are covered.
- Known adaptation: current project uses bigint staff/vehicle IDs and `plate_number`, not UUID `auth.uid()` and `plate_no`.
- Known limitation: database RLS is enabled and grants are explicit, but effective frontend ownership enforcement is in `db-proxy` because the current app uses service-role proxy requests.
