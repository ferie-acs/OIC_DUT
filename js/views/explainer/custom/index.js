import * as portAbidjan from './port-abidjan.js';
import * as chaineActeurs from './chaine-acteurs.js';
import * as plancheActeurs from './planche-acteurs.js';
import * as copieRetiree from './copie-retiree.js';
import { SCENE_FAMILIES } from './iso-scenes.js';

/**
 * Registre des scènes sur mesure, indexé par la valeur de `custom` du
 * storyboard. Les scènes nommées sont des décors uniques ; les familles sont
 * des constructeurs génériques pilotés par `customParams`.
 */
export const CUSTOM_SCENES = Object.fromEntries(
  [portAbidjan, chaineActeurs, plancheActeurs, copieRetiree, ...SCENE_FAMILIES].map((m) => [m.id, m]),
);
