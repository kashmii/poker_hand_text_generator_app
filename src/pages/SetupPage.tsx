import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import SessionSetup from '../components/SessionSetup';
import type { SessionConfig } from '../types/poker';

export default function SetupPage() {
  const { startSession } = useApp();
  const navigate = useNavigate();

  const handleStart = (config: SessionConfig) => {
    startSession(config);
    navigate('/hand');
  };

  return <SessionSetup onStart={handleStart} />;
}
