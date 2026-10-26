import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WinnerPanel } from '../components/hand/ShowdownPanel';
import type { Player } from '../types/poker';
import type { Pot } from '../utils/sidePots';

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
  onConfirm?: (winnerId: string) => void;
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
      showdownRecords={[]}
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

  it('勝者を選んで確定すると onConfirm に winnerId が渡る', () => {
    const onConfirm = vi.fn();
    renderPanel({ onConfirm, hasNextPot: true });
    fireEvent.click(screen.getByText('UTG'));
    fireEvent.click(screen.getByText('次のポットへ →'));
    expect(onConfirm).toHaveBeenCalledWith('utg');
  });

  it('「1つ戻る」で onBack が呼ばれる', () => {
    const onBack = vi.fn();
    renderPanel({ onBack });
    fireEvent.click(screen.getByText('← 1つ戻る'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('単一ポットのときはラベルなしの見出し', () => {
    renderPanel({ pot: { amount: 200, eligiblePlayerIds: ['btn', 'bb'], label: 'main pot' }, candidateIds: ['btn', 'bb'], potCount: 1, hasNextPot: false });
    expect(screen.getByText('ポットの勝者を選択')).toBeTruthy();
  });

});
