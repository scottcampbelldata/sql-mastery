import { Routes, Route, Navigate } from 'react-router-dom';
import { CurriculumProvider, useCurriculum } from './state/CurriculumContext.jsx';
import { FoundationsProvider, useFoundations } from './state/FoundationsContext.jsx';
import { AppShell } from './components/AppShell.jsx';
import { EmptyState } from './components/ui.jsx';
import { graduationStatus } from './lib/foundations.js';
import Dashboard from './routes/Dashboard.jsx';
import Session from './routes/Session.jsx';
import Lesson from './routes/Lesson.jsx';
import Databases from './routes/Databases.jsx';
import Foundations from './routes/Foundations.jsx';
import FoundationsSession from './routes/foundations/FoundationsSession.jsx';
import Checkpoint from './routes/foundations/Checkpoint.jsx';

function RootRedirect() {
  const { track, state } = useFoundations();
  if (!track) return <AppShell breadcrumb={<span className="here">Loading…</span>}><EmptyState title="Loading your training path" /></AppShell>;
  const grad = graduationStatus(track, state);
  return <Navigate to={grad.graduated ? '/academy' : '/learn'} replace />;
}

function Body() {
  const { curriculum, error } = useCurriculum();
  if (error) return <EmptyState title="Could not load the course">Start the server with <code>npm start</code>, then reload. ({error})</EmptyState>;
  if (!curriculum) return <EmptyState title="Loading your training path" />;
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/learn" element={<Foundations />} />
      <Route path="/learn/session" element={<FoundationsSession />} />
      <Route path="/learn/checkpoint/:id" element={<Checkpoint />} />
      <Route path="/academy" element={<Dashboard />} />
      <Route path="/session/:sessionId/:exerciseId?" element={<Session />} />
      <Route path="/lessons/:slug" element={<Lesson />} />
      <Route path="/databases" element={<Databases />} />
      <Route path="*" element={<EmptyState title="Page not found" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <CurriculumProvider>
      <FoundationsProvider>
        <Body />
      </FoundationsProvider>
    </CurriculumProvider>
  );
}
