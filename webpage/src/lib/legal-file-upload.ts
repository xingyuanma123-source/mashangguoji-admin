export const MAX_LEGAL_FILE_SIZE_MB = 50;

export const LEGAL_DOCUMENT_ACCEPT = '*/*';

const BLOCKED_EXECUTABLE_EXTENSIONS = new Set([
  'app', 'apk', 'bat', 'bin', 'cmd', 'com', 'cpl', 'dll', 'dmg', 'exe',
  'gadget', 'hta', 'inf', 'ins', 'iso', 'jar', 'js', 'jse', 'lnk', 'msi',
  'msp', 'mst', 'pif', 'ps1', 'reg', 'scr', 'sh', 'sys', 'vb', 'vbe', 'vbs',
  'ws', 'wsc', 'wsf', 'wsh',
]);

const PARSEABLE_EXTENSIONS = new Set([
  'docx', 'rtf', 'odt', 'txt', 'md', 'html', 'htm', 'xml', 'json',
  'csv', 'xls', 'xlsx', 'pptx', 'eml',
]);

function extensionOf(file: File) {
  return file.name.toLocaleLowerCase().split('.').pop() || '';
}

export type LegalFileProcessingMode = 'ocr' | 'parse' | 'attachment';

export function validateLegalDocumentFile(file: File): 'invalid_type' | 'too_large' | null {
  const extension = extensionOf(file);
  if (BLOCKED_EXECUTABLE_EXTENSIONS.has(extension)) return 'invalid_type';
  if (file.size > MAX_LEGAL_FILE_SIZE_MB * 1024 * 1024) return 'too_large';
  return null;
}

export function getLegalFileProcessingMode(file: File): LegalFileProcessingMode {
  const extension = extensionOf(file);
  if (file.type.startsWith('image/') || extension === 'pdf' || file.type === 'application/pdf') return 'ocr';
  if (PARSEABLE_EXTENSIONS.has(extension)) return 'parse';
  return 'attachment';
}
