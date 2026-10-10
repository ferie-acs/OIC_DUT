import * as title from './title.js';
import * as actor from './actor.js';
import * as doc from './doc.js';
import * as flow from './flow.js';
import * as picto from './picto.js';
import * as screen from './screen.js';
import * as callout from './callout.js';

/** Registre des primitives, indexé par la valeur de `kind` du storyboard. */
export const STAGE_PRIMITIVES = Object.fromEntries(
  [title, actor, doc, flow, picto, screen, callout].map((m) => [m.kind, m]),
);
