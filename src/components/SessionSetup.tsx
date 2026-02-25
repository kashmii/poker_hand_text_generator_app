import { useState } from 'react';
import type { SessionConfig } from '../types/poker';
import { createDefaultPlayers } from '../context/AppContext';
import { BLIND_PRESETS } from './setup/constants';
import BlindSection from './setup/BlindSection';
import PlayerSection from './setup/PlayerSection';

interface Props {
  onStart: (config: SessionConfig) => void;
  onUpdate?: (config: SessionConfig) => void;
  onViewResult?: () => void;
  initialSession?: SessionConfig;
}

export default function SessionSetup({ onStart, onUpdate, onViewResult, initialSession }: Props) {
  // セッション情報
  const [venueName, setVenueName] = useState(initialSession?.venueName ?? '');
  const [date, setDate] = useState(initialSession?.date ?? new Date().toISOString().slice(0, 10));

  // ブラインド設定
  const [currency, setCurrency] = useState(initialSession?.currency ?? '₱');
  const [blindPresetIdx, setBlindPresetIdx] = useState(() => {
    if (!initialSession) return 0;
    const presets = BLIND_PRESETS[initialSession.currency] ?? BLIND_PRESETS['$'];
    const idx = presets.findIndex(
      (p) => p.sb === initialSession.smallBlind && p.bb === initialSession.bigBlind
    );
    return idx >= 0 ? idx : 0;
  });
  const [ante, setAnte] = useState(initialSession?.ante ?? 0);

  // プレイヤー設定
  const [playerCount, setPlayerCount] = useState(initialSession?.players.length ?? 9);
  const [players, setPlayers] = useState(initialSession?.players ?? createDefaultPlayers(9));

  const currentPresets = BLIND_PRESETS[currency] ?? BLIND_PRESETS['$'];
  const selectedPreset = currentPresets[blindPresetIdx] ?? currentPresets[0];
  const smallBlind = selectedPreset.sb;
  const bigBlind = selectedPreset.bb;

  const handleCurrencyChange = (val: string) => {
    setCurrency(val);
    setBlindPresetIdx(0);
  };

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    setPlayers(createDefaultPlayers(count));
  };

  const buildConfig = (): SessionConfig => {
    const configPlayers = players.map((p, i) => ({ ...p, position: i }));
    return {
      smallBlind,
      bigBlind,
      ante,
      straddle: 0,
      currency,
      venueName,
      date,
      players: configPlayers,
      heroId: configPlayers[0]?.id ?? '',
      heroPosition: '',
      heroEffectiveStack: 100,
    };
  };

  // 新規セッション開始（hands リセット）
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStart(buildConfig());
  };

  // 設定を更新（hands 保持）
  const handleUpdate = () => {
    onUpdate!(buildConfig());
  };

  // 新しいセッションを開始（確認あり）
  const handleNewSession = () => {
    if (!confirm('現在のハンド履歴はすべて削除されます。新しいセッションを開始しますか？')) return;
    onStart(buildConfig());
  };

  return (
    <div className="session-setup">
      <h1 className="app-title">🃏 Poker Hand Logger</h1>
      {onViewResult && (
        <div className="setup-history-bar">
          <button type="button" className="btn-view-result" onClick={onViewResult}>
            📋 ハンド履歴を見る
          </button>
        </div>
      )}
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
          onCurrencyChange={handleCurrencyChange}
          onBlindPresetChange={setBlindPresetIdx}
          onAnteChange={setAnte}
        />

        <PlayerSection
          playerCount={playerCount}
          onPlayerCountChange={handlePlayerCountChange}
        />

        <div className="setup-footer">
          {onUpdate ? (
            <div className="setup-footer-btns">
              <button type="button" className="btn-primary btn-full" onClick={handleUpdate}>
                設定を更新
              </button>
              <button type="button" className="btn-secondary btn-full" onClick={handleNewSession}>
                新しいセッションを開始
              </button>
            </div>
          ) : (
            <button type="submit" className="btn-primary btn-full">
              セッション開始 →
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
