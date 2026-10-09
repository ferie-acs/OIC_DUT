// Liste des fichiers de l'application à pré-cacher par le service worker.
// Usage : node tools/pwa/precache.mjs  → écrit precache.json (liste + version = empreinte du contenu).
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOTS = ['index.html', 'manifest.webmanifest', 'css', 'js', 'assets/images', 'assets/icons'];
const SKIP_EXT = new Set(['.mp4', '.zip', '.pdf', '.psd', '.ai', '.map']);

async function walk(root, rel) {
  const out = [];
  for (const entry of await readdir(path.join(root, rel), { withFileTypes: true })) {
    const p = path.posix.join(rel, entry.name);
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) out.push(...await walk(root, p));
    else if (!SKIP_EXT.has(path.extname(entry.name).toLowerCase())) out.push(p);
  }
  return out;
}

/** Fichiers à pré-cacher, chemins relatifs à la racine, triés. */
export async function listPrecacheFiles(root) {
  const files = [];
  for (const r of ROOTS) {
    const full = path.join(root, r);
    try {
      const s = await stat(full);
      if (s.isDirectory()) files.push(...await walk(root, r)); else files.push(r);
    } catch { /* racine absente : ignorée */ }
  }
  return [...new Set(files)].sort();
}

/** Empreinte courte du contenu : change dès qu'un fichier change → nouveau cache. */
export async function contentVersion(root, files) {
  const h = createHash('sha256');
  for (const f of files) h.update(f).update(await readFile(path.join(root, f)));
  return h.digest('hex').slice(0, 12);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const root = process.cwd();
  const files = await listPrecacheFiles(root);
  const version = await contentVersion(root, files);
  await writeFile(path.join(root, 'precache.json'), JSON.stringify({ version, files }, null, 0));
  console.log(`precache.json : ${files.length} fichiers, version ${version}`);
}
