#!/usr/bin/env python3
"""Stage-1 payroll import parser and balance verifier.

Default mode is read-only: parse the June driver advance workbook and verify
the same balance formula as public.driver_advance_balance. Pass --workbook
when the source file is not in the current working directory.

Use --emit-sql to generate a staging-only SQL import script. The generated SQL
looks up driver_id by driver name, writes expense_records as confirmed, maps
the overtime marker, and imports only the bottom recharge ledger.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from openpyxl.utils.datetime import from_excel


WORKBOOK = Path("2026年6月司机备用金.xlsx")
PERIOD = "2026-06"
YEAR = 2026
MONTH = 6

DRIVER_SHEETS = [
    "徐良斌",
    "陆贻祥",
    "仇兆春",
    "黄崇开",
    "吴子新",
    "谭德光",
    "韦成碧",
    "秦林勇",
    "李鉴钊",
    "莫继凡",
    "严星星",
]

TARGET_BALANCES = {
    "徐良斌": Decimal("586.00"),
    "陆贻祥": Decimal("484.12"),
    "仇兆春": Decimal("446.00"),
    "黄崇开": Decimal("430.00"),
    "吴子新": Decimal("375.00"),
    "谭德光": Decimal("363.00"),
    "韦成碧": Decimal("313.00"),
    "秦林勇": Decimal("437.75"),
    "李鉴钊": Decimal("357.00"),
    "莫继凡": Decimal("327.00"),
    "严星星": Decimal("387.00"),
}

FEE_COLUMNS = {
    "fee_weighing": 5,
    "fee_container": 6,
    "fee_overnight": 7,
    "fee_vn_overtime": 8,
    "fee_vn_key": 9,
    "fee_parking": 10,
    "fee_newpost": 11,
    "fee_taxi": 12,
    "fee_water": 13,
    "fee_tarpaulin": 14,
    "fee_highway": 15,
    "fee_stamp": 16,
}


@dataclass
class ExpenseRow:
    sheet: str
    row_number: int
    record_date: date
    plate_number: str
    driver_name: str
    route: str | None
    fees: dict[str, Decimal]
    note_amount: Decimal
    note_detail: str | None
    total_expense: Decimal
    commission: Decimal
    is_overtime: bool


@dataclass
class FundRow:
    sheet: str
    row_number: int
    fund_date: date
    driver_name: str
    amount: Decimal
    note: str


@dataclass
class SheetResult:
    driver_name: str
    expense_total: Decimal
    fund_total: Decimal
    calculated_balance: Decimal
    sheet_balance: Decimal
    target_balance: Decimal
    expense_rows: list[ExpenseRow]
    fund_rows: list[FundRow]


def money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0.00")
    if isinstance(value, str):
        stripped = value.strip()
        if stripped in ("", "/"):
            return Decimal("0.00")
        value = stripped
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")


def text_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def sql_text(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def sql_bool(value: bool) -> str:
    return "true" if value else "false"


def parse_excel_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)):
        return from_excel(value).date()
    if isinstance(value, str):
        text = value.strip()
        match = re.search(r"(\d{1,2})/(\d{1,2})", text)
        if match:
            return date(YEAR, int(match.group(1)), int(match.group(2)))
        return datetime.strptime(text, "%Y-%m-%d").date()
    raise ValueError(f"Unsupported date value: {value!r}")


def parse_fund_date(label: str) -> date:
    match = re.search(r"(\d{1,2})/(\d{1,2})", label)
    if not match:
        raise ValueError(f"Cannot parse fund date from {label!r}")
    return date(YEAR, int(match.group(1)), int(match.group(2)))


def is_numberish(value: Any) -> bool:
    if value in (None, ""):
        return False
    if isinstance(value, (int, float, Decimal)):
        return True
    if isinstance(value, str):
        try:
            Decimal(value.strip())
            return True
        except Exception:
            return False
    return False


def find_fund_start(ws) -> int:
    for row in range(3, ws.max_row + 1):
        label = text_or_none(ws.cell(row, 16).value)
        amount = ws.cell(row, 17).value
        if label and "备用金" in label and is_numberish(amount):
            return row
    raise ValueError(f"{ws.title}: bottom fund ledger not found")


def find_sheet_balance(ws) -> Decimal:
    for row in range(3, ws.max_row + 1):
        marker = text_or_none(ws.cell(row, 19).value)
        if marker == "余":
            return money(ws.cell(row, 20).value)
    raise ValueError(f"{ws.title}: bottom balance marker not found")


def parse_note(note_value: Any, note_detail_value: Any) -> tuple[Decimal, str | None]:
    note_amount = Decimal("0.00")
    details: list[str] = []

    if note_value not in (None, ""):
        if is_numberish(note_value):
            note_amount = money(note_value)
        else:
            details.append(str(note_value).strip())

    detail_text = text_or_none(note_detail_value)
    if detail_text:
        details.append(detail_text)

    return note_amount, "\n".join(details) if details else None


def parse_sheet(ws) -> SheetResult:
    driver_name = ws.title
    fund_start = find_fund_start(ws)
    sheet_balance = find_sheet_balance(ws)
    target_balance = TARGET_BALANCES[driver_name]

    expense_rows: list[ExpenseRow] = []
    fund_rows: list[FundRow] = []
    current_date: date | None = None

    for row in range(3, fund_start):
        raw_date = ws.cell(row, 1).value
        if raw_date not in (None, ""):
            current_date = parse_excel_date(raw_date)

        total_expense = money(ws.cell(row, 19).value)
        commission = money(ws.cell(row, 20).value)
        row_driver = text_or_none(ws.cell(row, 3).value)
        plate_number = text_or_none(ws.cell(row, 2).value)
        has_detail = row_driver == driver_name and (
            total_expense != 0
            or commission != 0
            or any(money(ws.cell(row, col).value) != 0 for col in FEE_COLUMNS.values())
            or ws.cell(row, 17).value not in (None, "")
            or ws.cell(row, 18).value not in (None, "")
        )
        if not has_detail:
            continue
        if current_date is None:
            raise ValueError(f"{driver_name} row {row}: missing date before detail row")

        note_amount, note_detail = parse_note(ws.cell(row, 17).value, ws.cell(row, 18).value)
        expense_rows.append(
            ExpenseRow(
                sheet=driver_name,
                row_number=row,
                record_date=current_date,
                plate_number=plate_number or "",
                driver_name=driver_name,
                route=text_or_none(ws.cell(row, 4).value),
                fees={field: money(ws.cell(row, col).value) for field, col in FEE_COLUMNS.items()},
                note_amount=note_amount,
                note_detail=note_detail,
                total_expense=total_expense,
                commission=commission,
                is_overtime=text_or_none(ws.cell(row, 22).value) == "加班",
            )
        )

    for row in range(fund_start, ws.max_row + 1):
        label = text_or_none(ws.cell(row, 16).value)
        amount = ws.cell(row, 17).value
        if not label or "备用金" not in label or not is_numberish(amount):
            continue
        fund_rows.append(
            FundRow(
                sheet=driver_name,
                row_number=row,
                fund_date=parse_fund_date(label),
                driver_name=driver_name,
                amount=money(amount),
                note=label,
            )
        )

    expense_total = sum((row.total_expense for row in expense_rows), Decimal("0.00")).quantize(Decimal("0.01"))
    fund_total = sum((row.amount for row in fund_rows), Decimal("0.00")).quantize(Decimal("0.01"))
    calculated_balance = (fund_total - expense_total).quantize(Decimal("0.01"))

    return SheetResult(
        driver_name=driver_name,
        expense_total=expense_total,
        fund_total=fund_total,
        calculated_balance=calculated_balance,
        sheet_balance=sheet_balance,
        target_balance=target_balance,
        expense_rows=expense_rows,
        fund_rows=fund_rows,
    )


def parse_workbook(path: Path) -> list[SheetResult]:
    wb = load_workbook(path, data_only=True)
    missing = [sheet for sheet in DRIVER_SHEETS if sheet not in wb.sheetnames]
    if missing:
        raise ValueError(f"Missing required driver sheets: {missing}")

    return [parse_sheet(wb[sheet]) for sheet in DRIVER_SHEETS]


def render_summary(results: list[SheetResult]) -> list[dict[str, str]]:
    rows = []
    for result in results:
        rows.append(
            {
                "driver": result.driver_name,
                "expense_total": str(result.expense_total),
                "fund_total": str(result.fund_total),
                "calculated_balance": str(result.calculated_balance),
                "sheet_balance": str(result.sheet_balance),
                "target_balance": str(result.target_balance),
                "ok": str(
                    result.calculated_balance == result.sheet_balance == result.target_balance
                ).lower(),
            }
        )
    return rows


def expense_insert_sql(row: ExpenseRow) -> str:
    fields = [
        "driver_id",
        "record_date",
        "plate_number",
        "route",
        *FEE_COLUMNS.keys(),
        "note_amount",
        "note_detail",
        "total_expense",
        "commission",
        "status",
        "confirmed_at",
        "is_overtime",
    ]
    values = [
        f"(SELECT id FROM public.drivers WHERE name = {sql_text(row.driver_name)} LIMIT 1)",
        sql_text(row.record_date.isoformat()),
        sql_text(row.plate_number),
        sql_text(row.route),
        *[str(row.fees[field]) for field in FEE_COLUMNS.keys()],
        str(row.note_amount),
        sql_text(row.note_detail),
        str(row.total_expense),
        str(row.commission),
        "'confirmed'",
        "now()",
        sql_bool(row.is_overtime),
    ]
    return (
        f"INSERT INTO public.expense_records ({', '.join(fields)})\n"
        f"VALUES ({', '.join(values)});"
    )


def fund_insert_sql(row: FundRow) -> str:
    return (
        "INSERT INTO public.advance_fund_records "
        "(driver_id, amount, fund_date, month, note)\n"
        "VALUES ("
        f"(SELECT id FROM public.drivers WHERE name = {sql_text(row.driver_name)} LIMIT 1), "
        f"{row.amount}, {sql_text(row.fund_date.isoformat())}, {sql_text(PERIOD)}, {sql_text(row.note)}"
        ");"
    )


def emit_sql(path: Path, results: list[SheetResult]) -> None:
    drivers_sql = ", ".join(sql_text(name) for name in DRIVER_SHEETS)
    statements = [
        "-- Staging-only import generated by scripts/import_payroll_stage1.py",
        "-- Review the target database before running. Do not run against prod.",
        "BEGIN;",
        (
            "DELETE FROM public.expense_records\n"
            f"WHERE record_date >= '{PERIOD}-01'\n"
            "  AND record_date < DATE '2026-07-01'\n"
            f"  AND driver_id IN (SELECT id FROM public.drivers WHERE name IN ({drivers_sql}));"
        ),
        (
            "DELETE FROM public.advance_fund_records\n"
            f"WHERE month = {sql_text(PERIOD)}\n"
            f"  AND driver_id IN (SELECT id FROM public.drivers WHERE name IN ({drivers_sql}));"
        ),
    ]
    for result in results:
        statements.extend(expense_insert_sql(row) for row in result.expense_rows)
        statements.extend(fund_insert_sql(row) for row in result.fund_rows)
    statements.append("COMMIT;")
    path.write_text("\n\n".join(statements) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", type=Path, default=WORKBOOK)
    parser.add_argument("--emit-sql", type=Path, help="Write staging import SQL to this path")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON summary")
    args = parser.parse_args()

    results = parse_workbook(args.workbook)
    summary = render_summary(results)
    all_ok = all(row["ok"] == "true" for row in summary)

    if args.emit_sql:
        emit_sql(args.emit_sql, results)

    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        print("driver,expense_total,fund_total,calculated_balance,sheet_balance,target_balance,ok")
        for row in summary:
            print(
                ",".join(
                    [
                        row["driver"],
                        row["expense_total"],
                        row["fund_total"],
                        row["calculated_balance"],
                        row["sheet_balance"],
                        row["target_balance"],
                        row["ok"],
                    ]
                )
            )

    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
