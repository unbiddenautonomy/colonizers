import { ModuleLibrary } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';

/** Every rules module the web app knows. Expansions are added here as they ship. */
export const library = new ModuleLibrary([baseModule]);
