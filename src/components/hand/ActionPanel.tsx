import { useState } from 'react';
import type { ActionType } from '../../types/poker';
import type { Player } from '../../types/poker';

interface Props {
  actorPlayer: Player | null;
  actorPositionLabel: string;
  toCall: number;
  currentBet: number;
  pot: number;
  currency: string;
  canGoBack: boolean;
  canStraddle: boolean;
  straddleAmount: number;
  onAction: (type: ActionType, amount?: number) => void;
  onBack: () => void;
}

type InputMode = 'none' | 'numpad';

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'];

export default function ActionPanel({
  actorPlayer,
  actorPositionLabel,
  toCall,
  currentBet,
  pot,
  currency,
  canGoBack,
  canStraddle,
  straddleAmount,
  onAction,
  onBack,
}: Props) {
  const [inputMode, setInputMode] = useState<InputMode>('none');
  const [pendingType, setPendingType] = useState<ActionType | null>(null);
  const [amountStr, setAmountStr] = useState('');

  const canCheck = toCall === 0;
  const canCall = toCall > 0;

  const handleNumpad = (key: string) => {
    if (key === '⌫') {
      setAmountStr((s) => s.slice(0, -1));
    } else {
      setAmountStr((s) => (s === '0' ? key : s + key));
    }
  };

  const handleConfirmAmount = () => {
    const amount = Number(amountStr);
    if (!pendingType || isNaN(amount) || amount <= 0) return;
    onAction(pendingType, amount);
    setInputMode('none');
    setPendingType(null);
    setAmountStr('');
  };

  const handleCancelAmount = () => {
    setInputMode('none');
    setPendingType(null);
    setAmountStr('');
  };

  const startAmountInput = (type: ActionType) => {
    setPendingType(type);
    setAmountStr('');
    setInputMode('numpad');
  };

  // ポットの割合プリセット
  const potPresets = [
    { label: '1/3', value: Math.round(pot / 3) },
    { label: '1/2', value: Math.round(pot / 2) },
    { label: '2/3', value: Math.round((pot * 2) / 3) },
    { label: 'POT', value: pot },
  ];

  if (!actorPlayer) {
    return (
      <div className="action-panel action-panel--empty">
        <p>アクション完了</p>
      </div>
    );
  }

  return (
    <div className="action-panel">
      {/* 現在のアクター表示 */}
      <div className="action-panel__actor">
        <span className="actor-position">{actorPositionLabel}</span>
        <span className="actor-label">のアクション</span>
      </div>

      {inputMode === 'numpad' ? (
        /* ===== テンキー入力モード ===== */
        <div className="numpad-wrap">
          {/* 入力表示 + POTボタン横並び */}
          <div className="numpad-top-row">
            <div className="numpad-display">
              <span className="numpad-currency">{currency}</span>
              <span className="numpad-value">{amountStr || '0'}</span>
            </div>
            <button
              type="button"
              className="numpad-preset-btn numpad-pot-btn"
              onClick={() => setAmountStr(String(potPresets.find(p => p.label === 'POT')?.value ?? pot))}
            >
              POT
            </button>
          </div>

          {/* テンキー */}
          <div className="numpad-grid">
            {NUMPAD_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={`numpad-key ${key === '⌫' ? 'numpad-key--back' : ''}`}
                onClick={() => handleNumpad(key)}
              >
                {key}
              </button>
            ))}
          </div>

          {/* キャンセル・ALL-IN・確定 */}
          <div className="numpad-actions">
            <button type="button" className="btn-secondary" onClick={handleCancelAmount}>
              キャンセル
            </button>
            <button
              type="button"
              className="action-btn action-btn--allin numpad-allin"
              disabled={!amountStr || Number(amountStr) <= 0}
              onClick={() => {
                const inputAmount = Number(amountStr);
                if (inputAmount <= 0) return;
                onAction('allin', inputAmount);
                setInputMode('none');
                setPendingType(null);
                setAmountStr('');
              }}
            >
              ALL-IN
            </button>
            <button
              type="button"
              className="btn-primary numpad-confirm"
              onClick={handleConfirmAmount}
              disabled={!amountStr || Number(amountStr) <= 0}
            >
              確定
            </button>
          </div>
        </div>
      ) : (
        /* ===== アクションボタン群 ===== */
        <div className="action-buttons">
          <button
            type="button"
            className="action-btn action-btn--fold"
            onClick={() => onAction('fold')}
          >
            FOLD
          </button>

          {canCheck && (
            <button
              type="button"
              className="action-btn action-btn--check"
              onClick={() => onAction('check')}
            >
              CHECK
            </button>
          )}

          {canCall && (
            <button
              type="button"
              className="action-btn action-btn--call"
              onClick={() => onAction('call', toCall)}
            >
              CALL
              <span className="action-btn__amount">{currency}{toCall.toLocaleString()}</span>
            </button>
          )}

          <button
            type="button"
            className={`action-btn ${currentBet > 0 ? 'action-btn--raise' : 'action-btn--bet'}`}
            onClick={() => startAmountInput(currentBet > 0 ? 'raise' : 'bet')}
          >
            {currentBet > 0 ? 'RAISE' : 'BET'}
          </button>

          {canStraddle && (
            <button
              type="button"
              className="action-btn action-btn--straddle"
              onClick={() => onAction('straddle')}
            >
              STRADDLE
              <span className="action-btn__amount">{currency}{straddleAmount.toLocaleString()}</span>
            </button>
          )}
        </div>
      )}

      {/* 戻るボタン */}
      {canGoBack && inputMode === 'none' && (
        <button type="button" className="action-back-btn" onClick={onBack}>
          ← 1手戻る
        </button>
      )}
    </div>
  );
}
