import { Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Builder } from './pages/Builder';
import { History } from './pages/History';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/builder" element={<Builder />} />
      <Route path="/history" element={<History />} />
    </Routes>
  );
}
