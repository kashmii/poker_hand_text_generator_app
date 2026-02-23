import { useState } from 'react';
import type { HandData, SessionConfig } from '../types/poker';
import { generateHandText } from '../utils/formatHand';

interface Props {
  hands: HandData[];
  session: SessionConfig;
  onNewHand: () => void;
  onEditSettings: () => void;
  onDeleteHand: (id: string) => void;
  onUpdateHand: (hand: HandData) => void;
}

export default function HandReview({
  hands,
  session,
  onNewHand,
  onEditSettings,
  onDeleteHand,
  onUpdateHand,
}: Props) {
  const [openHandId, setOpenHandId] = useState<string | null>(
    hands.length > 0 ? hands[hands.length - 1].id : null
  );
  const [copied, setCopied] = useState(false);
  const [allCopied, setAllCopied] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');

  const allHandsText = hands
    .map((h) => generateHandText(h, buildSessionWithCards(h, session)))
    .join('\n---\n\n');

  const handleCopy = async (text: string, setter: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch {
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

  const toggleOpen = (id: string) => {
    setOpenHandId((prev) => (prev === id ? null : id));
    setCopied(false);
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

      {hands.length === 0 ? (
        <div className="empty-state">
          <p>まだハンドが記録されていません。</p>
          <button type="button" className="btn-primary" onClick={onNewHand}>
            最初のハンドを入力する
          </button>
        </div>
      ) : (
        <>
          <div className="hand-accordion">
            {hands.map((h) => {
              const isOpen = openHandId === h.id;
              const streetLabel = h.streets.flop
                ? h.streets.turn
                  ? h.streets.river ? 'River' : 'Turn'
                  : 'Flop'
                : 'Preflop';
              const handText = isOpen
                ? generateHandText(h, buildSessionWithCards(h, session))
                : '';

              return (
                <div
                  key={h.id}
                  className={`accordion-item ${isOpen ? 'accordion-item--open' : ''}`}
                >
                  {/* ヘッダー行（クリックで開閉） */}
                  <div className="accordion-header" onClick={() => toggleOpen(h.id)}>
                    <div className="accordion-header__left">
                      <span className="hand-num">#{h.handNumber}</span>
                      <span className="hand-streets">{streetLabel}</span>
                    </div>

                    {/* タイトル（クリックはアコーディオン開閉、編集は✎ボタンから） */}
                    <div className="accordion-header__title">
                      {editingTitleId === h.id ? (
                        <div onClick={(e) => e.stopPropagation()} style={{ flex: 1, minWidth: 0 }}>
                          <input
                            type="text"
                            className="hand-title-input"
                            value={editingTitleValue}
                            maxLength={20}
                            autoFocus
                            onChange={(e) => setEditingTitleValue(e.target.value)}
                            onBlur={() => {
                              onUpdateHand({ ...h, title: editingTitleValue.trim() || undefined });
                              setEditingTitleId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                onUpdateHand({ ...h, title: editingTitleValue.trim() || undefined });
                                setEditingTitleId(null);
                              } else if (e.key === 'Escape') {
                                setEditingTitleId(null);
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <>
                          <span className="hand-title">
                            {h.title || <span className="hand-title--placeholder">タイトルを追加</span>}
                          </span>
                          <button
                            type="button"
                            className="btn-title-edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTitleId(h.id);
                              setEditingTitleValue(h.title ?? '');
                            }}
                            title="タイトルを編集"
                          >
                            ✎
                          </button>
                        </>
                      )}
                    </div>

                    {/* 削除ボタン */}
                    <div className="accordion-header__actions">
                      <button
                        type="button"
                        className="btn-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Hand #${h.handNumber} を削除しますか？`)) {
                            onDeleteHand(h.id);
                            if (openHandId === h.id) setOpenHandId(null);
                          }
                        }}
                      >
                        🗑
                      </button>
                    </div>

                    <span className="accordion-chevron" aria-hidden="true">
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </div>

                  {/* 展開コンテンツ */}
                  {isOpen && (
                    <div className="accordion-content">
                      <div className="output-header">
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
                </div>
              );
            })}
          </div>

          {/* 全ハンドまとめてコピー */}
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
