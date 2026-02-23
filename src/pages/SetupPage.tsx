import { useNavigate } from 'react-router-dom';
import { useApp, createDefaultPlayers } from '../context/AppContext';
import SessionSetup from '../components/SessionSetup';
import type { SessionConfig } from '../types/poker';
import { generateDummyHands } from '../utils/generateDummyHands';

const DUMMY_PLAYER_COUNT = 6;
const DUMMY_HAND_COUNT = 10;

function buildDummySession(): SessionConfig {
  const players = createDefaultPlayers(DUMMY_PLAYER_COUNT);
  return {
    smallBlind: 1,
    bigBlind: 2,
    ante: 0,
    straddle: 0,
    currency: '$',
    venueName: 'Dev Casino',
    date: new Date().toISOString().slice(0, 10),
    players,
    heroId: players[0].id,       // BTN
    heroPosition: 'BTN',
    heroEffectiveStack: 200,
  };
}

export default function SetupPage() {
  const { startSession, hands, loadDummyData } = useApp();
  const navigate = useNavigate();

  const handleStart = (config: SessionConfig) => {
    startSession(config);
    navigate('/hand');
  };

  const handleLoadDummy = () => {
    const session = buildDummySession();
    const dummyHands = generateDummyHands(session, 1, DUMMY_HAND_COUNT);
    loadDummyData(session, dummyHands);
    navigate('/result');
  };

  return (
    <>
      {import.meta.env.DEV && (
        <button
          type="button"
          className="dev-dummy-btn"
          onClick={handleLoadDummy}
          title={`6人テーブル・${DUMMY_HAND_COUNT}ハンドのダミーデータをロードしてResult画面へ`}
        >
          🛠 DEV: Result画面を開く
        </button>
      )}
      <SessionSetup
        onStart={handleStart}
        onViewResult={hands.length > 0 ? () => navigate('/result') : undefined}
      />
    </>
  );
}
