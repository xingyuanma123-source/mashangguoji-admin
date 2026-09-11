import XLSX from 'xlsx';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface CliOptions {
  workbooks: string[];
  month?: string;
  year?: number;
  out?: string;
}

interface NormalizedDispatchRow {
  source_file: string;
  sheet_name: string;
  row_number: number;
  column_number: number;
  plate_number: string;
  dispatch_date: string;
  customer_name: string;
  agent_name: string;
  raw_value: string;
}

interface ImportIssue {
  source_file: string;
  sheet_name: string;
  row_number?: number;
  column_number?: number;
  plate_number?: string;
  raw_value?: string;
  reason: string;
}

interface WorkbookReport {
  source_file: string;
  records: NormalizedDispatchRow[];
  issues: ImportIssue[];
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const defaultOutDir = path.join(repoRoot, 'tmp', 'dispatch-import');
const platePattern = /[\u4e00-\u9fa5][A-Z][A-Z0-9]{5,6}/i;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { workbooks: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--workbook' || arg === '-w') {
      options.workbooks.push(path.resolve(argv[++index]));
    } else if (arg === '--month' || arg === '-m') {
      options.month = argv[++index];
    } else if (arg === '--year' || arg === '-y') {
      options.year = Number(argv[++index]);
    } else if (arg === '--out' || arg === '-o') {
      options.out = path.resolve(argv[++index]);
    } else if (!arg.startsWith('-')) {
      options.workbooks.push(path.resolve(arg));
    }
  }
  return options;
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function parseDayHeader(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31) return value;
  const text = cellText(value);
  const match = /^(\d{1,2})(?:日|号)?$/.exec(text);
  if (!match) return null;
  const day = Number(match[1]);
  return day >= 1 && day <= 31 ? day : null;
}

function normalizeMonth(month: string) {
  const match = /^(\d{4})-(\d{1,2})$/.exec(month.trim());
  if (!match) throw new Error(`月份格式应为 YYYY-MM：${month}`);
  return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
}

function monthFromSheetName(sheetName: string, fallbackYear?: number): string | null {
  const explicit = /(\d{4})[-/.年](\d{1,2})/.exec(sheetName);
  if (explicit) return normalizeMonth(`${explicit[1]}-${explicit[2]}`);

  const monthOnly = /(^|\D)(\d{1,2})\s*月/.exec(sheetName);
  if (monthOnly && fallbackYear) {
    return normalizeMonth(`${fallbackYear}-${monthOnly[2]}`);
  }
  return null;
}

function dateForDay(month: string, day: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  if (day > lastDay) return null;
  return `${month}-${String(day).padStart(2, '0')}`;
}

function extractPlate(value: unknown) {
  const match = platePattern.exec(cellText(value).toUpperCase());
  return match?.[0] ?? '';
}

function isLikelyDirtyCustomer(value: string) {
  return platePattern.test(value.toUpperCase()) || /^[a-z]$/i.test(value);
}

function findHeaderRow(rows: unknown[][]) {
  let best = { rowIndex: -1, dayColumns: [] as Array<{ columnIndex: number; day: number }> };
  rows.forEach((row, rowIndex) => {
    const dayColumns = row
      .map((value, columnIndex) => ({ columnIndex, day: parseDayHeader(value) }))
      .filter((item): item is { columnIndex: number; day: number } => item.day !== null);
    if (dayColumns.length > best.dayColumns.length) {
      best = { rowIndex, dayColumns };
    }
  });
  return best.dayColumns.length >= 7 ? best : null;
}

function findPlateColumn(rows: unknown[][], headerRowIndex: number, firstDayColumn: number) {
  let bestColumn = 0;
  let bestCount = -1;
  for (let columnIndex = 0; columnIndex < firstDayColumn; columnIndex += 1) {
    let count = 0;
    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      if (extractPlate(rows[rowIndex]?.[columnIndex])) count += 1;
    }
    if (count > bestCount) {
      bestColumn = columnIndex;
      bestCount = count;
    }
  }
  return bestColumn;
}

function splitCellEntries(value: string) {
  return value
    .split(/[,，;；、\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseDispatchEntry(entry: string) {
  const parts = entry.split(/[-－—]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const customer = parts[0];
  const agent = parts.slice(1).join('-');
  if (!customer || !agent || isLikelyDirtyCustomer(customer)) return null;
  return { customer, agent };
}

function parseSheet(params: {
  sourceFile: string;
  sheetName: string;
  rows: unknown[][];
  month: string;
}): WorkbookReport {
  const records: NormalizedDispatchRow[] = [];
  const issues: ImportIssue[] = [];
  const header = findHeaderRow(params.rows);

  if (!header) {
    issues.push({
      source_file: params.sourceFile,
      sheet_name: params.sheetName,
      reason: '未找到日期表头行（需要至少 7 个 1-31 日期列）',
    });
    return { source_file: params.sourceFile, records, issues };
  }

  const firstDayColumn = Math.min(...header.dayColumns.map((column) => column.columnIndex));
  const plateColumn = findPlateColumn(params.rows, header.rowIndex, firstDayColumn);

  for (let rowIndex = header.rowIndex + 1; rowIndex < params.rows.length; rowIndex += 1) {
    const row = params.rows[rowIndex] ?? [];
    const plateNumber = extractPlate(row[plateColumn]);
    if (!plateNumber) continue;

    for (const dayColumn of header.dayColumns) {
      const rawValue = cellText(row[dayColumn.columnIndex]);
      if (!rawValue) continue;

      const dispatchDate = dateForDay(params.month, dayColumn.day);
      if (!dispatchDate) {
        issues.push({
          source_file: params.sourceFile,
          sheet_name: params.sheetName,
          row_number: rowIndex + 1,
          column_number: dayColumn.columnIndex + 1,
          plate_number: plateNumber,
          raw_value: rawValue,
          reason: `日期不存在：${params.month}-${dayColumn.day}`,
        });
        continue;
      }

      for (const entry of splitCellEntries(rawValue)) {
        const parsed = parseDispatchEntry(entry);
        if (!parsed) {
          issues.push({
            source_file: params.sourceFile,
            sheet_name: params.sheetName,
            row_number: rowIndex + 1,
            column_number: dayColumn.columnIndex + 1,
            plate_number: plateNumber,
            raw_value: entry,
            reason: '无法按「客户-客服」解析，或疑似脏数据',
          });
          continue;
        }

        records.push({
          source_file: params.sourceFile,
          sheet_name: params.sheetName,
          row_number: rowIndex + 1,
          column_number: dayColumn.columnIndex + 1,
          plate_number: plateNumber,
          dispatch_date: dispatchDate,
          customer_name: parsed.customer,
          agent_name: parsed.agent,
          raw_value: entry,
        });
      }
    }
  }

  return { source_file: params.sourceFile, records, issues };
}

function parseWorkbook(filePath: string, options: CliOptions): WorkbookReport {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sourceFile = path.basename(filePath);
  const combined: WorkbookReport = { source_file: sourceFile, records: [], issues: [] };

  for (const sheetName of workbook.SheetNames) {
    const month = options.month ? normalizeMonth(options.month) : monthFromSheetName(sheetName, options.year);
    if (!month) {
      combined.issues.push({
        source_file: sourceFile,
        sheet_name: sheetName,
        reason: '无法从 sheet 名识别月份，请传 --month YYYY-MM 或 --year YYYY',
      });
      continue;
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: true,
      blankrows: false,
    });
    const report = parseSheet({ sourceFile, sheetName, rows, month });
    combined.records.push(...report.records);
    combined.issues.push(...report.issues);
  }

  return combined;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.workbooks.length === 0) {
    throw new Error('请提供 Excel 文件：npm run import:dispatch -- --workbook /path/to/file.xlsx --month 2026-06');
  }

  for (const workbook of options.workbooks) {
    if (!existsSync(workbook)) throw new Error(`文件不存在：${workbook}`);
  }

  const reports = options.workbooks.map((workbook) => parseWorkbook(workbook, options));
  const payload = {
    generated_at: new Date().toISOString(),
    dry_run: true,
    summary: {
      workbook_count: reports.length,
      record_count: reports.reduce((sum, report) => sum + report.records.length, 0),
      issue_count: reports.reduce((sum, report) => sum + report.issues.length, 0),
    },
    reports,
  };

  const outPath = options.out ?? path.join(defaultOutDir, `dispatch-import-review-${Date.now()}.json`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`解析完成：${payload.summary.record_count} 条记录，${payload.summary.issue_count} 条待核对`);
  console.log(`报告已写入：${outPath}`);
  console.log('dry_run=true：本脚本未写入数据库。');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
