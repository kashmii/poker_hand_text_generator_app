import { useState } from 'react';
import type { SessionConfig, Player } from '../types/poker';
import { createDefaultPlayers } from '../context/AppContext';

interface Props {
  onStart: (config: SessionConfig) => void;
}

const POSITION_LABELS_BY_COUNT: Record<number, string[]> = {
  2: ['SB/BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP', 'HJ', 'CO'],
};

export default function SessionSetup({ onStart }: Props) {
  const [playerCount, setPlayerCount] = useState(6);
  const [smallBlind, setSmallBlind] = useState(1);
  const [bigBlind, setBigBlind] = useState(2);
  const [ante, setAnte] = useState(0);
  const [currency, setCurrency] = useState('$');
  const [players, setPlayers] = useState<Player[]>(createDefaultPlayers(6));
  const [heroIdx, setHeroIdx] = useState(0);

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    const newPlayers = createDefaultPlayers(count);
    // 既存名を引き継ぐ
    players.slice(0, count).forEach((p, i) => {
      newPlayers[i].name = p.name;
      newPlayers[i].stack = p.stack;
    });
    setPlayers(newPlayers);
    if (heroIdx >= count) setHeroIdx(0);
  };

  const handlePlayerChange = (idx: number, field: 'name' | 'stack', value: string) => {
    setPlayers((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        [field]: field === 'stack' ? Number(value) : value,
      };
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const configPlayers: Player[] = players.map((p, i) => ({
      ...p,
      position: i,
    }));
    onStart({
      smallBlind,
      bigBlind,
      ante,
      currency,
      players: configPlayers,
      heroId: configPlayers[heroIdx].id,
    });
  };

  const posLabels = POSITION_LABELS_BY_COUNT[playerCount];

  return (
    <div className="session-setup">
      <h1 className="app-title">🃏 Poker Hand Logger</h1>
      <form onSubmit={handleSubmit} className="setup-form">

        <section className="form-section">
          <h2>ブラインド設定</h2>
          <div className="form-row">
            <label>通貨記号</label>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              maxLength={3}
              className="input-small"
            />
          </div>
          <div className="form-row">
            <label>SB</label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={smallBlind}
              onChange={(e) => setSmallBlind(Number(e.target.value))}
              className="input-small"
            />
          </div>
          <div className="form-row">
            <label>BB</label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={bigBlind}
              onChange={(e) => setBigBlind(Number(e.target.value))}
              className="input-small"
            />
          </div>
          <div className="form-row">
            <label>アンティ <span className="hint">（0=なし）</span></label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={ante}
              onChange={(e) => setAnte(Number(e.target.value))}
              className="input-small"
            />
          </div>
        </section>

        <section className="form-section">
          <h2>プレイヤー設定</h2>
          <div className="form-row">
            <label>人数</label>
            <select
              value={playerCount}
              onChange={(e) => handlePlayerCountChange(Number(e.target.value))}
              className="input-small"
            >
              {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n}>{n}人</option>
              ))}
            </select>
          </div>

          <div className="players-table">
            <div className="players-header">
              <span>ポジション</span>
              <span>名前</span>
              <span>スタック</span>
              <span>ヒーロー</span>
            </div>
            {players.map((p, i) => (
              <div key={p.id} className="player-row">
                <span className="position-label">{posLabels[i]}</span>
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) => handlePlayerChange(i, 'name', e.target.value)}
                  className="input-name"
                  placeholder={`Player ${i + 1}`}
                />
                <input
                  type="number"
                  value={p.stack}
                  min={1}
                  onChange={(e) => handlePlayerChange(i, 'stack', e.target.value)}
                  className="input-stack"
                />
                <input
                  type="radio"
                  name="hero"
                  checked={heroIdx === i}
                  onChange={() => setHeroIdx(i)}
                />
              </div>
            ))}
          </div>
        </section>

        <button type="submit" className="btn-primary btn-full">
          セッション開始
        </button>
      </form>
    </div>
  );
}
