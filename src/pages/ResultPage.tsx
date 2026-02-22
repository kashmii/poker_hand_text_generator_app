import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import HandReview from '../components/HandReview';
import { generateDummyHands } from '../utils/generateDummyHands';

export default function ResultPage() {
  const { session, sessionReady, hands, handCounter, saveHand, deleteHand, incrementHandCounter } = useApp();
  const navigate = useNavigate();

  // セッション未設定ならSetupへ
  useEffect(() => {
    if (!sessionReady) navigate('/setup', { replace: true });
  }, [sessionReady, navigate]);

  if (!sessionReady) return null;

  const handleAddDummy = () => {
    const dummies = generateDummyHands(session, handCounter, 10);
    dummies.forEach((h) => {
      saveHand(h);
      incrementHandCounter();
    });
  };

  return (
    <>
      <HandReview
        hands={hands}
        session={session}
        onNewHand={() => navigate('/hand')}
        onEditSettings={() => navigate('/setup')}
        onDeleteHand={deleteHand}
        onUpdateHand={saveHand}
      />
      {import.meta.env.DEV && (
        <div className="dev-toolbar">
          <button type="button" className="btn-dev" onClick={handleAddDummy}>
            🧪 ダミーデータ10件追加
          </button>
        </div>
      )}
    </>
  );
}
