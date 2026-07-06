import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { loadProgress, saveProgress, safeGet, safeSet, ACTIVE_SESSION_KEY } from '../lib/progress';
import type { Curriculum, Progress } from '../types';

interface CurriculumContextValue {
  curriculum: Curriculum | null;
  error: string;
  progress: Progress;
  updateProgress: (mutate: (next: Progress) => void) => void;
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
}

const Ctx = createContext<CurriculumContextValue | null>(null);
export const useCurriculum = (): CurriculumContextValue => useContext(Ctx) as CurriculumContextValue;

interface CurriculumProviderProps {
  children: ReactNode;
}

export function CurriculumProvider({ children }: CurriculumProviderProps) {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [activeSessionId, setActiveSessionIdState] = useState<string>(() => safeGet(ACTIVE_SESSION_KEY) || '');

  useEffect(() => {
    let cancelled = false;
    api.curriculum()
      .then((data) => { if (!cancelled) setCurriculum(data); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  // Mutators must assign new leaf objects (never mutate existing leaves): only the top-level maps are cloned.
  const updateProgress = useCallback((mutate: (next: Progress) => void) => {
    setProgress((prev) => {
      const next = { completed: { ...prev.completed }, attempts: { ...prev.attempts }, lastSql: { ...prev.lastSql } };
      mutate(next);
      saveProgress(next);
      return next;
    });
  }, []);

  const setActiveSessionId = useCallback((id: string) => {
    safeSet(ACTIVE_SESSION_KEY, id);
    setActiveSessionIdState(id);
  }, []);

  const value = useMemo(() => ({ curriculum, error, progress, updateProgress, activeSessionId, setActiveSessionId }),
    [curriculum, error, progress, updateProgress, activeSessionId, setActiveSessionId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
