import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { AppSettings, SessionConfig, HandData, Player } from '../types/poker';
import { useAuth } from './AuthContext';
import { putHand, deleteHand as deleteHandApi } from '../api/hands';

// ハンド1件のDBへの同期状態。未ログインのハンドは状態を持たない（表示もしない）
export type SyncState = 'syncing' | 'synced' | 'unsynced';

// ========== デフォルト値 ==========
const defaultSettings: AppSettings = {
  outputLanguage: 'en',
  outputFormat: 'custom',
};

const defaultSession: SessionConfig = {
  smallBlind: 1,
  bigBlind: 2,
  ante: 0,
  straddle: 0,
  currency: '$',
  venueName: '',
  date: new Date().toISOString().slice(0, 10),
  players: [],
  heroId: '',
  heroPosition: '',
  heroEffectiveStack: 100,
};

// ========== Context型 ==========
interface AppContextValue {
  settings: AppSettings;
  session: SessionConfig;
  hands: HandData[];
  handCounter: number;
  sessionReady: boolean;

  updateSettings: (patch: Partial<AppSettings>) => void;
  startSession: (config: SessionConfig) => void;
  updateSession: (patch: Partial<SessionConfig>) => void;
  saveHand: (hand: HandData) => void;
  deleteHand: (id: string) => void;
  /** ハンドごとのDB同期状態。ログイン中に保存したものだけ入る */
  syncStatus: Record<string, SyncState>;
  /** 未同期のハンドを再送する（PUTなので何度送っても安全） */
  resendHand: (id: string) => void;
  incrementHandCounter: () => void;
  /** DEV専用: セッション設定とハンド履歴を一括ロード */
  loadDummyData: (session: SessionConfig, hands: HandData[]) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// ========== Provider ==========
export function AppProvider({ children }: { children: ReactNode }) {
  const { session: authSession } = useAuth();
  const isLoggedIn = authSession !== null;

  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [session, setSession] = useState<SessionConfig>(defaultSession);
  const [hands, setHands] = useState<HandData[]>([]);
  const [handCounter, setHandCounter] = useState(1);
  const [sessionReady, setSessionReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncState>>({});

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const startSession = useCallback((config: SessionConfig) => {
    setSession(config);
    setHands([]);
    setHandCounter(1);
    setSessionReady(true);
  }, []);

  const updateSession = useCallback((patch: Partial<SessionConfig>) => {
    setSession((prev) => ({ ...prev, ...patch }));
  }, []);

  // ハンド1件をDBへ送る。成功で「同期済み」、失敗で「未同期」にする
  const syncHand = useCallback(async (hand: HandData) => {
    setSyncStatus((prev) => ({ ...prev, [hand.id]: 'syncing' }));
    try {
      await putHand(hand);
      setSyncStatus((prev) => ({ ...prev, [hand.id]: 'synced' }));
    } catch {
      setSyncStatus((prev) => ({ ...prev, [hand.id]: 'unsynced' }));
    }
  }, []);

  const saveHand = useCallback((hand: HandData) => {
    // まず手元を更新（通信失敗でも入力は失わない）
    setHands((prev) => {
      const idx = prev.findIndex((h) => h.id === hand.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = hand;
        return next;
      }
      return [...prev, hand];
    });
    // ログイン中なら自動でDBへ送る（タイトル編集もここを通る）
    if (isLoggedIn) void syncHand(hand);
  }, [isLoggedIn, syncHand]);

  const deleteHand = useCallback((id: string) => {
    setHands((prev) => prev.filter((h) => h.id !== id));
    setSyncStatus((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    // ログイン中はDBからも消す（失敗しても手元は消えたまま）
    if (isLoggedIn) void deleteHandApi(id).catch(() => undefined);
  }, [isLoggedIn]);

  const resendHand = useCallback((id: string) => {
    const hand = hands.find((h) => h.id === id);
    if (hand && isLoggedIn) void syncHand(hand);
  }, [hands, isLoggedIn, syncHand]);

  const incrementHandCounter = useCallback(() => {
    setHandCounter((n) => n + 1);
  }, []);

  const loadDummyData = useCallback((dummySession: SessionConfig, dummyHands: HandData[]) => {
    setSession(dummySession);
    setHands(dummyHands);
    setHandCounter(dummyHands.length + 1);
    setSessionReady(true);
  }, []);

  return (
    <AppContext.Provider
      value={{
        settings,
        session,
        hands,
        handCounter,
        sessionReady,
        updateSettings,
        startSession,
        updateSession,
        saveHand,
        deleteHand,
        syncStatus,
        resendHand,
        incrementHandCounter,
        loadDummyData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// ========== Hook ==========
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

// ========== ユーティリティ ==========
export function createDefaultPlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i}`,
    name: `Player ${i + 1}`,
    stack: 100,
    position: i,
  }));
}
