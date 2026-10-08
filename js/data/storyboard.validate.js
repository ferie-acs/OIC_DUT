import { STAGE_KINDS } from './storyboard.js';

/**
 * Vérifie la cohérence d'un storyboard.
 * Retourne la liste des problèmes trouvés ; tableau vide si tout est conforme.
 */
export function validateStoryboard(storyboard) {
  const errors = [];
  const kinds = new Set(STAGE_KINDS);

  for (const chapter of storyboard.chapters || []) {
    const scenes = chapter.scenes || [];
    if (!scenes.length) { errors.push(`${chapter.id} : aucune scène`); continue; }

    let cursor = 0;
    for (const scene of scenes) {
      if (scene.at !== cursor) {
        errors.push(`${chapter.id}/${scene.id} : chevauchement ou trou (attendu à ${cursor} ms, déclaré à ${scene.at} ms)`);
      }
      cursor = scene.at + scene.duration;

      const isTitleCard = scene.kindOfScene === 'title-card';
      if (!isTitleCard && !String(scene.narration || '').trim()) {
        errors.push(`${chapter.id}/${scene.id} : narration absente`);
      }
      for (const item of scene.stage || []) {
        if (!kinds.has(item.kind)) {
          errors.push(`${chapter.id}/${scene.id} : primitive inconnue « ${item.kind} »`);
        }
      }
    }

    if (cursor !== chapter.duration) {
      errors.push(`${chapter.id} : somme des durées de scènes (${cursor} ms) différente de la durée du chapitre (${chapter.duration} ms)`);
    }
  }

  return errors;
}
