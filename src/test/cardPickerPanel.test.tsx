import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CardPickerPanel from '../components/hand/CardPickerPanel';
import { EMPTY_PART, type PartialCard } from '../utils/cardPick';

function Harness({
  initial, usedSet = new Set<string>(), removable = false,
}: {
  initial: PartialCard[];
  usedSet?: Set<string>;
  removable?: boolean;
}) {
  const [slots, setSlots] = useState<PartialCard[]>(initial);
  return (
    <CardPickerPanel
      slots={slots}
      usedSet={usedSet}
      onSlotChange={(idx, slot) => setSlots((prev) => prev.map((p, i) => (i === idx ? slot : p)))}
      onClear={() => setSlots(initial.map(() => EMPTY_PART))}
      onRemove={removable ? (idx) => setSlots((prev) => prev.map((p, i) => (i === idx ? EMPTY_PART : p))) : undefined}
    />
  );
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const slotTexts = (container: HTMLElement) =>
  [...container.querySelectorAll('.board-slot')].map((el) => el.querySelector('.board-slot__card, .board-slot__empty')!.textContent);

describe('CardPickerPanel', () => {
  it.each([
    ['数字1、スート1、数字2、スート2', ['A', '♥', 'K', '♠']],
    ['数字1、数字2、スート1、スート2', ['A', 'K', '♥', '♠']],
    ['スート1、スート2、数字1、数字2', ['♥', '♠', 'A', 'K']],
    ['スート1、数字1、スート2、数字2', ['♥', 'A', '♠', 'K']],
  ])('%s の順で A♥ K♠ になる', (_, order) => {
    const { container } = render(<Harness initial={[EMPTY_PART, EMPTY_PART]} />);
    order.forEach((name) => fireEvent.click(button(name)));
    expect(slotTexts(container)).toEqual(['A♥', 'K♠']);
  });

  it('入力途中は未入力側を ? で表示する', () => {
    const { container } = render(<Harness initial={[EMPTY_PART, EMPTY_PART]} />);
    fireEvent.click(button('A'));
    fireEvent.click(button('♠'));
    fireEvent.click(button('♥'));
    expect(slotTexts(container)).toEqual(['A♠', '?♥']);
  });

  it('クリアはランク「2」の直後にあり、全枠を空にする', () => {
    const { container } = render(<Harness initial={[EMPTY_PART, EMPTY_PART]} />);
    expect(button('2').parentElement!.lastElementChild).toBe(button('クリア'));
    expect(button('クリア').disabled).toBe(true);
    fireEvent.click(button('A'));
    fireEvent.click(button('♥'));
    fireEvent.click(button('K'));
    fireEvent.click(button('クリア'));
    expect(slotTexts(container)).toEqual(['1', '2']);
  });

  it('onRemove がなければ × を出さない', () => {
    render(<Harness initial={[{ rank: 'A', suit: 'h' }, EMPTY_PART]} />);
    expect(screen.queryByRole('button', { name: '1枚目を消す' })).toBeNull();
  });

  it('× で1枚消すと、次の入力はその空いた枠に入る', () => {
    const { container } = render(
      <Harness
        removable
        initial={[{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'd' }, { rank: '7', suit: null }]}
      />,
    );
    fireEvent.click(button('1枚目を消す'));
    fireEvent.click(button('Q'));
    fireEvent.click(button('♣'));
    expect(slotTexts(container)).toEqual(['Q♣', 'K♦', '7?']);
  });
});
