// Lot d1 : entrées de menu des comptes et acteurs, ajoutées à la fin du menu existant.
export function lotD1NavSections(user, sections) {
  if (user.role === 'PARTNER_ADMIN') sections.push({ label: 'Mon entreprise', items: [{ path: '/entreprise', label: 'Fiche de l’entreprise', icon: 'building2' }, { path: '/entreprise/utilisateurs', label: 'Agents', icon: 'users' }, { path: '/entreprise/activite', label: 'Activité des agents', icon: 'barChart' }] });
  if (user.role === 'TRANSPORTEUR') sections.push({ label: 'Mon entreprise', items: [{ path: '/entreprise', label: 'Fiche et dossier', icon: 'building2' }, ...(user.companyAdmin ? [{ path: '/entreprise/utilisateurs', label: 'Utilisateurs', icon: 'users' }] : []), { path: '/entreprise/vehicules', label: 'Véhicules', icon: 'truck' }] });
  if (user.role === 'OIC_ADMIN') {
    sections.push({ label: 'Acteurs', items: [{ path: '/oic/acteurs/partenaires', label: 'Partenaires habilités', icon: 'layers' }, { path: '/oic/acteurs/transporteurs', label: 'Transporteurs', icon: 'truck' }, { path: '/oic/acteurs/demandes', label: 'Demandes à valider', icon: 'checkCircle' }, { path: '/oic/acteurs/import', label: 'Import de l’existant', icon: 'upload' }] });
    sections.find((s) => s.label === 'Administration')?.items.push({ path: '/admin/habilitations', label: 'Habilitations', icon: 'keyRound' }, { path: '/admin/groupements', label: 'Groupements', icon: 'building2' }, { path: '/admin/messages', label: 'Messages envoyés', icon: 'mail' });
  }
  sections.push({ label: 'Mon compte', items: [{ path: '/mon-profil', label: 'Mon profil', icon: 'user' }, { path: '/mes-messages', label: 'Mes messages', icon: 'inbox' }] });
}
