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
  // all-in済みプレイヤーのID集合（アクション順から除外）
  allInIds: Set<string>;
  // 現在のストリートの最大ベット額（コール額計算用）
  currentBet: number;
  // 各プレイヤーが現在のストリートに投入した額
  contributions: Record<string, number>;
  /**
   * ストリート終了の「締め切りプレイヤーID」。
   * このプレイヤーがアクション（call/check/fold）したとき、
   * allSquared であればストリート終了と判定する。
   * - プリフロップ開始時: BB のID（BBが必ずアクションする）
   * - bet/raise/allin 後: ベッター自身のID（ベッターの直前の人がコールしたら終了）
   * - ポストフロップ開始（checkラウンド）: null（lappedEnd で判定）
   */
  closingPlayerId: string | null;
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
