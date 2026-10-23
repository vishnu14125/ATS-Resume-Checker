import React, { Suspense } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Header, { Brand } from './components/Header';
import Loading from './components/Loading';
import ProtectedRoute from './components/ProtectedRoute';

const HomePage = React.lazy(() => import('./pages/HomePage'));
const AuthPage = React.lazy(() => import('./pages/AuthPage'));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const AnalysisPage = React.lazy(() => import('./pages/AnalysisPage'));
const ResultsPage = React.lazy(() => import('./pages/ResultsPage'));

const NotFound = () => (
  <div className="page animate-rise py-20 text-center">
    <p className="font-display text-7xl font-extrabold text-primary/20">404</p>
    <h1 className="page-title mt-2">Page not found</h1>
    <p className="mt-2 text-muted">The page you are looking for does not exist or has moved.</p>
    <Link to="/" className="btn btn-primary mt-6">Back to the start</Link>
  </div>
);

function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<AuthPage key="login" mode="login" />} />
            <Route path="/signup" element={<AuthPage key="signup" mode="signup" />} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/analyze" element={<ProtectedRoute><AnalysisPage /></ProtectedRoute>} />
            <Route path="/results/:id" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <footer className="mt-10 border-t bg-surface">
        <div className="page flex flex-col gap-3 py-6 text-sm text-muted md:flex-row md:items-center md:justify-between">
          <Brand />
          <p>Scores come from fixed rules, so the same resume always gets the same result.</p>
          <p>© {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
