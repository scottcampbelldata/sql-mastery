import { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useCurriculum } from './CurriculumContext';
import { loadLearning, saveLearning, reconcileUnlock, duplicateSkills } from '../lib/learning-path';
import type { LearningState, Track, Phase } from '../types';

interface FoundationsContextValue {
  track: Track | null;
  phases: Phase[];
  state: LearningState;
  update: (mutate: (next: LearningState) => void) => void;
}

const Ctx = createContext<FoundationsContextValue | null>(null);
export const useFoundations = (): FoundationsContextValue => useContext(Ctx) as FoundationsContextValue;

interface FoundationsProviderProps {
  children: ReactNode;
}

export function FoundationsProvider({ children }: FoundationsProviderProps) {
  const { curriculum } = useCurriculum();
  const [state, setState] = useState<LearningState>(loadLearning);

  const update = useCallback((mutate: (next: LearningState) => void) => {
    setState((prev) => {
      const next = {
        ...prev,
        skillCorrect: { ...prev.skillCorrect },
        attempts: { ...prev.attempts },
        lastSql: { ...prev.lastSql },
        lastPracticedSession: { ...prev.lastPracticedSession },
        checkpointsPassed: [...prev.checkpointsPassed],
        reviewsPassed: { ...prev.reviewsPassed }
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

  const reconciled = useRef(false);
  useEffect(() => {
    if (!track || reconciled.current) return;
    reconciled.current = true;
    const mark = reconcileUnlock(track, state);
    if (mark > state.maxUnlockedOrder) update((s) => { s.maxUnlockedOrder = mark; });
    if (import.meta.env.DEV) {
      const dups = duplicateSkills(track);
      if (dups.length) console.error('Duplicate concept skills in learning track:', dups);
    }
  }, [track]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({ track, phases, state, update }), [track, phases, state, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
