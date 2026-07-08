import * as mod from '../src/datasets/rove/generate';
import { seedDatabase } from '../src/datasets/framework/seed-runner';

seedDatabase(mod)
  .then((c) => {
    console.log(c);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
