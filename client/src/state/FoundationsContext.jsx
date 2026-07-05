import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { useCurriculum } from './CurriculumContext.jsx';
import { loadFoundations, saveFoundations } from '../lib/foundations.js';

const Ctx = createContext(null);
export const useFoundations = () => useContext(Ctx);

export function FoundationsProvider({ children }) {
  const { curriculum } = useCurriculum();
  const [state, setState] = useState(loadFoundations);

  // mutate receives the current state object, mutates it (recorders create new leaves),
  // then it is persisted and a fresh reference is stored to trigger re-render.
  const update = useCallback((mutate) => {
    setState((prev) => {
      const next = {
        ...prev,
        skillCorrect: { ...prev.skillCorrect },
        attempts: { ...prev.attempts },
        lastSql: { ...prev.lastSql },
        lastPracticedSession: { ...prev.lastPracticedSession },
        checkpointsPassed: [...prev.checkpointsPassed]
      };
      mutate(next);
      saveFoundations(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ track: curriculum ? curriculum.foundations : null, state, update }), [curriculum, state, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
