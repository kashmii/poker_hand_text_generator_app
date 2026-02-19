// ========== カード ==========
export type Suit = 'h' | 'd' | 'c' | 's'; // hearts, diamonds, clubs, spades
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

// ========== アクション ==========
export type ActionType =
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'allin';

export interface Action {
  playerId: string;
  type: ActionType;
  amount?: number; // bet/raise/call/allinの場合
}

// ========== ストリート ==========
export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export interface StreetData {
  actions: Action[];
  board?: Card[]; // flop=3枚, turn=1枚, river=1枚
}

// ========== ショーダウン ==========
export interface ShowdownEntry {
  playerId: string;
  cards: [Card, Card];
  handDescription?: string; // "two pair, Aces and Kings" など
}

// ========== プレイヤー ==========
export interface Player {
  id: string;
  name: string;
  stack: number; // スタック（ビッグブラインド単位 or チップ）
  position: number; // 0=BTN, 1=SB, 2=BB, ...
  holeCards?: [Card, Card]; // ヒーロー or ショーダウン時
}

// ========== セッション設定 ==========
export interface SessionConfig {
  smallBlind: number;
  bigBlind: number;
  ante: number; // 0 = なし
  currency: string; // '$', '€', '¥', 'BB' など
  players: Player[];
  heroId: string; // 自分のプレイヤーID
}

// ========== ハンド ==========
export interface HandData {
  id: string;
  handNumber: number;
  dealerPosition: number; // players配列のインデックス
  streets: {
    preflop: StreetData;
    flop?: StreetData;
    turn?: StreetData;
    river?: StreetData;
  };
  showdown?: ShowdownEntry[];
  pot: number; // 最終ポット
  winners: {
    playerId: string;
    amount: number;
    description?: string; // "with flush" など
  }[];
  notes?: string;
}

// ========== アプリ状態 ==========
export type AppScreen =
  | 'session-setup'   // セッション設定
  | 'hand-input'      // ハンド入力
  | 'hand-review'     // ハンド確認・出力
  | 'history';        // 過去ハンド一覧

export type OutputLanguage = 'en' | 'ja';
export type OutputFormat = 'custom' | 'pokerstars';

export interface AppSettings {
  outputLanguage: OutputLanguage;
  outputFormat: OutputFormat;
}
