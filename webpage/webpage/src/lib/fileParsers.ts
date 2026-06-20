const MAX_MODEL_TEXT_LENGTH = 18000;
let pdfWorkerConfigured = false;

export interface ParsedLegalFile {
  fileName: string;
  fileTypeLabel: string;
  originalLength: number;
  truncatedLength: number;
  text: string;
}

function ensurePdfWorker(globalWorkerOptions: { workerSrc: string }) {
  if (pdfWorkerConfigured) {
    return;
  }

  globalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.6.205/pdf.worker.min.mjs';
  pdfWorkerConfigured = true;
}

function normalizeText(text: string) {
  return text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function truncateTextForModel(text: string) {
  if (text.length <= MAX_MODEL_TEXT_LENGTH) {
    return text;
  }

  const headLength = 7000;
  const middleLength = 4000;
  const tailLength = 7000;
  const middleStart = Math.max(0, Math.floor(text.length / 2) - Math.floor(middleLength / 2));

  return [
    text.slice(0, headLength),
    '\n\n[以下内容因篇幅过长已省略部分中段文本]\n\n',
    text.slice(middleStart, middleStart + middleLength),
    '\n\n[以下内容因篇幅过长已省略部分内容，以下为结尾重点文本]\n\n',
    text.slice(-tailLength),
  ].join('');
}

async function parsePdf(arrayBuffer: ArrayBuffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  ensurePdfWorker(pdfjs.GlobalWorkerOptions);

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();

    if (pageText) {
      pageTexts.push(pageText);
    }
  }

  return pageTexts.join('\n\n');
}

async function parseDocx(arrayBuffer: ArrayBuffer) {
  const { default: mammoth } = await import('mammoth/mammoth.browser');
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

function decodeXmlText(xml: string) {
  return xml
    .replace(/<(text:tab|w:tab)[^>]*\/>/g, '\t')
    .replace(/<\/(text:p|w:p|a:p)>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function parseZippedXml(arrayBuffer: ArrayBuffer, paths: string[]) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(arrayBuffer);
  const parts = await Promise.all(paths
    .map((path) => zip.file(path))
    .filter(Boolean)
    .map(async (entry) => decodeXmlText(await entry!.async('text'))));
  return parts.join('\n');
}

async function parseSpreadsheet(arrayBuffer: ArrayBuffer) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  return workbook.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
    return `[${name}]\n${csv}`;
  }).join('\n\n');
}

function parseRtf(text: string) {
  return text
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'[0-9a-f]{2}/gi, ' ')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '');
}

function getFileExtension(file: File) {
  const parts = file.name.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

export async function parseLegalFile(file: File): Promise<ParsedLegalFile> {
  const extension = getFileExtension(file);
  const arrayBuffer = await file.arrayBuffer();

  let rawText = '';
  let fileTypeLabel = '';

  if (extension === 'pdf' || file.type === 'application/pdf') {
    fileTypeLabel = 'PDF';
    rawText = await parsePdf(arrayBuffer);
  } else if (
    extension === 'docx' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    fileTypeLabel = 'Word DOCX';
    rawText = await parseDocx(arrayBuffer);
  } else if (['txt', 'md', 'json', 'csv', 'xml', 'eml'].includes(extension)) {
    fileTypeLabel = extension.toUpperCase();
    rawText = new TextDecoder().decode(arrayBuffer);
  } else if (extension === 'html' || extension === 'htm') {
    fileTypeLabel = 'HTML';
    rawText = decodeXmlText(new TextDecoder().decode(arrayBuffer));
  } else if (extension === 'rtf') {
    fileTypeLabel = 'RTF';
    rawText = parseRtf(new TextDecoder().decode(arrayBuffer));
  } else if (extension === 'odt') {
    fileTypeLabel = 'OpenDocument Text';
    rawText = await parseZippedXml(arrayBuffer, ['content.xml']);
  } else if (extension === 'pptx') {
    fileTypeLabel = 'PowerPoint';
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slides = Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path)).sort();
    rawText = await parseZippedXml(arrayBuffer, slides);
  } else if (extension === 'xls' || extension === 'xlsx') {
    fileTypeLabel = 'Spreadsheet';
    rawText = await parseSpreadsheet(arrayBuffer);
  } else {
    throw new Error('该格式可作为附件保存，但暂时无法自动读取正文。');
  }

  const normalizedText = normalizeText(rawText);

  if (!normalizedText) {
    throw new Error('未能从文件中读取到正文内容，请确认文件不是扫描件、空白文件或受保护文档。');
  }

  const truncatedText = truncateTextForModel(normalizedText);

  return {
    fileName: file.name,
    fileTypeLabel,
    originalLength: normalizedText.length,
    truncatedLength: truncatedText.length,
    text: truncatedText,
  };
}
