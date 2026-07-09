import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import type { Curriculum } from '../types';

interface CurriculumContextValue {
  curriculum: Curriculum | null;
  error: string;
}

const Ctx = createContext<CurriculumContextValue | null>(null);
export const useCurriculum = (): CurriculumContextValue => useContext(Ctx) as CurriculumContextValue;

interface CurriculumProviderProps {
  children: ReactNode;
}

export function CurriculumProvider({ children }: CurriculumProviderProps) {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.curriculum()
      .then((data) => { if (!cancelled) setCurriculum(data); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => ({ curriculum, error }), [curriculum, error]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
