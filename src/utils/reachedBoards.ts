import type { Card } from '../types/poker';
import type { Street } from '../components/hand/types';

type BoardStreet = 'flop' | 'turn' | 'river';
type Boards = Record<BoardStreet, (Card | null)[]>;

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

/**
 * 到達したストリートのボードだけを残し、未到達ストリートのボードを空にして返す。
 * ボード先行入力メモで入力したカードのうち、ハンドが到達しなかったストリートの分を
 * 保存対象から外すために使う（例: フロップで決着したらターン/リバーは保存しない）。
 */
export function reachedBoards(boards: Boards, currentStreet: Street): Boards {
  const reachedIdx = STREETS.indexOf(currentStreet);
  const pick = (street: BoardStreet) =>
    STREETS.indexOf(street) <= reachedIdx ? boards[street] : boards[street].map(() => null);
  return { flop: pick('flop'), turn: pick('turn'), river: pick('river') };
}
