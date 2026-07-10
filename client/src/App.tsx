import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './state/AuthContext';
import { CurriculumProvider, useCurriculum } from './state/CurriculumContext';
import { FoundationsProvider } from './state/FoundationsContext';
import { EmptyState } from './components/ui';
import Databases from './routes/Databases';
import Foundations from './routes/Foundations';
import FoundationsSession from './routes/foundations/FoundationsSession';
import Checkpoint from './routes/foundations/Checkpoint';
import ConceptPractice from './routes/foundations/ConceptPractice';
import { Readiness } from './routes/foundations/Readiness';
import { InterviewMode } from './routes/foundations/InterviewMode';

function Body() {
  const { curriculum, error } = useCurriculum();
  if (error) return <EmptyState title="Could not load the course">Start the server with <code>npm start</code>, then reload. ({error})</EmptyState>;
  if (!curriculum) return <EmptyState title="Loading your training path" />;
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/learn" replace />} />
      <Route path="/learn" element={<Foundations />} />
      <Route path="/learn/session" element={<FoundationsSession />} />
      <Route path="/learn/checkpoint/:id" element={<Checkpoint />} />
      <Route path="/learn/concept/:conceptId" element={<ConceptPractice />} />
      <Route path="/readiness" element={<Readiness />} />
      <Route path="/interview" element={<InterviewMode />} />
      <Route path="/databases" element={<Databases />} />
      <Route path="*" element={<EmptyState title="Page not found" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CurriculumProvider>
        <FoundationsProvider>
          <Body />
        </FoundationsProvider>
      </CurriculumProvider>
    </AuthProvider>
  );
}
