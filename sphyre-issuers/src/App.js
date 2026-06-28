import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/dashboard/DashboardPage';
import CredentialsPage from './pages/credentials/CredentialsPage';
import VerificationPage from './pages/verification/VerificationPage';
import SettingsPage from './pages/settings/SettingsPage';
import SeedPhraseSetup from './pages/SeedPhraseSetup';
import SetupPinPage from './pages/SetupPinPage';
import LoginPage from './pages/LoginPage';
import RecoveryPage from './pages/RecoveryPage';
import RecoverySeedPhrasePage from './pages/RecoverySeedPhrasePage';
import issuerAuthService from './services/issuerAuthService';
import { ToastProvider } from './contexts/ToastContext';
import ErrorBoundary from './components/ui/ErrorBoundary';
import OnboardingPage from './pages/OnboardingPage';
import './App.css';

function ProtectedRoute({ children }) {
  const isLoggedIn = issuerAuthService.isLoggedIn();
  const isAuthenticated = issuerAuthService.isSessionAuthenticated();
  
  if (!isLoggedIn) {
    return <Navigate to="/onboarding" replace />;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Router>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/onboarding-old" element={<OnboardingPage />} />
        <Route path="/seed-phrase-setup" element={<SeedPhraseSetup />} />
        <Route path="/setup-pin" element={<SetupPinPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/recovery" element={<RecoveryPage />} />
        <Route path="/recover-seed-phrase" element={<RecoverySeedPhrasePage />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        } />
        <Route path="/credentials/*" element={
          <ProtectedRoute>
            <CredentialsPage />
          </ProtectedRoute>
        } />
        <Route path="/verification/*" element={
          <ProtectedRoute>
            <VerificationPage />
          </ProtectedRoute>
        } />
        <Route path="/settings/*" element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        } />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
        </Router>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
