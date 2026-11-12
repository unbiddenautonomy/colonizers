import { ModuleLibrary } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { specialMapsModule } from '@colonizers/module-special-maps';
import { variantsModule } from '@colonizers/module-variants';
import { citiesKnightsModule } from '@colonizers/module-cities-knights';

/** Every rules module the web app knows. Expansions are added here as they ship. */
export const library = new ModuleLibrary([
  baseModule,
  seafarersModule,
  specialMapsModule,
  variantsModule,
  citiesKnightsModule,
]);
