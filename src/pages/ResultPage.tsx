import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import HandReview from '../components/HandReview';

export default function ResultPage() {
  const { session, sessionReady, hands, settings, updateSettings, saveHand, deleteHand } = useApp();
  const navigate = useNavigate();

  // セッション未設定ならSetupへ
  useEffect(() => {
    if (!sessionReady) navigate('/setup', { replace: true });
  }, [sessionReady, navigate]);

  if (!sessionReady) return null;

  return (
    <HandReview
      hands={hands}
      session={session}
      settings={settings}
      onNewHand={() => navigate('/hand')}
      onEditSettings={() => navigate('/setup')}
      onUpdateSettings={updateSettings}
      onDeleteHand={deleteHand}
      onUpdateHand={saveHand}
    />
  );
}
