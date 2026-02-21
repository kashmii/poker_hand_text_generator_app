interface Props {
  heroEffectiveStack: number;
  currency: string;
  onHeroEffectiveStackChange: (val: number) => void;
}

export default function HeroSection({
  heroEffectiveStack,
  currency,
  onHeroEffectiveStackChange,
}: Props) {
  return (
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
  );
}
