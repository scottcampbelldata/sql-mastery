import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { loadProgress, saveProgress, ACTIVE_SESSION_KEY } from '../lib/progress.js';

const Ctx = createContext(null);
export const useCurriculum = () => useContext(Ctx);

export function CurriculumProvider({ children }) {
  const [curriculum, setCurriculum] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(loadProgress);
  const [activeSessionId, setActiveSessionIdState] = useState(() => localStorage.getItem(ACTIVE_SESSION_KEY) || '');

  useEffect(() => {
    api.curriculum().then(setCurriculum).catch((e) => setError(e.message));
  }, []);

  const updateProgress = useCallback((mutate) => {
    setProgress((prev) => {
      const next = { completed: { ...prev.completed }, attempts: { ...prev.attempts }, lastSql: { ...prev.lastSql } };
      mutate(next);
      saveProgress(next);
      return next;
    });
  }, []);

  const setActiveSessionId = useCallback((id) => {
    localStorage.setItem(ACTIVE_SESSION_KEY, id);
    setActiveSessionIdState(id);
  }, []);

  const value = useMemo(() => ({ curriculum, error, progress, updateProgress, activeSessionId, setActiveSessionId }),
    [curriculum, error, progress, updateProgress, activeSessionId, setActiveSessionId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
