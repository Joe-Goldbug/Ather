// packages/core/src/evidence/diary-fields.ts
// Pure functions — no DB, no network
//
// 日记自由文本字段的"唯一还原实现"：
//   diary.service 用它构建 DiaryEntryFields（写入证据抽取），
//   profile.service 的证据原文回溯端点用它还原字段文本（2-A3 高亮）。
// 两处必须共用同一实现，否则 fragment 偏移会与还原文本错位。

import type { DiaryEntryFields, DiaryRealitySyncEventType } from './diary-evidence.js';

export function normalizeDiaryEventType(raw: string | undefined): DiaryRealitySyncEventType {
  const normalized = (raw ?? '').trim();
  switch (normalized) {
    case 'breakthrough':
    case 'compromise':
    case 'anger':
    case 'overwhelm':
    case 'boundary':
    case 'connection':
    case 'pattern':
      return normalized as DiaryRealitySyncEventType;
    default:
      return 'other';
  }
}

/**
 * 从结构化 answers 还原 DiaryEntryFields 的五个自由文本字段。
 * 与 diary.service 的历史内联逻辑保持一致（键序不得改动，否则偏移漂移）。
 */
export function buildDiaryEntryFields(
  answers: Record<string, string>,
  eventType: DiaryRealitySyncEventType,
): Pick<DiaryEntryFields, 'detail' | 'highPoint' | 'lowPoint' | 'patternNoticed' | 'connectionOrDistance'> {
  const detail = (answers.detail ?? answers.note ?? answers.summary ?? '').trim();

  const highPoint =
    eventType === 'breakthrough'
      ? detail
      : answers['high_point'] ?? answers['highPoint'] ?? answers['highlight'] ?? answers['peak'];

  const lowPoint =
    eventType === 'compromise' || eventType === 'anger' || eventType === 'overwhelm'
      ? detail
      : answers['low_point'] ?? answers['lowPoint'];

  const patternNoticed = answers['pattern'] ?? answers['pattern_noticed'] ?? answers['patternNoticed'] ?? detail;

  const connectionOrDistance =
    eventType === 'connection'
      ? detail
      : answers['connection'] ?? answers['connection_or_distance'] ?? answers['social'];

  return { detail: detail || undefined, highPoint, lowPoint, patternNoticed, connectionOrDistance };
}
