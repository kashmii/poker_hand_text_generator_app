import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { AppSettings, SessionConfig, HandData, Player } from '../types/poker';

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
  saveHand: (hand: HandData) => void;
  deleteHand: (id: string) => void;
  incrementHandCounter: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// ========== Provider ==========
export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [session, setSession] = useState<SessionConfig>(defaultSession);
  const [hands, setHands] = useState<HandData[]>([]);
  const [handCounter, setHandCounter] = useState(1);
  const [sessionReady, setSessionReady] = useState(false);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const startSession = useCallback((config: SessionConfig) => {
    setSession(config);
    setHands([]);
    setHandCounter(1);
    setSessionReady(true);
  }, []);

  const saveHand = useCallback((hand: HandData) => {
    setHands((prev) => {
      const idx = prev.findIndex((h) => h.id === hand.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = hand;
        return next;
      }
      return [...prev, hand];
    });
  }, []);

  const deleteHand = useCallback((id: string) => {
    setHands((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const incrementHandCounter = useCallback(() => {
    setHandCounter((n) => n + 1);
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
        saveHand,
        deleteHand,
        incrementHandCounter,
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
