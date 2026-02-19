import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import SetupPage from './pages/SetupPage';
import HandPage from './pages/HandPage';
import ResultPage from './pages/ResultPage';
import './App.css';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="app">
          <Routes>
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/hand" element={<HandPage />} />
            <Route path="/result" element={<ResultPage />} />
            {/* ルート or 不明なパスはsetupへ */}
            <Route path="*" element={<Navigate to="/setup" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}
