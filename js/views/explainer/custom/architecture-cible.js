/**
 * Scène 5.3 : l'architecture du système réel, par opposition à la démonstration.
 * Six blocs nommés apparaissent en cascade. Les libellés viennent de la spec
 * (§ « Architecture cible production ») et de mem:tech_stack — ne pas en
 * inventer d'autres.
 */
export const id = 'architecture-cible';

const BLOCKS = [
  { key: 'front', label: 'Angular', role: 'Interface' },
  { key: 'api', label: 'NestJS', role: 'API métier' },
  { key: 'db', label: 'PostgreSQL · PostGIS', role: 'Données et géographie' },
  { key: 'iam', label: 'Keycloak', role: 'Identités et rôles' },
  { key: 'storage', label: 'MinIO · S3', role: 'Pièces jointes' },
  { key: 'sign', label: 'PAdES', role: 'Signature électronique' },
];

export function build(scene, doc) {
  const el = doc.createElement('div');
  el.className = 'sc-custom sc-architecture';

  for (const block of BLOCKS) {
    const node = doc.createElement('div');
    node.className = 'sc-archi-block';
    node.dataset.block = block.key;

    const label = doc.createElement('span');
    label.className = 'sc-archi-label';
    label.textContent = block.label;
    node.appendChild(label);

    const role = doc.createElement('span');
    role.className = 'sc-archi-role';
    role.textContent = block.role;
    node.appendChild(role);

    el.appendChild(node);
  }
  return el;
}

export function animate(tl, el, scene, offsetMs) {
  if (typeof el.querySelectorAll !== 'function') return;
  const nodes = el.querySelectorAll('.sc-archi-block');
  nodes.forEach((node, index) => {
    tl.add(node, {
      opacity: [0, 1],
      translateY: [22, 0],
      duration: 560,
      ease: 'out(3)',
    }, offsetMs + 600 + index * 420);
  });
}
