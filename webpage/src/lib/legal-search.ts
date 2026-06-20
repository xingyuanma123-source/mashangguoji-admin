export interface SearchHighlightPart {
  text: string;
  match: boolean;
}

export function splitSearchHighlight(text: string, keyword: string): SearchHighlightPart[] {
  const normalized = keyword.trim();
  if (!normalized) return [{ text, match: false }];

  const parts: SearchHighlightPart[] = [];
  const lowerText = text.toLocaleLowerCase();
  const lowerKeyword = normalized.toLocaleLowerCase();
  let cursor = 0;

  while (cursor < text.length) {
    const index = lowerText.indexOf(lowerKeyword, cursor);
    if (index === -1) {
      parts.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (index > cursor) parts.push({ text: text.slice(cursor, index), match: false });
    parts.push({ text: text.slice(index, index + normalized.length), match: true });
    cursor = index + normalized.length;
  }

  return parts.length > 0 ? parts : [{ text, match: false }];
}
