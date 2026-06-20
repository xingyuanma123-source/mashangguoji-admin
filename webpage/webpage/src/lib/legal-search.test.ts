import { describe, expect, it } from 'vitest';

import { splitSearchHighlight } from './legal-search';

describe('splitSearchHighlight', () => {
  it('按关键词拆分摘录并保留原始大小写', () => {
    expect(splitSearchHighlight('Payment TERM and payment date', 'payment')).toEqual([
      { text: 'Payment', match: true },
      { text: ' TERM and ', match: false },
      { text: 'payment', match: true },
      { text: ' date', match: false },
    ]);
  });

  it('空关键词不高亮', () => {
    expect(splitSearchHighlight('合同正文', '')).toEqual([{ text: '合同正文', match: false }]);
  });
});
