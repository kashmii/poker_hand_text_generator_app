import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WinnerPanel } from '../components/hand/ShowdownPanel';
import type { Player } from '../types/poker';
import type { ShowdownRecord } from '../components/hand/types';
import type { Pot } from '../utils/sidePots';
import type { ShowdownEvaluation } from '../utils/evaluateShowdown';

const players: Player[] = [
  { id: 'btn', name: 'BTN', stack: 1000, position: 0 },
  { id: 'sb',  name: 'SB',  stack: 1000, position: 1 },
  { id: 'bb',  name: 'BB',  stack: 1000, position: 2 },
  { id: 'utg', name: 'UTG', stack: 1000, position: 3 },
];
const positionLabels = ['BTN', 'SB', 'BB', 'UTG'];

const mainPot: Pot = { amount: 91, eligiblePlayerIds: ['utg', 'btn', 'bb'], label: 'main pot' };
const sidePot: Pot = { amount: 140, eligiblePlayerIds: ['btn', 'bb'], label: 'side pot' };

interface Overrides {
  pot?: Pot;
  candidateIds?: string[];
  potCount?: number;
  hasNextPot?: boolean;
  suggestion?: ShowdownEvaluation | null;
  showdownRecords?: ShowdownRecord[];
  onConfirm?: (winnerIds: string[]) => void;
  onBack?: () => void;
}

function renderPanel(props: Overrides = {}) {
  const onConfirm = props.onConfirm ?? vi.fn();
  render(
    <WinnerPanel
      pot={props.pot ?? mainPot}
      candidateIds={props.candidateIds ?? ['utg', 'btn', 'bb']}
      potCount={props.potCount ?? 2}
      hasNextPot={props.hasNextPot ?? true}
      players={players}
      positionLabels={positionLabels}
      currency="$"
      showdownRecords={props.showdownRecords ?? []}
      suggestion={props.suggestion}
      onConfirm={onConfirm}
      onBack={props.onBack}
    />,
  );
  return { onConfirm };
}

describe('WinnerPanel: 現在ポットの勝者選択（要求17）', () => {

  it('複数ポットのときはポットのラベルと「次のポットへ」を表示', () => {
    renderPanel({ pot: sidePot, candidateIds: ['btn', 'bb'], hasNextPot: false });
    expect(screen.getByText('side pot の勝者を選択')).toBeTruthy();
    expect(screen.getByText('保存 →')).toBeTruthy();
  });

  it('候補として渡した人だけがボタンに出る', () => {
    renderPanel({ pot: sidePot, candidateIds: ['btn', 'bb'] });
    expect(screen.getByText('BTN')).toBeTruthy();
    expect(screen.getByText('BB')).toBeTruthy();
    expect(screen.queryByText('UTG')).toBeNull();
  });

  it('勝者を選んで確定すると onConfirm に winnerIds が渡る', () => {
    const onConfirm = vi.fn();
    renderPanel({ onConfirm, hasNextPot: true });
    fireEvent.click(screen.getByText('UTG'));
    fireEvent.click(screen.getByText('次のポットへ →'));
    expect(onConfirm).toHaveBeenCalledWith(['utg']);
  });

  it('「1つ戻る」で onBack が呼ばれる', () => {
    const onBack = vi.fn();
    renderPanel({ onBack });
    fireEvent.click(screen.getByText('← 1つ戻る'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('チョップのトグルを入れると複数の勝者を選べ、配分が表示される', () => {
    const onConfirm = vi.fn();
    renderPanel({
      onConfirm,
      pot: { amount: 101, eligiblePlayerIds: ['sb', 'btn'], label: 'main pot' },
      candidateIds: ['btn', 'sb'],
      potCount: 1,
      hasNextPot: false,
    });
    // チョップを選ぶと候補全員が入る
    fireEvent.click(screen.getByText('チョップ（引き分け）'));
    // 101 を 2 人で: 端数 1 は postflop で先に動く SB へ
    expect(screen.getByText('配分: SB $51 / BTN $50')).toBeTruthy();
    fireEvent.click(screen.getByText('保存 →'));
    expect(onConfirm).toHaveBeenCalledWith(['btn', 'sb']);
  });

  it('金色になる選択肢は1つだけ: 単独勝者ならその人、チョップならチョップのボタン', () => {
    renderPanel({
      hasNextPot: false,
      suggestion: {
        winnerIds: ['btn'],
        descriptions: { utg: 'Pair', btn: 'Flush', bb: 'Pair' },
      },
    });
    const btn = screen.getByText('BTN').closest('button')!;
    const chopBtn = screen.getByText('チョップ（引き分け）');
    expect(btn.className).toContain('winner-btn--selected');
    expect(chopBtn.className).not.toContain('winner-chop-toggle--on');

    fireEvent.click(chopBtn);
    // チョップ中: プレイヤーは金色にならず、✓ だけ。金色はチョップのボタン
    expect(chopBtn.className).toContain('winner-chop-toggle--on');
    expect(btn.className).not.toContain('winner-btn--selected');
    expect(btn.textContent).toContain('✓');
  });

  it('チョップのトグルが OFF のときは1人しか選べない（誤タップでチョップにならない）', () => {
    const onConfirm = vi.fn();
    renderPanel({ onConfirm, hasNextPot: false });
    fireEvent.click(screen.getByText('UTG'));
    fireEvent.click(screen.getByText('BTN'));
    fireEvent.click(screen.getByText('保存 →'));
    expect(onConfirm).toHaveBeenCalledWith(['btn']);
  });

  it('自動判定があれば初期選択され、そのまま1タップで確定できる', () => {
    const onConfirm = vi.fn();
    renderPanel({
      onConfirm,
      hasNextPot: false,
      suggestion: {
        winnerIds: ['btn'],
        descriptions: { utg: 'Pair, 9\'s', btn: 'Flush, A High', bb: 'Pair, 2\'s' },
      },
    });
    expect(screen.getByText('Flush, A High')).toBeTruthy();
    expect((screen.getByText('保存 →') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByText('保存 →'));
    expect(onConfirm).toHaveBeenCalledWith(['btn']);
  });

  it('自動判定がチョップなら複数選択の状態で始まり、選び直しもできる', () => {
    const onConfirm = vi.fn();
    renderPanel({
      onConfirm,
      hasNextPot: false,
      suggestion: {
        winnerIds: ['utg', 'btn'],
        descriptions: { utg: 'Two Pair', btn: 'Two Pair', bb: 'Pair' },
      },
    });
    expect(screen.getByText(/（チョップ）/)).toBeTruthy();
    // 選び直し: BTN を外して UTG だけにする
    fireEvent.click(screen.getByText('BTN'));
    fireEvent.click(screen.getByText('保存 →'));
    expect(onConfirm).toHaveBeenCalledWith(['utg']);
  });

  it('自動判定が無く未選択のときは確定できない', () => {
    renderPanel({ hasNextPot: false });
    expect((screen.getByText('保存 →') as HTMLButtonElement).disabled).toBe(true);
  });

  it('見せたカードは白地に読める色で出る（黒スートは黒、赤スートは赤）', () => {
    renderPanel({
      candidateIds: ['btn'],
      showdownRecords: [{
        playerId: 'btn',
        action: 'show',
        cards: [{ rank: 'Q', suit: 's' }, { rank: 'K', suit: 'h' }],
      }],
    });
    expect(screen.getByText('Q♠').style.color).toBe('rgb(17, 17, 17)');
    expect(screen.getByText('K♥').style.color).toBe('rgb(229, 62, 62)');
  });

  it('単一ポットのときはラベルなしの見出し', () => {
    renderPanel({ pot: { amount: 200, eligiblePlayerIds: ['btn', 'bb'], label: 'main pot' }, candidateIds: ['btn', 'bb'], potCount: 1, hasNextPot: false });
    expect(screen.getByText('ポットの勝者を選択')).toBeTruthy();
  });

});
