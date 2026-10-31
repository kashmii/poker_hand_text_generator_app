import type { Card, Player, Suit } from '../../types/poker';
import type { HandFlowState } from './types';
import { positionLabels } from '../../utils/positions';
import { cardLabel } from '../../utils/card';

interface Props {
  players: Player[];
  state: HandFlowState;
  actorId: string | null;
  heroId: string;
  /** ボード5枠をタップしたとき（ボード入力を開く） */
  onBoardClick?: () => void;
}

/** 白地のカード上の色 */
const SUIT_COLORS: Record<Suit, string> = {
  h: '#cc2222', d: '#cc2222', c: '#111', s: '#111',
};

// ============================================================
// テーブル形状: 角丸長方形 (stadium shape)
// viewBox: -160 -95 320 190
// 外枠: w=280, h=150, r=75  → 左右が半円、中央が直線
// 木枠厚み: 12
// フェルト: w=256, h=126, r=63
// ============================================================
const OW = 280; const OH = 150; const OR = 75;  // 外枠
const IW = 256; const IH = 126; const IR = 63;  // フェルト内側

/** 角丸長方形のSVG path（中心原点） */
function stadiumPath(w: number, h: number, r: number) {
  const hw = w / 2; const hh = h / 2;
  // 左上から時計回り
  return [
    `M ${-hw + r} ${-hh}`,
    `L ${hw - r} ${-hh}`,
    `A ${r} ${r} 0 0 1 ${hw} ${-hh + r}`,
    `L ${hw} ${hh - r}`,
    `A ${r} ${r} 0 0 1 ${hw - r} ${hh}`,
    `L ${-hw + r} ${hh}`,
    `A ${r} ${r} 0 0 1 ${-hw} ${hh - r}`,
    `L ${-hw} ${-hh + r}`,
    `A ${r} ${r} 0 0 1 ${-hw + r} ${-hh}`,
    'Z',
  ].join(' ');
}

// 少し小さいインナーライン（クッション線）
const CW = 246; const CH = 116; const CR = 58;

/**
 * プレイヤーノードをテーブル外周に配置
 * 座標系は viewBox (-160,-95,320,190) で中央が (0,0)
 * hero は常に真下（6時）に配置
 *
 * 配置は角丸長方形の外周に均等にのせる。
 * 上辺・下辺（直線部分）と左右半円に分けて配置するのが本物だが、
 * ここでは楕円近似（rx=152, ry=83）で実用的に配置する。
 */
function getPlayerPositions(count: number, heroIndex: number) {
  // テーブル外枠より少し外側の楕円上に配置
  const RX = 152;
  const RY = 83;
  return Array.from({ length: count }, (_, i) => {
    const offset = (i - heroIndex) / count;
    const angle = 2 * Math.PI * offset + Math.PI / 2; // 真下=6時
    return {
      x: Math.cos(angle) * RX,
      y: Math.sin(angle) * RY,
    };
  });
}


export default function PokerTable({ players, state, actorId, heroId, onBoardClick }: Props) {
  const posLabels = positionLabels(players.length);
  const heroIndex = players.findIndex((p) => p.id === heroId);
  const safeHeroIndex = heroIndex >= 0 ? heroIndex : 0;
  const positions = getPlayerPositions(players.length, safeHeroIndex);

  const { currentStreet, boards, pot, holeCards } = state;


  const currentActions: Record<string, string> = {};
  state.streets[currentStreet].forEach((a) => {
    currentActions[a.playerId] =
      a.type === 'fold'     ? 'FOLD'   :
      a.type === 'check'    ? 'CHECK'  :
      a.type === 'call'     ? 'CALL'   :
      a.type === 'bet'      ? 'BET'    :
      a.type === 'raise'    ? 'RAISE'  :
      a.type === 'allin'    ? 'ALL-IN' :
      a.type === 'straddle' ? 'STR'    : '';
  });

  const contributions = state.contributions;
  const hasHoleCards = holeCards !== null;
  const is9Max = players.length === 9;

  // 9人テーブル: BTN(i=0)席内側にDチップ
  const btnOffset = (0 - safeHeroIndex) / players.length;
  const btnAngle = 2 * Math.PI * btnOffset + Math.PI / 2;
  const dealerBtnPos = {
    x: Math.cos(btnAngle) * 120,
    y: Math.sin(btnAngle) * 65,
  };

  const streetLabel: Record<string, string> = {
    preflop: 'PREFLOP', flop: 'FLOP', turn: 'TURN', river: 'RIVER',
  };

  const woodPath   = stadiumPath(OW, OH, OR);
  const feltPath   = stadiumPath(IW, IH, IR);
  const cushionPath = stadiumPath(CW, CH, CR);

  return (
    <div className="poker-table-wrap">
      <svg
        viewBox="-175 -130 350 270"
        className="poker-table-svg"
        aria-label="poker table"
      >
        <defs>
          {/* フェルト: 中央が明るいグリーン */}
          <radialGradient id="feltGrad" cx="50%" cy="50%" r="65%">
            <stop offset="0%"   stopColor="#4dc878" />
            <stop offset="40%"  stopColor="#28a855" />
            <stop offset="80%"  stopColor="#1a7a3c" />
            <stop offset="100%" stopColor="#0f5228" />
          </radialGradient>
          {/* 木枠 */}
          <linearGradient id="woodGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#d4953a" />
            <stop offset="30%"  stopColor="#b87820" />
            <stop offset="70%"  stopColor="#8a5810" />
            <stop offset="100%" stopColor="#6b4010" />
          </linearGradient>
          {/* 木枠ハイライト（上辺の光） */}
          <linearGradient id="woodHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"  stopColor="rgba(255,220,120,0.5)" />
            <stop offset="40%" stopColor="rgba(255,220,120,0)" />
          </linearGradient>
          {/* フェルト上の中央光（スポットライト感） */}
          <radialGradient id="feltSpot" cx="50%" cy="50%" r="40%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.12)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        {/* 影 */}
        <path d={stadiumPath(OW + 4, OH + 4, OR + 2)}
          transform="translate(3,6)"
          fill="rgba(0,0,0,0.55)" />

        {/* 木枠 */}
        <path d={woodPath} fill="url(#woodGrad)" />

        {/* 木枠上側ハイライト */}
        <path d={woodPath} fill="url(#woodHighlight)" />

        {/* 木枠内側の細いハイライトライン */}
        <path d={feltPath}
          fill="none"
          stroke="rgba(255,200,80,0.25)"
          strokeWidth="2" />

        {/* フェルト本体 */}
        <path d={feltPath} fill="url(#feltGrad)" />

        {/* フェルト上のスポットライト */}
        <path d={feltPath} fill="url(#feltSpot)" />

        {/* クッションライン（フェルト内の白いライン） */}
        <path d={cushionPath}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.5" />

        {/* ===== センター情報 ===== */}
        <text x="0" y="-14" textAnchor="middle"
          fontSize="8" fill="rgba(255,255,255,0.55)" fontWeight="bold" letterSpacing="1.5">
          POT
        </text>
        <text x="0" y="-1" textAnchor="middle"
          fontSize="15" fill="#ffd700" fontWeight="bold">
          {pot.toLocaleString()}
        </text>
        <text x="0" y="12" textAnchor="middle"
          fontSize="6.5" fill="#86efac" letterSpacing="1.5">
          {streetLabel[currentStreet]}
        </text>

        {/* ボードカード: 常に5枚スロット表示 */}
        {(() => {
          const cardW = 22; const cardH = 28; const gap = 3;
          const totalW = 5 * cardW + 4 * gap;
          const startX = -totalW / 2;
          // どのカードが公開済みか
          const revealed: (Card | null)[] = [
            boards.flop[0] ?? null,
            boards.flop[1] ?? null,
            boards.flop[2] ?? null,
            boards.turn[0] ?? null,
            boards.river[0] ?? null,
          ];
          const isActive = (idx: number) => {
            if (currentStreet === 'preflop') return false;
            if (currentStreet === 'flop') return idx < 3;
            if (currentStreet === 'turn') return idx < 4;
            return true; // river
          };
          return (
            <g
              onClick={onBoardClick}
              style={onBoardClick ? { cursor: 'pointer' } : undefined}
            >
              {/* カード間の隙間もタップできるように、5枠全体を覆う透明な当たり判定 */}
              {onBoardClick && (
                <rect x={startX} y={18} width={totalW} height={cardH} fill="transparent" />
              )}
              {Array.from({ length: 5 }, (_, i) => {
                const x = startX + i * (cardW + gap) + cardW / 2;
                const card = revealed[i];
                const active = isActive(i);
                const color = card ? SUIT_COLORS[card.suit] : '#888';
                // ターンとリバーの区切り線（フロップ3枚の後）
                const showDivider = i === 3;
                return (
                  <g key={i}>
                    {showDivider && (
                      <line
                        x1={x - cardW / 2 - gap / 2} y1={18}
                        x2={x - cardW / 2 - gap / 2} y2={18 + cardH}
                        stroke="rgba(255,255,255,0.15)" strokeWidth="0.8"
                      />
                    )}
                    <g transform={`translate(${x}, ${18 + cardH / 2})`}>
                      <rect
                        x={-cardW / 2} y={-cardH / 2}
                        width={cardW} height={cardH}
                        rx="2.5"
                        fill={active && card ? '#fff' : 'rgba(0,0,0,0.25)'}
                        stroke={active && card ? '#ddd' : 'rgba(255,255,255,0.12)'}
                        strokeWidth="0.8"
                      />
                      {active && card ? (
                        <text x="0" y="6" textAnchor="middle"
                          fontSize="13" fill={color} fontWeight="bold">
                          {cardLabel(card)}
                        </text>
                      ) : active && !card ? (
                        // 入力待ち（通常は起きないが念のため）
                        <text x="0" y="6" textAnchor="middle"
                          fontSize="11" fill="rgba(255,255,255,0.3)">?</text>
                      ) : (
                        // 未公開スロット
                        <>
                          <rect x={-6} y={-7} width={12} height={6} rx="1"
                            fill="rgba(255,255,255,0.08)" />
                          <rect x={-6} y={1} width={12} height={6} rx="1"
                            fill="rgba(255,255,255,0.08)" />
                        </>
                      )}
                    </g>
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* ===== プレイヤーノード ===== */}
        {players.map((player, i) => {
          const pos = positions[i];
          const posLabel = posLabels[i] ?? '';
          const isFolded = state.foldedIds.has(player.id);
          const isAllIn  = state.allInIds.has(player.id);
          const isActor  = player.id === actorId;
          const isHero   = player.id === heroId;
          const actionText = currentActions[player.id] ?? '';
          const contrib = contributions[player.id] ?? 0;
          const showContrib = contrib > 0;
          const isDealerSeat = is9Max && i === 0;
          const nodeR = 19;

          // ハンド開始前（ポジション選択・ホールカード入力中）は live/fold の区別がないので緑にしない
          const handStarted = state.phase !== 'hole-cards';

          const bgColor = isFolded ? '#2a3244'
            : isAllIn  ? '#3d1030'
            : isActor  ? '#1535b8'
            : isDealerSeat ? '#0f0f19'
            : '#18253a';
          // foldedは灰色で沈め、ハンド開始後のliveプレイヤーの辺は緑で視認性を上げる。
          // actor（青）/all-in（マゼンタ）は状態を示すため優先。BTNはDチップで示すため辺は色付けしない。
          const strokeColor = isFolded ? '#3a4f6a'
            : isActor  ? '#60a5fa'
            : isAllIn  ? '#f0abfc'
            : handStarted ? '#34d399'
            : '#3a4f6a';
          // live は辺を太く、folded は細く、開始前は既定幅でコントラストを付ける
          const strokeW = isFolded ? 1 : handStarted ? 2 : 1.5;

          return (
            <g key={player.id} transform={`translate(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`}
              opacity={isFolded ? 0.45 : 1}>
              {isActor && (
                <circle r={nodeR + 6} fill="none" stroke="#60a5fa"
                  strokeWidth="2" opacity="0.5" className="actor-pulse" />
              )}

              <circle r={nodeR} fill={bgColor} stroke={strokeColor} strokeWidth={strokeW} />

              {showContrib && (() => {
                // テーブル中心方向（内向き）に配置
                const len = Math.sqrt(pos.x * pos.x + pos.y * pos.y) || 1;
                const nx = -pos.x / len;
                const ny = -pos.y / len;
                const dist = nodeR + 14;
                const bx = nx * dist;
                const by = ny * dist;
                const label = contrib.toLocaleString();
                // 縦固定・横は文字数に応じて伸びる楕円
                const chipRY = 8;  // 縦半径（固定）
                const chipRX = Math.max(label.length * 3.2 + 1, 9); // 横半径
                return (
                  <g transform={`translate(${bx.toFixed(2)}, ${by.toFixed(2)})`}>
                    {/* 楕円本体 */}
                    <ellipse rx={chipRX} ry={chipRY} fill="#1a0a00" stroke="#e8b84b" strokeWidth="1.8" />
                    {/* 金額テキスト */}
                    <text x="0" y="2.8" textAnchor="middle"
                      fontSize="7" fill="#ffd700" fontWeight="bold">
                      {label}
                    </text>
                  </g>
                );
              })()}

              {isDealerSeat ? (
                <text x="0" y="-3.5" textAnchor="middle"
                  fontSize="7.5" fill={isHero ? '#c4b5fd' : '#8ea8c8'} fontWeight="bold">
                  BTN
                </text>
              ) : (
                <text x="0" y="-3.5" textAnchor="middle"
                  fontSize="8" fill={isHero ? '#c4b5fd' : '#8ea8c8'} fontWeight="bold">
                  {posLabel}
                </text>
              )}

              <text x="0" y="8" textAnchor="middle"
                fontSize="7"
                fill={isFolded ? '#5a6580' : isAllIn ? '#f0abfc' : '#fbbf24'}
                fontWeight="bold">
                {isFolded ? 'FOLD' : isAllIn ? 'ALL-IN' : actionText}
              </text>

              {isHero && hasHoleCards && !isFolded && (
                <g transform={`translate(0, ${nodeR + 4})`}>
                  {holeCards!.map((card, ci) => {
                    const cx = ci === 0 ? -14 : 14;
                    const color = SUIT_COLORS[card.suit];
                    return (
                      <g key={ci} transform={`translate(${cx}, 0)`}>
                        <rect x="-11" y="0" width="22" height="28"
                          rx="2.5" fill="#fff" stroke="#bbb" strokeWidth="0.8" />
                        <text x="0" y="20" textAnchor="middle"
                          fontSize="14" fill={color} fontWeight="bold">
                          {cardLabel(card)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}

              {isHero && !hasHoleCards && !isFolded && (
                <text x="0" y={nodeR + 11} textAnchor="middle"
                  fontSize="6.5" fill="#a78bfa">
                  HERO
                </text>
              )}
            </g>
          );
        })}

        {/* 9人: Dボタン */}
        {is9Max && (
          <g transform={`translate(${dealerBtnPos.x.toFixed(2)}, ${dealerBtnPos.y.toFixed(2)})`}>
            <circle r="9" fill="#f5f0dc" stroke="#c8a84b" strokeWidth="1.5" />
            <text x="0" y="3.5" textAnchor="middle"
              fontSize="9.5" fill="#333" fontWeight="bold">D</text>
          </g>
        )}
      </svg>
    </div>
  );
}
