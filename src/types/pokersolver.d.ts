// pokersolver には型定義が無い（@types も存在しない）ため、使う範囲だけ宣言する
declare module 'pokersolver' {
  export class Hand {
    /** 役名（例: 'Flush'） */
    name: string;
    /** 説明付きの役名（例: 'Flush, A High'） */
    descr: string;
    rank: number;
    /** 'Ah' 'Td' 形式のカード列（5〜7枚）から最強の5枚を評価する */
    static solve(cards: string[]): Hand;
    /** 最強のハンド（同率は全員）を返す。引数と同一の Hand オブジェクトが返る */
    static winners(hands: Hand[]): Hand[];
  }
}
