import type { Card, ActionType } from '../../types/poker';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

/** 記録済みの1アクション */
export interface RecordedAction {
  playerId: string;
  playerLabel: string; // 'BTN', 'SB' など表示用
  type: ActionType;
  amount?: number;
}

/** ショーダウン時の1プレイヤーの結果 */
export interface ShowdownRecord {
  playerId: string;
  action: 'show' | 'muck';
  cards?: [Card, Card]; // show の場合のみ
}

/** ストリート内の状態スナップショット（「戻る」用） */
export interface StreetSnapshot {
  street: Street;
  actions: RecordedAction[];
  board: (Card | null)[];
}

/** 全ハンドの進行状態 */
export interface HandFlowState {
  currentStreet: Street;
  // 各ストリートの確定済みアクション
  streets: Record<Street, RecordedAction[]>;
  // ボードカード
  boards: Record<'flop' | 'turn' | 'river', (Card | null)[]>;
  // 現在のストリートで誰のターンか（playersIndex）
  currentActorIdx: number;
  // fold済みプレイヤーのID集合
  foldedIds: Set<string>;
  // 現在のストリートの最大ベット額（コール額計算用）
  currentBet: number;
  // 各プレイヤーが現在のストリートに投入した額
  contributions: Record<string, number>;
  /**
   * ストリート終了の「締め切りインデックス」。
   * 最後にbet/raise/allinした人のactiveOrder上のインデックス。
   * そのインデックスに到達（またはラップ通過）して allSquared になるとストリート終了。
   * bet/raise がなかった場合（check ラウンド）は -1（lappedEnd で判定）。
   * ストリート開始時は preflop なら BB の位置（order 末尾）、postflop なら -1。
   */
  closingActorIdx: number;
  // ポット累積
  pot: number;
  // フェーズ
  phase: 'hole-cards' | 'action' | 'board-input' | 'showdown' | 'winner' | 'done';
  // ヒーローのホールカード
  holeCards: [Card, Card] | null;
  // ショーダウン: 順番待ちのプレイヤーIDリスト（先頭が現在対象）
  showdownQueue: string[];
  // ショーダウン: 記録済み結果
  showdownRecords: ShowdownRecord[];
  // ウィナーID（potを取ったプレイヤー）
  winnerId: string | null;
}
