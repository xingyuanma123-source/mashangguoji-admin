import { describe, expect, it } from 'vitest';

import { getContractAlertLevel, parseModelJson } from './contract-extract';

describe('parseModelJson', () => {
  it('parses JSON wrapped in a markdown fence', () => {
    expect(parseModelJson('```json\n{"risk_level":"high","findings":[]}\n```')).toEqual({
      risk_level: 'high',
      findings: [],
    });
  });

  it('extracts the JSON object from surrounding model prose', () => {
    expect(parseModelJson('分析结果如下：\n{"title":"运输合同","auto_renew":false}\n请人工核对。')).toEqual({
      title: '运输合同',
      auto_renew: false,
    });
  });
});

describe('getContractAlertLevel', () => {
  it('uses the renewal notice deadline for auto-renew contracts', () => {
    expect(getContractAlertLevel({
      endDate: '2026-10-01',
      today: '2026-06-11',
      autoRenew: true,
      renewNoticeDays: 60,
    })).toEqual({ level: 60, effectiveDaysLeft: 52 });
  });

  it('returns no alert outside the 90 day window', () => {
    expect(getContractAlertLevel({
      endDate: '2026-10-01',
      today: '2026-06-11',
      autoRenew: false,
      renewNoticeDays: null,
    })).toEqual({ level: null, effectiveDaysLeft: 112 });
  });
});
