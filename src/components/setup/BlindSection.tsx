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
  const currentPresets = BLIND_PRESETS[currency] ?? BLIND_PRESETS['$'];

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
            <option key={i} value={i}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label>アンティ <span className="hint">（0=なし）</span></label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={ante}
          onChange={(e) => onAnteChange(Number(e.target.value))}
          className="input-small"
        />
      </div>

    </section>
  );
}
