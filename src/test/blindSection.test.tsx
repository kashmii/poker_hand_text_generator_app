import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BlindSection from '../components/setup/BlindSection';
import { BLIND_PRESETS, getDefaultPresetIdx, isAnteOnByDefault } from '../components/setup/constants';

describe('getDefaultPresetIdx / isAnteOnByDefault', () => {
  it('通貨なしは 2/5 を初期選択し、アンティをオンにする', () => {
    const preset = BLIND_PRESETS[''][getDefaultPresetIdx('')];
    expect(preset.sb).toBe(2);
    expect(preset.bb).toBe(5);
    expect(isAnteOnByDefault('')).toBe(true);
  });

  it('通貨ありは先頭のプリセットで、アンティは自動でオンにしない', () => {
    expect(getDefaultPresetIdx('$')).toBe(0);
    expect(isAnteOnByDefault('$')).toBe(false);
  });
});

// SessionSetup と同じく、通貨変更時にプリセットを初期値へ戻す親を用意する
function Harness({ onAnte }: { onAnte: (v: number) => void }) {
  const [currency, setCurrency] = useState('₱');
  const [idx, setIdx] = useState(0);
  return (
    <BlindSection
      currency={currency}
      blindPresetIdx={idx}
      ante={0}
      onCurrencyChange={(val) => {
        setCurrency(val);
        setIdx(getDefaultPresetIdx(val));
      }}
      onBlindPresetChange={setIdx}
      onAnteChange={onAnte}
    />
  );
}

describe('BlindSection', () => {
  it('「なし（アミューズメントなど）」を選ぶと 2/5・BBアンティ5 になる', () => {
    let ante = 0;
    render(<Harness onAnte={(v) => { ante = v; }} />);

    const [currencySelect, blindSelect] = screen.getAllByRole('combobox');
    fireEvent.change(currencySelect, { target: { value: '' } });

    expect(screen.getByRole('option', { name: 'なし（アミューズメントなど）' })).toBeTruthy();
    expect((blindSelect as HTMLSelectElement).selectedOptions[0].textContent).toBe('2 / 5');
    expect(screen.getByRole('button', { name: 'ON' })).toBeTruthy();
    expect(ante).toBe(5);
  });
});
