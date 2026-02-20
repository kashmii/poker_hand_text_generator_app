import { useState } from 'react';
import type { SessionConfig } from '../types/poker';
import { createDefaultPlayers } from '../context/AppContext';
import { BLIND_PRESETS, POSITION_LABELS_BY_COUNT } from './setup/constants';
import BlindSection from './setup/BlindSection';
import PlayerSection from './setup/PlayerSection';
import HeroSection from './setup/HeroSection';

interface Props {
  onStart: (config: SessionConfig) => void;
}

export default function SessionSetup({ onStart }: Props) {
  // セッション情報
  const [venueName, setVenueName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  // ブラインド設定
  const [currency, setCurrency] = useState('$');
  const [blindPresetIdx, setBlindPresetIdx] = useState(0);
  const [ante, setAnte] = useState(0);
  const [straddleOn, setStraddleOn] = useState(false);

  const currentPresets = BLIND_PRESETS[currency] ?? BLIND_PRESETS['$'];
  const selectedPreset = currentPresets[blindPresetIdx] ?? currentPresets[0];
  const smallBlind = selectedPreset.sb;
  const bigBlind = selectedPreset.bb;
  const straddle = straddleOn ? bigBlind * 2 : 0;

  // プレイヤー設定
  const [playerCount, setPlayerCount] = useState(6);
  const [players, setPlayers] = useState(createDefaultPlayers(6));

  // ヒーロー情報
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [heroEffectiveStack, setHeroEffectiveStack] = useState(100);

  const handleCurrencyChange = (val: string) => {
    setCurrency(val);
    setBlindPresetIdx(0);
  };

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    setPlayers(createDefaultPlayers(count));
    const newLabels = POSITION_LABELS_BY_COUNT[count];
    if (!newLabels.includes(heroPosition)) setHeroPosition(newLabels[0]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const configPlayers = players.map((p, i) => ({ ...p, position: i }));
    const posLabels = POSITION_LABELS_BY_COUNT[playerCount];
    const heroIdx = posLabels.indexOf(heroPosition);
    const heroId = configPlayers[heroIdx]?.id ?? configPlayers[0].id;
    onStart({
      smallBlind,
      bigBlind,
      ante,
      straddle,
      currency,
      venueName,
      date,
      players: configPlayers,
      heroId,
      heroPosition,
      heroEffectiveStack,
    });
  };

  return (
    <div className="session-setup">
      <h1 className="app-title">🃏 Poker Hand Logger</h1>
      <form onSubmit={handleSubmit} className="setup-form">

        {/* セッション情報 */}
        <section className="form-section">
          <h2>セッション情報</h2>
          <div className="form-row">
            <label>店名 <span className="hint">（任意）</span></label>
            <input
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="例: Lucky Casino"
              className="input-venue"
            />
          </div>
          <div className="form-row">
            <label>日付</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-date"
            />
          </div>
        </section>

        <BlindSection
          currency={currency}
          blindPresetIdx={blindPresetIdx}
          ante={ante}
          straddleOn={straddleOn}
          bigBlind={bigBlind}
          onCurrencyChange={handleCurrencyChange}
          onBlindPresetChange={setBlindPresetIdx}
          onAnteChange={setAnte}
          onStraddleToggle={setStraddleOn}
        />

        <PlayerSection
          playerCount={playerCount}
          onPlayerCountChange={handlePlayerCountChange}
        />

        <HeroSection
          playerCount={playerCount}
          heroPosition={heroPosition}
          heroEffectiveStack={heroEffectiveStack}
          currency={currency}
          onHeroPositionChange={setHeroPosition}
          onHeroEffectiveStackChange={setHeroEffectiveStack}
        />

        <div className="setup-footer">
          <button type="submit" className="btn-primary btn-full">
            セッション開始 →
          </button>
        </div>
      </form>
    </div>
  );
}
