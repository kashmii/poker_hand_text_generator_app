import type { Card } from '../../types/poker';
import CardPicker from '../CardPicker';
import { POSITION_LABELS_BY_COUNT } from './constants';

interface Props {
  playerCount: number;
  heroPosition: string;
  heroEffectiveStack: number;
  currency: string;
  holeCard1: Card | null;
  holeCard2: Card | null;
  onHeroPositionChange: (pos: string) => void;
  onHeroEffectiveStackChange: (val: number) => void;
  onHoleCard1Change: (card: Card | null) => void;
  onHoleCard2Change: (card: Card | null) => void;
}

export default function HeroSection({
  playerCount,
  heroPosition,
  heroEffectiveStack,
  currency,
  holeCard1,
  holeCard2,
  onHeroPositionChange,
  onHeroEffectiveStackChange,
  onHoleCard1Change,
  onHoleCard2Change,
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
        <div className="form-row">
          <label>ホールカード <span className="hint">（任意）</span></label>
          <div className="hole-cards">
            <CardPicker value={holeCard1} onChange={onHoleCard1Change} label="1枚目" />
            <CardPicker value={holeCard2} onChange={onHoleCard2Change} label="2枚目" />
          </div>
        </div>
      </section>
    </>
  );
}
