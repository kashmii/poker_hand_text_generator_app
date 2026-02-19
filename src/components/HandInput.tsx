import { useState, useCallback } from 'react';
import type {
  HandData,
  SessionConfig,
  Action,
  ActionType,
  Card,
  Rank,
  Suit,
  Street,
  ShowdownEntry,
  Player,
} from '../types/poker';

interface Props {
  session: SessionConfig;
  handNumber: number;
  onSave: (hand: HandData) => void;
  onCancel: () => void;
}

const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS: { value: Suit; label: string; color: string }[] = [
  { value: 'h', label: '♥', color: '#e53e3e' },
  { value: 'd', label: '♦', color: '#e53e3e' },
  { value: 'c', label: '♣', color: '#2d3748' },
  { value: 's', label: '♠', color: '#2d3748' },
];

const ACTION_TYPES: { value: ActionType; label: string; hasAmount: boolean }[] = [
  { value: 'fold', label: 'フォールド', hasAmount: false },
  { value: 'check', label: 'チェック', hasAmount: false },
  { value: 'call', label: 'コール', hasAmount: true },
  { value: 'bet', label: 'ベット', hasAmount: true },
  { value: 'raise', label: 'レイズ', hasAmount: true },
  { value: 'allin', label: 'オールイン', hasAmount: true },
];

const STREET_LABELS: Record<Street, string> = {
  preflop: 'プリフロップ',
  flop: 'フロップ',
  turn: 'ターン',
  river: 'リバー',
};

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

// カード選択コンポーネント
function CardPicker({
  value,
  onChange,
  label,
}: {
  value: Card | null;
  onChange: (card: Card | null) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedRank, setSelectedRank] = useState<Rank | null>(value?.rank ?? null);

  const handleRank = (r: Rank) => setSelectedRank(r);
  const handleSuit = (s: Suit) => {
    if (selectedRank) {
      onChange({ rank: selectedRank, suit: s });
      setSelectedRank(null);
      setOpen(false);
    }
  };
  const handleClear = () => {
    onChange(null);
    setSelectedRank(null);
    setOpen(false);
  };

  return (
    <div className="card-picker">
      <button
        type="button"
        className={`card-btn ${value ? 'card-btn--selected' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        {value ? (
          <span style={{ color: value.suit === 'h' || value.suit === 'd' ? '#e53e3e' : '#1a202c' }}>
            {value.rank}
            {SUITS.find((s) => s.value === value.suit)?.label}
          </span>
        ) : (
          <span className="card-btn__placeholder">{label}</span>
        )}
      </button>

      {open && (
        <div className="card-picker__popup">
          <div className="card-picker__ranks">
            {RANKS.map((r) => (
              <button
                key={r}
                type="button"
                className={`rank-btn ${selectedRank === r ? 'rank-btn--active' : ''}`}
                onClick={() => handleRank(r)}
              >
                {r}
              </button>
            ))}
          </div>
          {selectedRank && (
            <div className="card-picker__suits">
              {SUITS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className="suit-btn"
                  style={{ color: s.color }}
                  onClick={() => handleSuit(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {value && (
            <button type="button" className="clear-btn" onClick={handleClear}>
              クリア
            </button>
          )}
          <button type="button" className="close-btn" onClick={() => setOpen(false)}>
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}

// アクション入力行
function ActionRow({
  action,
  players,
  currency,
  onUpdate,
  onRemove,
}: {
  action: Action & { id: string };
  players: Player[];
  currency: string;
  onUpdate: (id: string, patch: Partial<Action>) => void;
  onRemove: (id: string) => void;
}) {
  const actionDef = ACTION_TYPES.find((a) => a.value === action.type);

  return (
    <div className="action-row">
      <select
        value={action.playerId}
        onChange={(e) => onUpdate(action.id, { playerId: e.target.value })}
        className="select-player"
      >
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        value={action.type}
        onChange={(e) => onUpdate(action.id, { type: e.target.value as ActionType, amount: undefined })}
        className="select-action"
      >
        {ACTION_TYPES.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
      {actionDef?.hasAmount && (
        <div className="amount-input">
          <span className="currency-prefix">{currency}</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={action.amount ?? ''}
            onChange={(e) => onUpdate(action.id, { amount: Number(e.target.value) })}
            className="input-amount"
            placeholder="0"
          />
        </div>
      )}
      <button type="button" className="btn-remove" onClick={() => onRemove(action.id)}>
        ✕
      </button>
    </div>
  );
}

// ストリートセクション
function StreetSection({
  street,
  actions,
  boardCards,
  boardCount,
  players,
  currency,
  onAddAction,
  onUpdateAction,
  onRemoveAction,
  onBoardChange,
}: {
  street: Street;
  actions: (Action & { id: string })[];
  boardCards: (Card | null)[];
  boardCount: number;
  players: Player[];
  currency: string;
  onAddAction: (street: Street) => void;
  onUpdateAction: (street: Street, id: string, patch: Partial<Action>) => void;
  onRemoveAction: (street: Street, id: string) => void;
  onBoardChange: (street: Street, idx: number, card: Card | null) => void;
}) {
  const boardLabels = ['1枚目', '2枚目', '3枚目'];

  return (
    <div className="street-section">
      <h3 className="street-title">{STREET_LABELS[street]}</h3>

      {boardCount > 0 && (
        <div className="board-cards">
          <span className="board-label">ボード</span>
          {Array.from({ length: boardCount }).map((_, i) => (
            <CardPicker
              key={i}
              value={boardCards[i] ?? null}
              onChange={(card) => onBoardChange(street, i, card)}
              label={boardLabels[i] ?? `${i + 1}枚目`}
            />
          ))}
        </div>
      )}

      <div className="actions-list">
        {actions.map((a) => (
          <ActionRow
            key={a.id}
            action={a}
            players={players}
            currency={currency}
            onUpdate={(id, patch) => onUpdateAction(street, id, patch)}
            onRemove={(id) => onRemoveAction(street, id)}
          />
        ))}
      </div>

      <button
        type="button"
        className="btn-add-action"
        onClick={() => onAddAction(street)}
      >
        + アクション追加
      </button>
    </div>
  );
}

// ========== メインコンポーネント ==========
export default function HandInput({ session, handNumber, onSave, onCancel }: Props) {
  const { players, currency } = session;

  // ディーラー位置
  const [dealerIdx, setDealerIdx] = useState(0);

  // ヒーローのホールカード
  const [holeCard1, setHoleCard1] = useState<Card | null>(null);
  const [holeCard2, setHoleCard2] = useState<Card | null>(null);

  type StreetActions = Record<Street, (Action & { id: string })[]>;
  type BoardState = Record<Street, (Card | null)[]>;

  const [streetActions, setStreetActions] = useState<StreetActions>({
    preflop: [],
    flop: [],
    turn: [],
    river: [],
  });

  const [boardState, setBoardState] = useState<BoardState>({
    preflop: [],
    flop: [null, null, null],
    turn: [null],
    river: [null],
  });

  // ストリートの表示制御
  const [showFlop, setShowFlop] = useState(false);
  const [showTurn, setShowTurn] = useState(false);
  const [showRiver, setShowRiver] = useState(false);

  // ショーダウン
  const [showShowdown, setShowShowdown] = useState(false);
  const [showdownEntries, setShowdownEntries] = useState<
    { id: string; playerId: string; card1: Card | null; card2: Card | null; desc: string }[]
  >([]);

  // ウィナー
  const [winnerPlayerId, setWinnerPlayerId] = useState(players[0]?.id ?? '');
  const [winnerAmount, setWinnerAmount] = useState(0);
  const [winnerDesc, setWinnerDesc] = useState('');
  const [pot, setPot] = useState(0);
  const [notes, setNotes] = useState('');

  // アクション操作
  const addAction = useCallback((street: Street) => {
    const newAction: Action & { id: string } = {
      id: generateId(),
      playerId: players[0]?.id ?? '',
      type: 'fold',
    };
    setStreetActions((prev) => ({
      ...prev,
      [street]: [...prev[street], newAction],
    }));
  }, [players]);

  const updateAction = useCallback((street: Street, id: string, patch: Partial<Action>) => {
    setStreetActions((prev) => ({
      ...prev,
      [street]: prev[street].map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }, []);

  const removeAction = useCallback((street: Street, id: string) => {
    setStreetActions((prev) => ({
      ...prev,
      [street]: prev[street].filter((a) => a.id !== id),
    }));
  }, []);

  const updateBoard = useCallback((street: Street, idx: number, card: Card | null) => {
    setBoardState((prev) => {
      const next = [...prev[street]];
      next[idx] = card;
      return { ...prev, [street]: next };
    });
  }, []);

  // ショーダウン操作
  const addShowdownEntry = () => {
    setShowdownEntries((prev) => [
      ...prev,
      { id: generateId(), playerId: players[0]?.id ?? '', card1: null, card2: null, desc: '' },
    ]);
  };

  const updateShowdownEntry = (
    id: string,
    patch: Partial<{ playerId: string; card1: Card | null; card2: Card | null; desc: string }>
  ) => {
    setShowdownEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
  };

  const removeShowdownEntry = (id: string) => {
    setShowdownEntries((prev) => prev.filter((e) => e.id !== id));
  };

  // 保存
  const handleSave = () => {
    const filterBoard = (cards: (Card | null)[]): Card[] =>
      cards.filter((c): c is Card => c !== null);

    const hand: HandData = {
      id: generateId(),
      handNumber,
      dealerPosition: dealerIdx,
      streets: {
        preflop: { actions: streetActions.preflop },
        ...(showFlop ? {
          flop: {
            actions: streetActions.flop,
            board: filterBoard(boardState.flop),
          },
        } : {}),
        ...(showFlop && showTurn ? {
          turn: {
            actions: streetActions.turn,
            board: filterBoard(boardState.turn),
          },
        } : {}),
        ...(showFlop && showTurn && showRiver ? {
          river: {
            actions: streetActions.river,
            board: filterBoard(boardState.river),
          },
        } : {}),
      },
      ...(showShowdown && showdownEntries.length > 0 ? {
        showdown: showdownEntries
          .filter((e) => e.card1 && e.card2)
          .map((e): ShowdownEntry => ({
            playerId: e.playerId,
            cards: [e.card1!, e.card2!],
            handDescription: e.desc || undefined,
          })),
      } : {}),
      pot,
      winners: winnerPlayerId
        ? [{ playerId: winnerPlayerId, amount: winnerAmount, description: winnerDesc || undefined }]
        : [],
      notes: notes || undefined,
    };

    // ヒーローのホールカードをセッションに反映させるため、onSaveに渡す前に
    // session.playersを更新する必要がある。ここではhandDataに埋め込む。
    // formatHand側でhero.holeCardsを参照するので、sessionを直接更新する代わりに
    // handのstreets.preflopにheroのcardsを渡す別の方法を使う。
    // 実際にはApp側でsessionを更新する。
    onSave({ ...hand, _heroCards: [holeCard1, holeCard2] } as HandData & { _heroCards: (Card | null)[] });
  };

  return (
    <div className="hand-input">
      <div className="hand-input__header">
        <button type="button" className="btn-back" onClick={onCancel}>
          ← 戻る
        </button>
        <h2>Hand #{handNumber}</h2>
      </div>

      {/* ディーラー選択 */}
      <section className="form-section">
        <h3>ディーラー（BTN）</h3>
        <div className="dealer-select">
          {players.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`dealer-btn ${dealerIdx === i ? 'dealer-btn--active' : ''}`}
              onClick={() => setDealerIdx(i)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </section>

      {/* ヒーローのホールカード */}
      <section className="form-section">
        <h3>ヒーローのホールカード</h3>
        <div className="hole-cards">
          <CardPicker value={holeCard1} onChange={setHoleCard1} label="1枚目" />
          <CardPicker value={holeCard2} onChange={setHoleCard2} label="2枚目" />
        </div>
      </section>

      {/* プリフロップ */}
      <StreetSection
        street="preflop"
        actions={streetActions.preflop}
        boardCards={[]}
        boardCount={0}
        players={players}
        currency={currency}
        onAddAction={addAction}
        onUpdateAction={updateAction}
        onRemoveAction={removeAction}
        onBoardChange={updateBoard}
      />

      {/* フロップ */}
      {!showFlop ? (
        <button
          type="button"
          className="btn-next-street"
          onClick={() => setShowFlop(true)}
        >
          + フロップへ進む
        </button>
      ) : (
        <>
          <StreetSection
            street="flop"
            actions={streetActions.flop}
            boardCards={boardState.flop}
            boardCount={3}
            players={players}
            currency={currency}
            onAddAction={addAction}
            onUpdateAction={updateAction}
            onRemoveAction={removeAction}
            onBoardChange={updateBoard}
          />

          {/* ターン */}
          {!showTurn ? (
            <button
              type="button"
              className="btn-next-street"
              onClick={() => setShowTurn(true)}
            >
              + ターンへ進む
            </button>
          ) : (
            <>
              <StreetSection
                street="turn"
                actions={streetActions.turn}
                boardCards={boardState.turn}
                boardCount={1}
                players={players}
                currency={currency}
                onAddAction={addAction}
                onUpdateAction={updateAction}
                onRemoveAction={removeAction}
                onBoardChange={updateBoard}
              />

              {/* リバー */}
              {!showRiver ? (
                <button
                  type="button"
                  className="btn-next-street"
                  onClick={() => setShowRiver(true)}
                >
                  + リバーへ進む
                </button>
              ) : (
                <StreetSection
                  street="river"
                  actions={streetActions.river}
                  boardCards={boardState.river}
                  boardCount={1}
                  players={players}
                  currency={currency}
                  onAddAction={addAction}
                  onUpdateAction={updateAction}
                  onRemoveAction={removeAction}
                  onBoardChange={updateBoard}
                />
              )}
            </>
          )}
        </>
      )}

      {/* ショーダウン */}
      <section className="form-section">
        <div className="section-toggle">
          <h3>ショーダウン</h3>
          <button
            type="button"
            className={`toggle-btn ${showShowdown ? 'toggle-btn--active' : ''}`}
            onClick={() => setShowShowdown((v) => !v)}
          >
            {showShowdown ? 'あり ✓' : 'なし'}
          </button>
        </div>
        {showShowdown && (
          <div className="showdown-entries">
            {showdownEntries.map((entry) => (
              <div key={entry.id} className="showdown-entry">
                <select
                  value={entry.playerId}
                  onChange={(e) => updateShowdownEntry(entry.id, { playerId: e.target.value })}
                  className="select-player"
                >
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div className="hole-cards">
                  <CardPicker
                    value={entry.card1}
                    onChange={(c) => updateShowdownEntry(entry.id, { card1: c })}
                    label="1枚目"
                  />
                  <CardPicker
                    value={entry.card2}
                    onChange={(c) => updateShowdownEntry(entry.id, { card2: c })}
                    label="2枚目"
                  />
                </div>
                <input
                  type="text"
                  placeholder="ハンド説明 (例: flush, Ace high)"
                  value={entry.desc}
                  onChange={(e) => updateShowdownEntry(entry.id, { desc: e.target.value })}
                  className="input-desc"
                />
                <button type="button" className="btn-remove" onClick={() => removeShowdownEntry(entry.id)}>
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="btn-add-action" onClick={addShowdownEntry}>
              + プレイヤー追加
            </button>
          </div>
        )}
      </section>

      {/* ポット・ウィナー */}
      <section className="form-section">
        <h3>結果</h3>
        <div className="form-row">
          <label>最終ポット ({currency})</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={pot}
            onChange={(e) => setPot(Number(e.target.value))}
            className="input-small"
          />
        </div>
        <div className="form-row">
          <label>ウィナー</label>
          <select
            value={winnerPlayerId}
            onChange={(e) => setWinnerPlayerId(e.target.value)}
            className="select-player"
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>獲得額 ({currency})</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={winnerAmount}
            onChange={(e) => setWinnerAmount(Number(e.target.value))}
            className="input-small"
          />
        </div>
        <div className="form-row">
          <label>説明 <span className="hint">（例: with flush）</span></label>
          <input
            type="text"
            value={winnerDesc}
            onChange={(e) => setWinnerDesc(e.target.value)}
            className="input-desc"
            placeholder="任意"
          />
        </div>
      </section>

      {/* メモ */}
      <section className="form-section">
        <h3>メモ <span className="hint">（任意）</span></h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="textarea-notes"
          placeholder="このハンドについてのメモ..."
          rows={3}
        />
      </section>

      <div className="hand-input__actions">
        <button type="button" className="btn-primary btn-full" onClick={handleSave}>
          保存してテキストを生成
        </button>
      </div>
    </div>
  );
}
