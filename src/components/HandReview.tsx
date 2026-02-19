import { useState } from 'react';
import type { HandData, SessionConfig, AppSettings } from '../types/poker';
import { generateHandText } from '../utils/formatHand';

interface Props {
  hands: HandData[];
  session: SessionConfig;
  settings: AppSettings;
  onNewHand: () => void;
  onEditSettings: () => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onDeleteHand: (id: string) => void;
}

export default function HandReview({
  hands,
  session,
  settings,
  onNewHand,
  onEditSettings,
  onUpdateSettings,
  onDeleteHand,
}: Props) {
  const [selectedHandId, setSelectedHandId] = useState<string | null>(
    hands.length > 0 ? hands[hands.length - 1].id : null
  );
  const [copied, setCopied] = useState(false);
  const [allCopied, setAllCopied] = useState(false);

  const selectedHand = hands.find((h) => h.id === selectedHandId) ?? null;

  const handText = selectedHand
    ? generateHandText(selectedHand, buildSessionWithCards(selectedHand, session), settings.outputLanguage)
    : '';

  const allHandsText = hands
    .map((h) => generateHandText(h, buildSessionWithCards(h, session), settings.outputLanguage))
    .join('\n---\n\n');

  const handleCopy = async (text: string, setter: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch {
      // フォールバック
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setter(true);
      setTimeout(() => setter(false), 2000);
    }
  };

  return (
    <div className="hand-review">
      <div className="hand-review__header">
        <h2>ハンド履歴</h2>
        <div className="header-actions">
          <button type="button" className="btn-secondary" onClick={onEditSettings}>
            設定
          </button>
          <button type="button" className="btn-primary" onClick={onNewHand}>
            + 新しいハンド
          </button>
        </div>
      </div>

      {/* 設定バー */}
      <div className="settings-bar">
        <span className="settings-label">出力言語：</span>
        <button
          type="button"
          className={`lang-btn ${settings.outputLanguage === 'en' ? 'lang-btn--active' : ''}`}
          onClick={() => onUpdateSettings({ outputLanguage: 'en' })}
        >
          English
        </button>
        <button
          type="button"
          className={`lang-btn ${settings.outputLanguage === 'ja' ? 'lang-btn--active' : ''}`}
          onClick={() => onUpdateSettings({ outputLanguage: 'ja' })}
        >
          日本語
        </button>
      </div>

      {hands.length === 0 ? (
        <div className="empty-state">
          <p>まだハンドが記録されていません。</p>
          <button type="button" className="btn-primary" onClick={onNewHand}>
            最初のハンドを入力する
          </button>
        </div>
      ) : (
        <>
          {/* ハンド一覧 */}
          <div className="hand-list">
            {hands.map((h) => (
              <div
                key={h.id}
                className={`hand-list-item ${selectedHandId === h.id ? 'hand-list-item--active' : ''}`}
                onClick={() => setSelectedHandId(h.id)}
              >
                <span className="hand-num">Hand #{h.handNumber}</span>
                <span className="hand-streets">
                  {h.streets.flop ? (h.streets.turn ? (h.streets.river ? 'River' : 'Turn') : 'Flop') : 'Preflop'}
                </span>
                <button
                  type="button"
                  className="btn-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Hand #${h.handNumber} を削除しますか？`)) {
                      onDeleteHand(h.id);
                      if (selectedHandId === h.id) setSelectedHandId(null);
                    }
                  }}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>

          {/* 選択ハンドのテキスト出力 */}
          {selectedHand && (
            <div className="output-section">
              <div className="output-header">
                <span>Hand #{selectedHand.handNumber}</span>
                <button
                  type="button"
                  className={`btn-copy ${copied ? 'btn-copy--done' : ''}`}
                  onClick={() => handleCopy(handText, setCopied)}
                >
                  {copied ? '✓ コピー済み' : 'コピー'}
                </button>
              </div>
              <pre className="output-text">{handText}</pre>
            </div>
          )}

          {/* 全ハンドコピー */}
          {hands.length > 1 && (
            <div className="all-copy-section">
              <button
                type="button"
                className={`btn-secondary btn-full ${allCopied ? 'btn-copy--done' : ''}`}
                onClick={() => handleCopy(allHandsText, setAllCopied)}
              >
                {allCopied ? '✓ 全ハンドをコピー済み' : `全${hands.length}ハンドをまとめてコピー`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ハンドデータからセッションのヒーローカードを更新する補助関数
function buildSessionWithCards(hand: HandData, session: SessionConfig): SessionConfig {
  const anyHand = hand as HandData & { _heroCards?: (import('../types/poker').Card | null)[] };
  if (!anyHand._heroCards) return session;
  const [c1, c2] = anyHand._heroCards;
  if (!c1 || !c2) return session;
  return {
    ...session,
    players: session.players.map((p) => {
      if (p.id === session.heroId) {
        return { ...p, holeCards: [c1, c2] };
      }
      return p;
    }),
  };
}
