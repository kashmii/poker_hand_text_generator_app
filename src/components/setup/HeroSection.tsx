import { POSITION_LABELS_BY_COUNT } from './constants';

interface Props {
  playerCount: number;
  heroPosition: string;
  heroEffectiveStack: number;
  currency: string;
  onHeroPositionChange: (pos: string) => void;
  onHeroEffectiveStackChange: (val: number) => void;
}

export default function HeroSection({
  playerCount,
  heroPosition,
  heroEffectiveStack,
  currency,
  onHeroPositionChange,
  onHeroEffectiveStackChange,
}: Props) {
  const posLabels = POSITION_LABELS_BY_COUNT[playerCount];

  return (
    <>
      {/* ===== エフェクティブスタック ===== */}
      <section className="form-section">
        <h2>エフェクティブスタック</h2>
        <p className="section-desc">
          そのハンドで最も多くチップを使ったプレイヤーのチップ量（＝対決の上限額）
        </p>
        <div className="form-row">
          <label>金額</label>
          <div className="effective-stack-input">
            <span className="currency-prefix">{currency}</span>
            <input
              type="number"
              min={1}
              value={heroEffectiveStack}
              onChange={(e) => onHeroEffectiveStackChange(Number(e.target.value))}
              className="input-stack-value"
            />
          </div>
        </div>
      </section>

      {/* ===== ヒーロー情報 ===== */}
      <section className="form-section">
        <h2>ヒーロー情報</h2>
        <div className="form-row">
          <label>ポジション</label>
          <select
            value={heroPosition}
            onChange={(e) => onHeroPositionChange(e.target.value)}
            className="input-small"
          >
            {posLabels.map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
        </div>
      </section>
    </>
  );
}
