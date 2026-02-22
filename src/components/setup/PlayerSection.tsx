interface Props {
  playerCount: number;
  onPlayerCountChange: (count: number) => void;
}

export default function PlayerSection({ playerCount, onPlayerCountChange }: Props) {
  return (
    <section className="form-section">
      <h2>プレイヤー設定</h2>

      <div className="form-row">
        <label>人数</label>
        <select
          value={playerCount}
          onChange={(e) => onPlayerCountChange(Number(e.target.value))}
          className="input-small"
        >
          {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <option key={n} value={n}>{n}人</option>
          ))}
        </select>
      </div>
    </section>
  );
}
