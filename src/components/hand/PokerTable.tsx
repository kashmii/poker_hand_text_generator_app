import type { Player } from '../../types/poker';
import type { HandFlowState } from './types';
import { POSITION_LABELS_BY_COUNT } from '../setup/constants';

interface Props {
  players: Player[];
  state: HandFlowState;
  actorId: string | null;
  heroId: string;
}

const SUIT_SYMBOLS: Record<string, string> = {
  h: '♥', d: '♦', c: '♣', s: '♠',
};
const SUIT_COLORS: Record<string, string> = {
  h: '#e53e3e', d: '#e53e3e', c: 'var(--color-text)', s: 'var(--color-text)',
};

/**
 * プレイヤーをテーブル周囲に配置する座標（中心0,0・楕円上）
 * heroIndex 番目のプレイヤーが常に真下（6時方向）に来るようオフセットする
 */
function getPlayerPositions(
  count: number,
  heroIndex: number,
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    // heroIndex が真下（π/2）に来るように各プレイヤーの角度を計算
    // 時計回りに均等配置
    const offset = (i - heroIndex) / count;
    const angle = 2 * Math.PI * offset + Math.PI / 2; // π/2 = 真下
    positions.push({
      x: Math.cos(angle) * 0.82,
      y: Math.sin(angle) * 0.68,
    });
  }
  return positions;
}

function cardLabel(card: { rank: string; suit: string } | null | undefined): string {
  if (!card) return '?';
  return `${card.rank}${SUIT_SYMBOLS[card.suit] ?? ''}`;
}

export default function PokerTable({ players, state, actorId, heroId }: Props) {
  const posLabels = POSITION_LABELS_BY_COUNT[players.length] ?? [];

  // heroのインデックスを特定（見つからなければ0）
  const heroIndex = players.findIndex((p) => p.id === heroId);
  const positions = getPlayerPositions(players.length, heroIndex >= 0 ? heroIndex : 0);

  // テーブル中央のボードカード（フロップ以降）
  const { currentStreet, boards, pot, holeCards } = state;
  const boardCards: ({ rank: string; suit: string } | null)[] = [];
  if (currentStreet !== 'preflop') {
    boardCards.push(...boards.flop);
  }
  if (currentStreet === 'turn' || currentStreet === 'river') {
    boardCards.push(...boards.turn);
  }
  if (currentStreet === 'river') {
    boardCards.push(...boards.river);
  }

  // 現在ストリートのアクションのみ
  const currentActions: Record<string, string> = {};
  state.streets[currentStreet].forEach((a) => {
    const label =
      a.type === 'fold' ? 'FOLD' :
      a.type === 'check' ? 'CHECK' :
      a.type === 'call' ? 'CALL' :
      a.type === 'bet' ? `BET` :
      a.type === 'raise' ? 'RAISE' :
      a.type === 'allin' ? 'ALL-IN' :
      a.type === 'straddle' ? 'STRADDLE' : '';
    currentActions[a.playerId] = label;
  });

  // 現在ストリートのcontributions（テーブルに投資済みの額）
  // プリフロップはSB/BB/straddleの強制投資も含まれる
  const contributions = state.contributions;

  const streetLabel: Record<string, string> = {
    preflop: 'PREFLOP', flop: 'FLOP', turn: 'TURN', river: 'RIVER',
  };

  // ホールカードが確定しているか
  const hasHoleCards = holeCards !== null;

  // ヒーローノードが真下に来るので、ホールカードはノードの下に表示
  // 真下のノードは y ≈ +0.68 付近
  // ホールカードはノードの外（下側）に表示するため y オフセットを使う

  return (
    <div className="poker-table-wrap">
      <svg
        viewBox="-1.1 -1.05 2.2 2.2"
        className="poker-table-svg"
        aria-label="poker table"
      >
        {/* テーブル本体 */}
        <ellipse cx="0" cy="0" rx="0.95" ry="0.78" fill="#1a6b3a" stroke="#0f4a28" strokeWidth="0.04" />
        {/* テーブル縁 */}
        <ellipse cx="0" cy="0" rx="0.95" ry="0.78" fill="none" stroke="#2d8a50" strokeWidth="0.025" />

        {/* ポット表示 */}
        <text x="0" y="-0.12" textAnchor="middle" fontSize="0.1" fill="#fff" fontWeight="bold">
          POT
        </text>
        <text x="0" y="0.04" textAnchor="middle" fontSize="0.13" fill="#ffd700" fontWeight="bold">
          {pot.toLocaleString()}
        </text>

        {/* ストリートラベル */}
        <text x="0" y="0.18" textAnchor="middle" fontSize="0.08" fill="#86efac">
          {streetLabel[currentStreet]}
        </text>

        {/* ボードカード（フロップ以降） */}
        {boardCards.length > 0 && (
          <g transform="translate(0, 0.38)">
            {boardCards.map((card, i) => {
              const totalW = boardCards.length * 0.22;
              const x = -totalW / 2 + i * 0.22 + 0.05;
              const color = card ? SUIT_COLORS[card.suit] : '#666';
              return (
                <g key={i} transform={`translate(${x}, -0.11)`}>
                  <rect x="-0.04" y="-0.09" width="0.18" height="0.22"
                    rx="0.02" fill="#fff" stroke="#ccc" strokeWidth="0.01" />
                  <text x="0.05" y="0.085" textAnchor="middle"
                    fontSize="0.13" fill={color} fontWeight="bold">
                    {card ? cardLabel(card) : '?'}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* プレイヤー */}
        {players.map((player, i) => {
          const pos = positions[i];
          const posLabel = posLabels[i] ?? '';
          const isFolded = state.foldedIds.has(player.id);
          const isAllIn = state.allInIds.has(player.id);
          const isActor = player.id === actorId;
          const isHero = player.id === heroId;
          const actionText = currentActions[player.id] ?? '';

          const contrib = contributions[player.id] ?? 0;
          const showContrib = contrib > 0 && !isFolded;

          const bgColor = isFolded ? '#374151' : isAllIn ? '#4a1a3a' : isActor ? '#1d4ed8' : '#1e293b';
          const borderColor = isActor ? '#60a5fa' : isAllIn ? '#f0abfc' : isHero ? '#a78bfa' : '#475569';

          return (
            <g key={player.id}>
              <g transform={`translate(${pos.x}, ${pos.y})`}>
                {/* アクター時のパルスリング */}
                {isActor && (
                  <circle r="0.16" fill="none" stroke="#60a5fa" strokeWidth="0.015"
                    opacity="0.5" className="actor-pulse" />
                )}
                {/* プレイヤーノード */}
                <circle r="0.13" fill={bgColor} stroke={borderColor} strokeWidth="0.015" />

                {/* ベット額（ノードの上、ポジションラベルの上） */}
                {showContrib && (
                  <text x="0" y="-0.175" textAnchor="middle"
                    fontSize="0.075" fill="#f87171" fontWeight="bold">
                    {contrib.toLocaleString()}
                  </text>
                )}

                {/* ポジションラベル */}
                <text x="0" y="-0.04" textAnchor="middle"
                  fontSize="0.07" fill={isHero ? '#c4b5fd' : '#94a3b8'} fontWeight="bold">
                  {posLabel}
                </text>

                {/* アクション表示 */}
                <text x="0" y="0.06" textAnchor="middle"
                  fontSize="0.065"
                  fill={isFolded ? '#6b7280' : isAllIn ? '#f0abfc' : '#fbbf24'}
                  fontWeight="bold">
                  {isFolded ? 'FOLD' : isAllIn ? 'ALL-IN' : actionText}
                </text>

                {/* ヒーロー: ホールカード表示（ノードの下） */}
                {isHero && hasHoleCards && !isFolded && (
                  <g transform="translate(0, 0.17)">
                    {holeCards!.map((card, ci) => {
                      const cx = ci === 0 ? -0.11 : 0.11;
                      const color = SUIT_COLORS[card.suit] ?? '#333';
                      return (
                        <g key={ci} transform={`translate(${cx}, 0)`}>
                          <rect x="-0.085" y="-0.01" width="0.17" height="0.21"
                            rx="0.02" fill="#fff" stroke="#aaa" strokeWidth="0.008" />
                          <text x="0" y="0.155" textAnchor="middle"
                            fontSize="0.115" fill={color} fontWeight="bold">
                            {cardLabel(card)}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                )}

                {/* ヒーロー印（ホールカードがない場合のみ表示） */}
                {isHero && !hasHoleCards && !isFolded && (
                  <text x="0" y="0.165" textAnchor="middle" fontSize="0.06" fill="#a78bfa">
                    HERO
                  </text>
                )}
              </g>
            </g>
          );
        })}

      </svg>
    </div>
  );
}
