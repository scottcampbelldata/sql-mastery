import * as aperture from '../src/datasets/aperture/generate';
import * as sideline from '../src/datasets/sideline/generate';
import * as rove from '../src/datasets/rove/generate';
import { seedDatabase } from '../src/datasets/framework/seed-runner';
import { DatasetModule } from '../src/datasets/framework/types';

async function seedOne(label: string, mod: DatasetModule): Promise<void> {
  console.log(`Seeding ${label}...`);
  const counts = await seedDatabase(mod);
  console.log(`  ${label} done:`, counts);
}

async function main(): Promise<void> {
  await seedOne('aperture', aperture);
  await seedOne('sideline', sideline);
  await seedOne('rove', rove);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
