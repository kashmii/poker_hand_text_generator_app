import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import HandInput from '../components/HandInput';
import type { HandData } from '../types/poker';

export default function HandPage() {
  const { session, sessionReady, hands, handCounter, saveHand, incrementHandCounter, updateSession } = useApp();
  const navigate = useNavigate();

  // セッション未設定ならSetupへ
  useEffect(() => {
    if (!sessionReady) navigate('/setup', { replace: true });
  }, [sessionReady, navigate]);

  if (!sessionReady) return null;

  const handleSave = (hand: HandData) => {
    saveHand(hand);
    incrementHandCounter();
    navigate('/result');
  };

  const handleCancel = () => {
    if (hands.length > 0) {
      navigate('/result');
    } else {
      navigate('/setup');
    }
  };

  return (
    <HandInput
      session={session}
      handNumber={handCounter}
      onSave={handleSave}
      onCancel={handleCancel}
      onUpdateSession={updateSession}
    />
  );
}
