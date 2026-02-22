import { useEffect, useState } from 'react';
import { BLIND_PRESETS } from './constants';

interface Props {
  currency: string;
  blindPresetIdx: number;
  ante: number;
  onCurrencyChange: (val: string) => void;
  onBlindPresetChange: (idx: number) => void;
  onAnteChange: (val: number) => void;
}

export default function BlindSection({
  currency,
  blindPresetIdx,
  ante,
  onCurrencyChange,
  onBlindPresetChange,
  onAnteChange,
}: Props) {
  const [anteOn, setAnteOn] = useState(ante > 0);
  const [anteInput, setAnteInput] = useState(String(ante > 0 ? ante : ''));

  const currentPresets = BLIND_PRESETS[currency] ?? BLIND_PRESETS['$'];

  // BBプリセットが変わったとき、anteOnならデフォルト値をBBに更新
  useEffect(() => {
    if (anteOn) {
      const bb = currentPresets[blindPresetIdx]?.bb ?? 0;
      setAnteInput(String(bb));
      onAnteChange(bb);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blindPresetIdx, currency]);

  const handleAnteToggle = (on: boolean) => {
    setAnteOn(on);
    if (on) {
      const bb = currentPresets[blindPresetIdx]?.bb ?? 0;
      setAnteInput(String(bb));
      onAnteChange(bb);
    } else {
      setAnteInput('');
      onAnteChange(0);
    }
  };

  return (
    <section className="form-section">
      <h2>ブラインド設定</h2>

      <div className="form-row">
        <label>通貨</label>
        <select
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
          className="input-blind"
        >
          <option value="$">$ ドル</option>
          <option value="₱">₱ フィリピンペソ</option>
          <option value="₩">₩ 韓国ウォン</option>
          <option value="">なし</option>
        </select>
      </div>

      <div className="form-row">
        <label>SB / BB</label>
        <select
          value={blindPresetIdx}
          onChange={(e) => onBlindPresetChange(Number(e.target.value))}
          className="input-blind"
        >
          {currentPresets.map((p, i) => (
            <option key={i} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label>BBアンティ</label>
        <div className="ante-control">
          <button
            type="button"
            className={`ante-toggle ${anteOn ? 'ante-toggle--on' : ''}`}
            onClick={() => handleAnteToggle(!anteOn)}
          >
            {anteOn ? 'ON' : 'OFF'}
          </button>
          {anteOn && (
            <input
              type="number"
              min={0}
              step={0.01}
              value={anteInput}
              onChange={(e) => {
                const nextValue = e.target.value;
                setAnteInput(nextValue);
                const parsed = Number(nextValue);
                if (Number.isFinite(parsed) && parsed >= 0) {
                  onAnteChange(parsed);
                }
              }}
              onBlur={() => {
                if (anteInput === '') {
                  const bb = currentPresets[blindPresetIdx]?.bb ?? 0;
                  setAnteInput(String(bb));
                  onAnteChange(bb);
                }
              }}
              className="input-small"
            />
          )}
        </div>
      </div>
    </section>
  );
}
