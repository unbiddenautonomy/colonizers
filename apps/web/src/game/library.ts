import { ModuleLibrary } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { specialMapsModule } from '@colonizers/module-special-maps';
import { variantsModule } from '@colonizers/module-variants';
import { citiesKnightsModule } from '@colonizers/module-cities-knights';
import { tradersBarbariansModule } from '@colonizers/module-traders-barbarians';
import { treasuresDragonsModule } from '@colonizers/module-treasures-dragons';
import { explorersPiratesModule } from '@colonizers/module-explorers-pirates';
import { greedWealthPowerModule } from '@colonizers/module-greed-wealth-power';
import { worldWondersModule } from '@colonizers/module-world-wonders';
import { civilisationsModule } from '@colonizers/module-civilisations';
import { churchModule } from '@colonizers/module-church';
import { witchesModule } from '@colonizers/module-witches';
import { princesModule } from '@colonizers/module-princes-explorers';
import { soldiersModule } from '@colonizers/module-soldiers-armies';
import { investorsModule } from '@colonizers/module-investors-speculators';
import { kingdomsModule } from '@colonizers/module-kingdoms-warriors';

/** Every rules module the web app knows. Expansions are added here as they ship. */
export const library = new ModuleLibrary([
  baseModule,
  seafarersModule,
  specialMapsModule,
  tradersBarbariansModule,
  treasuresDragonsModule,
  explorersPiratesModule,
  variantsModule,
  worldWondersModule,
  citiesKnightsModule,
  churchModule,
  witchesModule,
  princesModule,
  soldiersModule,
  investorsModule,
  kingdomsModule,
  greedWealthPowerModule,
  civilisationsModule,
]);
