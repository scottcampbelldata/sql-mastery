import { createQueryService } from '../query-service';
import { assembleExercise } from './assemble';
import { bindTemplate } from './bind';
import type { LiteralProbe } from './bind';
import { loadCatalog } from './schema-catalog';
import { APERTURE_TEMPLATES } from './templates/aperture/index';
import { SIDELINE_TEMPLATES } from './templates/sideline/index';
import { ROVE_TEMPLATES } from './templates/rove/index';
import type { DraftExercise, Template } from './types';

type CurriculumDatabase = 'aperture' | 'sideline' | 'rove';

const REGISTRY: Record<CurriculumDatabase, Template[]> = {
  aperture: APERTURE_TEMPLATES,
  sideline: SIDELINE_TEMPLATES,
  rove: ROVE_TEMPLATES
};

export async function buildAllExercises(): Promise<Record<CurriculumDatabase, DraftExercise[]>> {
  return {
    aperture: await buildExercisesFor('aperture'),
    sideline: await buildExercisesFor('sideline'),
    rove: await buildExercisesFor('rove')
  };
}

export async function buildExercisesFor(database: string): Promise<DraftExercise[]> {
  const templates = REGISTRY[database as CurriculumDatabase] ?? [];
  if (templates.length === 0) return [];

  const svc = createQueryService();
  try {
    const catalog = await loadCatalog(database);
    const probe: LiteralProbe = async (sql) => {
      const res = await svc.executeQuery({ database, sql, rowMode: 'array' });
      return res.rows as (string | null)[][];
    };

    const drafts: DraftExercise[] = [];
    for (const template of templates) {
      const bindings = await bindTemplate(template, catalog, probe);
      for (const binding of bindings) {
        drafts.push(assembleExercise(template, binding, catalog));
      }
    }
    return drafts;
  } finally {
    await svc.close();
  }
}
