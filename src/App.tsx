import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import SetupPage from './pages/SetupPage';
import HandPage from './pages/HandPage';
import ResultPage from './pages/ResultPage';
import HistoryPage from './pages/HistoryPage';
import HistoryDetailPage from './pages/HistoryDetailPage';
import DevHistoryPage from './pages/DevHistoryPage';
import PrivacyPage from './pages/PrivacyPage';
import './App.css';

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <div className="app">
            <Routes>
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/hand" element={<HandPage />} />
              <Route path="/result" element={<ResultPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/history/:id" element={<HistoryDetailPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              {/* DEV 専用: ログイン・API なしで履歴画面の見た目を確認する（本番ではsetupへ流れる） */}
              {import.meta.env.DEV && <Route path="/dev/history" element={<DevHistoryPage />} />}
              {/* ルート or 不明なパスはsetupへ */}
              <Route path="*" element={<Navigate to="/setup" replace />} />
            </Routes>
          </div>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  );
}
