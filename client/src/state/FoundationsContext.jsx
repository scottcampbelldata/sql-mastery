import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { useCurriculum } from './CurriculumContext.jsx';
import { loadLearning, saveLearning } from '../lib/learning-path.js';

const Ctx = createContext(null);
export const useFoundations = () => useContext(Ctx);

export function FoundationsProvider({ children }) {
  const { curriculum } = useCurriculum();
  const [state, setState] = useState(loadLearning);

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
      saveLearning(next);
      return next;
    });
  }, []);

  // `track` is the flattened path the engine consumes (skills/concepts/checkpoints/exercises).
  // `phases` is the grouped structure for the phase-map home.
  const track = curriculum ? curriculum.learningPath : null;
  const phases = curriculum ? curriculum.learningPath.phases : [];
  const value = useMemo(() => ({ track, phases, state, update }), [track, phases, state, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
