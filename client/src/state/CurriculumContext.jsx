import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { loadProgress, saveProgress, safeGet, safeSet, ACTIVE_SESSION_KEY } from '../lib/progress.js';

const Ctx = createContext(null);
export const useCurriculum = () => useContext(Ctx);

export function CurriculumProvider({ children }) {
  const [curriculum, setCurriculum] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(loadProgress);
  const [activeSessionId, setActiveSessionIdState] = useState(() => safeGet(ACTIVE_SESSION_KEY) || '');

  useEffect(() => {
    let cancelled = false;
    api.curriculum()
      .then((data) => { if (!cancelled) setCurriculum(data); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  // Mutators must assign new leaf objects (never mutate existing leaves) — only the top-level maps are cloned.
  const updateProgress = useCallback((mutate) => {
    setProgress((prev) => {
      const next = { completed: { ...prev.completed }, attempts: { ...prev.attempts }, lastSql: { ...prev.lastSql } };
      mutate(next);
      saveProgress(next);
      return next;
    });
  }, []);

  const setActiveSessionId = useCallback((id) => {
    safeSet(ACTIVE_SESSION_KEY, id);
    setActiveSessionIdState(id);
  }, []);

  const value = useMemo(() => ({ curriculum, error, progress, updateProgress, activeSessionId, setActiveSessionId }),
    [curriculum, error, progress, updateProgress, activeSessionId, setActiveSessionId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
