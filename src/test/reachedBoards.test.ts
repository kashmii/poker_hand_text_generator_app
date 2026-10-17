import { describe, it, expect } from 'vitest';
import { reachedBoards } from '../utils/reachedBoards';
import type { Card } from '../types/poker';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

// ボード先行入力メモで全ストリート入力済みの状態
const fullBoards = {
  flop: [c('A', 'h'), c('K', 'd'), c('7', 'c')],
  turn: [c('2', 's')],
  river: [c('9', 'h')],
};

describe('reachedBoards', () => {
  it('プリフロップで決着したら全ボードを空にする', () => {
    expect(reachedBoards(fullBoards, 'preflop')).toEqual({
      flop: [null, null, null],
      turn: [null],
      river: [null],
    });
  });

  it('フロップで決着したらターン/リバーを空にする', () => {
    expect(reachedBoards(fullBoards, 'flop')).toEqual({
      flop: fullBoards.flop,
      turn: [null],
      river: [null],
    });
  });

  it('ターンで決着したらリバーだけを空にする', () => {
    expect(reachedBoards(fullBoards, 'turn')).toEqual({
      flop: fullBoards.flop,
      turn: fullBoards.turn,
      river: [null],
    });
  });

  it('リバーまで到達したら全ボードを残す', () => {
    expect(reachedBoards(fullBoards, 'river')).toEqual(fullBoards);
  });

  it('到達ストリートの未入力スロットはそのまま残す', () => {
    const partial = { flop: [c('A', 'h'), null, null], turn: [null], river: [c('9', 'h')] };
    expect(reachedBoards(partial, 'turn')).toEqual({
      flop: [c('A', 'h'), null, null],
      turn: [null],
      river: [null],
    });
  });

  it('元のボードを変更しない', () => {
    const boards = { flop: [...fullBoards.flop], turn: [...fullBoards.turn], river: [...fullBoards.river] };
    reachedBoards(boards, 'preflop');
    expect(boards).toEqual(fullBoards);
  });
});
