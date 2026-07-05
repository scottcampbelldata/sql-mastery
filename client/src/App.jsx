import { Routes, Route } from 'react-router-dom';
import { CurriculumProvider, useCurriculum } from './state/CurriculumContext.jsx';
import { EmptyState } from './components/ui.jsx';
import Dashboard from './routes/Dashboard.jsx';
import Session from './routes/Session.jsx';
import Lesson from './routes/Lesson.jsx';
import Databases from './routes/Databases.jsx';

function Body() {
  const { curriculum, error } = useCurriculum();
  if (error) {
    return <EmptyState title="Could not load the course">Start the server with <code>npm start</code>, then reload. ({error})</EmptyState>;
  }
  if (!curriculum) return <EmptyState title="Loading your training path" />;
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
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
      <Body />
    </CurriculumProvider>
  );
}
