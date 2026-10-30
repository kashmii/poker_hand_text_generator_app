import type { Card, ActionType } from '../../types/poker';
import type { Pot, WinnerEntry } from '../../utils/sidePots';

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
  // 各プレイヤーのハンド通算投入額（アンティ織り込み済み・グロス）。
  // サイドポット計算の入力。未コール分の返却は computeSidePots 側で処理する。
  totalContributions: Record<string, number>;
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

  // ---- サイドポットのカスケード解決（サイド→メインの順で判定） ----
  // 解決対象のポット一覧（computeSidePots の並び = main→side）
  pots: Pot[];
  // 現在解決中のポットのインデックス（pots 配列内）。上位(side)から下位(main)へ進む。未開始/終了は -1
  potResolveIdx: number;
  // 上位ポットの勝者（下位ポットへ持ち越す。チョップなら複数）
  carriedWinnerIds: string[];
  // 上位ポットで敗退し、下位ポットの候補から除外されるプレイヤー
  eliminatedIds: Set<string>;
  // 確定したポット勝者（常に main→side 順。チョップは同一ポットのエントリが複数並ぶ）
  potWinners: WinnerEntry[];
}
