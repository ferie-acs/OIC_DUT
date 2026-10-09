import * as portAbidjan from './port-abidjan.js';
import * as copieRetiree from './copie-retiree.js';
import * as architectureCible from './architecture-cible.js';

/** Registre des scènes sur mesure, indexé par la valeur de `custom` du storyboard. */
export const CUSTOM_SCENES = Object.fromEntries(
  [portAbidjan, copieRetiree, architectureCible].map((m) => [m.id, m]),
);
