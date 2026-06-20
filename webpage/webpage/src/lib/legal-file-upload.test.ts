import { describe, expect, it } from 'vitest';

import { getLegalFileProcessingMode, validateLegalDocumentFile } from './legal-file-upload';

function file(name: string, type: string, size = 1024) {
  const result = new File(['x'], name, { type, lastModified: 0 });
  Object.defineProperty(result, 'size', { value: size });
  return result;
}

describe('validateLegalDocumentFile', () => {
  it('accepts common legal document and evidence formats', () => {
    for (const candidate of [
      file('contract.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      file('legacy.doc', 'application/msword'),
      file('terms.rtf', 'application/rtf'),
      file('evidence.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      file('archive.zip', 'application/zip'),
      file('signed-document.ofd', 'application/ofd'),
    ]) {
      expect(validateLegalDocumentFile(candidate)).toBeNull();
    }
  });

  it('rejects executable files and oversized files', () => {
    expect(validateLegalDocumentFile(file('payload.exe', 'application/octet-stream'))).toBe('invalid_type');
    expect(validateLegalDocumentFile(file('large.pdf', 'application/pdf', 51 * 1024 * 1024))).toBe('too_large');
  });
});

describe('getLegalFileProcessingMode', () => {
  it('routes files to OCR, local parsing, or attachment-only handling', () => {
    expect(getLegalFileProcessingMode(file('scan.png', 'image/png'))).toBe('ocr');
    expect(getLegalFileProcessingMode(file('contract.pdf', 'application/pdf'))).toBe('ocr');
    expect(getLegalFileProcessingMode(file('contract.docx', ''))).toBe('parse');
    expect(getLegalFileProcessingMode(file('legacy.doc', 'application/msword'))).toBe('attachment');
  });
});
