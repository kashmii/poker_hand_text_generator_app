/** 人数ごとのポジション名。players 配列と同じ [BTN, SB, BB, UTG, ...] の並び */
const POSITION_LABELS_BY_COUNT: Record<number, string[]> = {
  2: ['SB/BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP', 'HJ', 'CO'],
};

/** その人数のポジション名一覧（対応外の人数は空） */
export function positionLabels(count: number): string[] {
  return POSITION_LABELS_BY_COUNT[count] ?? [];
}
