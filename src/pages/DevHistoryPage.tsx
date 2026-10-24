import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Card, HandData, SessionConfig } from '../types/poker';
import type { HandSummary } from '../api/hands';
import { generateHandText } from '../utils/formatHand';
import HistoryList from '../components/HistoryList';

/**
 * DEV 専用のモック履歴画面。
 * ログインや API 無しで、スマホ実機でも一覧・詳細の見た目を確認するためのもの。
 * App.tsx で import.meta.env.DEV のときだけルート登録する。
 */

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

const mockSession: SessionConfig = {
  smallBlind: 1,
  bigBlind: 2,
  ante: 0,
  straddle: 0,
  currency: '$',
  venueName: 'Dev Casino',
  date: '2026-10-24',
  players: [
    { id: 'p0', name: 'Hero', stack: 200, position: 0 },
    { id: 'p1', name: 'P1', stack: 200, position: 1 },
    { id: 'p2', name: 'P2', stack: 200, position: 2 },
    { id: 'p3', name: 'P3', stack: 200, position: 3 },
    { id: 'p4', name: 'P4', stack: 200, position: 4 },
    { id: 'p5', name: 'P5', stack: 200, position: 5 },
  ],
  heroId: 'p0',
  heroPosition: 'BTN',
  heroEffectiveStack: 200,
};

const mockHands: HandData[] = [
  {
    id: 'mock-1',
    handNumber: 3,
    dealerPosition: 0,
    title: 'リバーでバリュー',
    heroHoleCards: [c('A', 's'), c('K', 'h')],
    streets: {
      preflop: { actions: [{ playerId: 'p0', type: 'raise', amount: 6 }, { playerId: 'p1', type: 'call', amount: 6 }] },
      flop: { board: [c('Q', 'd'), c('J', 'c'), c('T', 's')], actions: [{ playerId: 'p0', type: 'bet', amount: 8 }, { playerId: 'p1', type: 'call', amount: 8 }] },
      turn: { board: [c('2', 'h')], actions: [{ playerId: 'p0', type: 'bet', amount: 20 }, { playerId: 'p1', type: 'call', amount: 20 }] },
      river: { board: [c('7', 'c')], actions: [{ playerId: 'p0', type: 'bet', amount: 50 }, { playerId: 'p1', type: 'call', amount: 50 }] },
    },
    pot: 168,
    winners: [{ playerId: 'p0', amount: 168 }],
    session: mockSession,
  },
  {
    id: 'mock-2',
    handNumber: 2,
    dealerPosition: 0,
    heroHoleCards: [c('9', 'd'), c('9', 'c')],
    streets: {
      preflop: { actions: [{ playerId: 'p0', type: 'call', amount: 2 }, { playerId: 'p2', type: 'check' }] },
      flop: { board: [c('9', 's'), c('5', 'h'), c('2', 'd')], actions: [{ playerId: 'p2', type: 'bet', amount: 4 }, { playerId: 'p0', type: 'raise', amount: 12 }] },
    },
    pot: 32,
    winners: [{ playerId: 'p0', amount: 32 }],
    session: mockSession,
  },
  {
    id: 'mock-3',
    handNumber: 1,
    dealerPosition: 0,
    title: 'プリフロップ3bet',
    heroHoleCards: [c('A', 'h'), c('A', 'd')],
    streets: {
      preflop: { actions: [{ playerId: 'p1', type: 'raise', amount: 6 }, { playerId: 'p0', type: 'raise', amount: 18 }, { playerId: 'p1', type: 'fold' }] },
    },
    pot: 15,
    winners: [{ playerId: 'p0', amount: 15 }],
    session: mockSession,
  },
];

/** HandData からボード全体（flop+turn+river）を取り出す */
function boardOf(h: HandData): Card[] {
  return [
    ...(h.streets.flop?.board ?? []),
    ...(h.streets.turn?.board ?? []),
    ...(h.streets.river?.board ?? []),
  ];
}

const summaries: HandSummary[] = mockHands.map((h) => ({
  id: h.id,
  title: h.title ?? '',
  venueName: h.session?.venueName ?? '',
  playedOn: h.session?.date ?? null,
  createdAt: '2026-10-24T00:00:00Z',
  updatedAt: '2026-10-24T00:00:00Z',
  heroHoleCards: h.heroHoleCards,
  board: boardOf(h),
}));

export default function DevHistoryPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<HandData | null>(null);
  const [copied, setCopied] = useState(false);

  if (selected) {
    const handText = generateHandText(selected, selected.session ?? mockSession);
    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(handText);
      } catch {
        const el = document.createElement('textarea');
        el.value = handText;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    return (
      <div className="history">
        <div className="history__header">
          <button type="button" className="btn-secondary" onClick={() => { setSelected(null); setCopied(false); }}>
            ← 一覧へ
          </button>
          <h2>ハンド詳細（モック）</h2>
        </div>
        <div className="output-header">
          <button
            type="button"
            className={`btn-copy ${copied ? 'btn-copy--done' : ''}`}
            onClick={handleCopy}
          >
            {copied ? '✓ コピー済み' : 'コピー'}
          </button>
        </div>
        <pre className="output-text">{handText}</pre>
      </div>
    );
  }

  return (
    <div className="history">
      <div className="history__header">
        <button type="button" className="btn-secondary" onClick={() => navigate('/setup')}>
          ← 戻る
        </button>
        <h2>過去ハンド一覧（モック）</h2>
      </div>
      <p className="hint">これは DEV 専用のモック表示です（ログイン・API なし）。</p>
      <HistoryList
        hands={summaries}
        onOpen={(id) => setSelected(mockHands.find((h) => h.id === id) ?? null)}
      />
    </div>
  );
}
