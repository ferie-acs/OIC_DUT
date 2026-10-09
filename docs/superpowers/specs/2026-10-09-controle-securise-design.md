# Contrôle sécurisé du DUT (lot 1) — spécification de conception

**Date** : 2026-10-09
**Statut** : conception validée en dialogue, implémentation non commencée
**Référence** : `docs/securite/2026-10-09-methodologie-securisation-dut.md` (table ronde à cinq voix)
**Périmètre** : le geste de contrôle au bord de la route, dans le POC statique. Lot 2 (émission : validation par seuil, quatre yeux, plafonds) et lot 3 (journal chaîné) viendront ensuite.

---

## 1. Objectif

Faire du POC une **démonstration de conception de sécurité**, pas seulement d'un workflow. Au scan d'un QR, le POC doit enchaîner six vérifications et rendre un verdict **vert / orange / rouge** avec ses motifs, y compris sans réseau. Public : les décideurs qui verront la démo ; ils doivent *voir* le QR signé, l'orange hors ligne, le voyage impossible, le DUT piège et la dérogation tracée.

**Ce que le POC démontre sans le garantir** : la clé privée vit dans le navigateur. Le POC l'écrit à côté du QR : « clé de démonstration — en production, coffre matériel ». Aucun faux-semblant.

## 2. Décisions actées

| Sujet | Décision |
|---|---|
| Structure du code | Un **pipeline de vérificateurs** : six fonctions pures, une par vérification, enchaînées par `verification.service.js` qui replie leurs constats en verdict. La vue n'appelle que le verdict. |
| Clé de signature | ECDSA P-256 (Web Crypto, aucune dépendance), générée à l'ensemencement si absente, stockée en LocalStorage, marquée `demo: true`. Pas de rotation dans ce lot. |
| Format du QR | Un seul schéma, `oicdut://v2/<charge>.<signature>`. **L'ancien format `oicdut://verify/<uuid>` est abandonné** : la démo est locale et ses données sont ensemencées, on les régénère. La charge est un JSON compact en base64url ; la signature porte sur les octets de la charge encodée. COSE/CWT serait le format cible en production ; le JSON signé démontre le même principe sans bibliothèque. |
| Hors ligne | Simulé par un interrupteur dans l'écran de contrôle, en plus de `navigator.onLine`. Jamais de vert hors ligne. |
| Position du contrôle | Sélecteur « poste de contrôle » (les antennes, qui ont des coordonnées) + géolocalisation navigateur en option. |
| Validation par antenne | Hors périmètre ici ; remplacée par la validation par seuil au lot 2 (décision produit prise). |

## 3. Le QR signé

### 3.1 Charge

```json
{ "v": 2, "kid": "demo-2026-10", "uid": "<uuid du jeton>", "num": "CI-2026-004812",
  "plq": "AA-0000-AA", "nbf": "2026-10-09", "exp": "2026-10-16" }
```

- `uid` : le jeton opaque existant (`dut.qrToken`), qui sert toujours à retrouver le DUT.
- `plq` : immatriculation du véhicule (`dut.general.immatriculation`). Déjà visible sur le camion : rien ne fuit.
- `nbf` / `exp` : fenêtre de validité. `nbf` = date de validation ; `exp` = `nbf` + `validityDays` (paramètre, défaut 7).
- **Jamais** : marchandise, parties, prix, conducteur.

### 3.2 Signature

- Moment : à la **validation** du DUT, quand le numéro est attribué (`dut.service`), par le « serveur » — ici le navigateur de l'antenne, ce que le POC assume.
- Algorithme : ECDSA P-256 avec SHA-256, `crypto.subtle`.
- Stockage : `dut.qrSigned = "<charge_b64url>.<signature_b64url>"` à côté de `dut.qrToken` (champ additif).
- Rendu : `qr.service` dessine `oicdut://v2/<qrSigned>`. Un DUT validé sans `qrSigned` est une erreur de données, pas un cas à tolérer.
- Clé : `signing-key.repository` ↔ LocalStorage `dut_signing_key_v1` : `{ kid, publicJwk, privateJwk, createdAt, demo: true }`.

### 3.3 Lecture

`parseQr(raw)` → `{ format: 'v2' | 'invalid', token, payload?, signature? }`. Pour `v2`, `token = payload.uid`. Tout ce qui ne commence pas par `oicdut://v2/`, ou dont la charge ne se décode pas, est `invalid`.

## 4. Le pipeline de vérification

### 4.1 Contrat

```js
// verification.service.js
export async function verify(raw, context) → verdict
```

`context` : `{ now, online, post: {id, name, lat, lng} | null, geo: {lat, lng} | null }`.

`verdict` :
```js
{
  level: 'VERT' | 'ORANGE' | 'ROUGE' | 'INCONNU',
  findings: [{ check, severity: 'ok'|'info'|'warn'|'block', message }],
  dut, token, format, mode: 'EN_LIGNE' | 'HORS_LIGNE', crlAgeHours
}
```

### 4.2 Les six vérificateurs

Chacun est une fonction `(ctx) => finding | null` (ou promesse), exportée pour être testée seule. `ctx` étend `context` avec `parsed`, `dut`, `key`, `crl`, `controls`.

| Ordre | Vérificateur | Source | Résultat |
|---|---|---|---|
| 1 | `checkSignature` | clé publique | signature invalide → **block** « faux document » ; crypto indisponible → **warn** « signature non vérifiable ». |
| 2 | `checkValidity` | charge | `now < nbf` ou `now > exp` → **block** « hors période de validité ». |
| 3 | `checkStatus` | dépôt des DUT (en ligne seulement) | SUSPENDU → **block**, RETIRÉ → **block**, VALIDÉ → ok, introuvable → **block** « non reconnu ». Hors ligne → **info** « statut non consultable ». |
| 4 | `checkRevocation` | liste locale (hors ligne seulement) | `uid` dans la liste → **block** ; âge > `crlWarnHours` (24) → **warn** ; âge > `crlMaxHours` (72) → **block** spécial `NON_OPPOSABLE`. |
| 5 | `checkTravel` | journal des contrôles | dernier contrôle du même DUT : vitesse = distance / heures ; > `maxSpeedKmh` (90) → **block** « voyage impossible : vu à X il y a Y h, à Z km ». |
| 6 | `checkCanary` | `dut.canary` | vrai → **block** « DUT piège », et audit `CANARY_TRIGGERED`. |

Distance : formule de Haversine sur les coordonnées du poste (ou de la géolocalisation si fournie, prioritaire).

### 4.3 Repli en verdict

- Un `block` `NON_OPPOSABLE` → `INCONNU` (« contrôle non opposable : liste trop ancienne, reconnectez-vous »).
- Sinon un `block` → `ROUGE`.
- Sinon un `warn` → `ORANGE`.
- Sinon hors ligne → `ORANGE` (« authentique, liste à jour il y a X h » — **jamais vert hors ligne**).
- Sinon → `VERT`.

### 4.4 Enregistrement

`control.service.verifyScan(raw, context)` devient `async`, appelle `verify`, puis journalise l'entrée de contrôle enrichie : `verdict.level`, `mode`, `postId`, `postName`, `findings`, `lat`, `lng`. L'audit `DUT_CONTROLLED` note le niveau.

## 5. Hors ligne et liste de révocation

- `revocations.repository` ↔ `dut_crl_v1` : `{ syncedAt, entries: [{ uid, status, at }] }`.
- `revocation.service.sync()` : construit la liste depuis le dépôt des DUT (statuts SUSPENDU / RETIRÉ dont `exp` n'est pas passé), horodate `syncedAt`, audite `CRL_SYNCED`. Appelée automatiquement à l'ouverture de l'écran de contrôle **si en ligne**.
- `control-settings.repository` ↔ `dut_control_settings_v1` : `{ offlineSimulated: bool, clockOffsetHours: number, postId: string|null }`.
- **Horloge de démonstration** : `now = Date.now() + clockOffsetHours`. Elle sert **uniquement** aux calculs d'âge et de validité pendant la démo ; les horodatages journalisés restent l'heure réelle. Deux boutons : « vieillir la liste de 24 h », « remettre à l'heure ».
- Mode effectif : `online = navigator.onLine && !offlineSimulated`.

## 6. Voyage impossible, DUT pièges, dérogation

- **Poste de contrôle** : sélecteur alimenté par le dépôt des antennes ; choix mémorisé. Bouton « utiliser ma position » (géolocalisation, refus toléré).
- **Canari** : champ additif `dut.canary: true`. L'ensemencement en crée **un**, statut VALIDÉ, numéro et plaque plausibles, invisible dans les listes partenaires (filtré), visible dans l'admin avec une étiquette « piège ». Le scanner → `ROUGE` + audit `CANARY_TRIGGERED` + toast au siège.
- **Dérogation** : quand le verdict est `ROUGE` ou `ORANGE`, bouton « Laisser passer avec dérogation ». Formulaire : motif obligatoire parmi `PANNE_VEHICULE`, `CHANGEMENT_TRACTEUR`, `RETARD_LEGITIME`, `QR_ILLISIBLE`, `AUTRE` (note obligatoire si AUTRE). Enregistrée dans `dut_derogations_v1` : `{ id, controlId, dutId, dutNumber, agentId, agentLabel, reason, note, date, verdictLevel }`. Audit `DUT_DEROGATION`. Un verdict `INCONNU` n'offre pas de dérogation : il demande la reconnexion.

## 7. Écran de contrôle

- En tête : poste de contrôle, interrupteur « réseau coupé (simulation) », âge de la liste, boutons d'horloge de démonstration.
- Résultat : bandeau selon le niveau (`valid` vert, `suspended` orange, `withdrawn` rouge, `unknown` gris — classes existantes), **liste des constats** (une ligne par vérificateur, avec son icône), rappel du mode.
- Sous le QR, dans l'aperçu et le PDF : mention « QR signé — clé de démonstration ».
- Dérogation : formulaire inline après le résultat.
- Ancien bloc « vérifier l'empreinte imprimée » : conservé tel quel.

## 8. Ensemencement (additif, jamais destructif)

- Génère la clé si absente.
- Signe **tous** les DUT VALIDÉS, SUSPENDUS ou RETIRÉS de la démo (ils ont un numéro) et pose `qrSigned`. Les données ensemencées avant ce lot sont **régénérées** au prochain chargement (version d'ensemencement incrémentée) — autorisé explicitement : démo locale, aucune donnée réelle.
- Ajoute le DUT canari.
- La constante `QR_SCHEME` devient `oicdut://v2/` ; `extractToken` disparaît au profit de `parseQr`.

## 9. Erreurs et dégradations

| Situation | Comportement |
|---|---|
| `crypto.subtle` absent | `checkSignature` rend **warn** « non vérifiable », le reste continue. Jamais d'exception. |
| QR malformé | `format: 'invalid'` → `INCONNU` « QR non reconnu ». |
| Clé absente au contrôle | **warn** « clé de vérification absente », statut en ligne fait foi. |
| Géolocalisation refusée | sélecteur de poste seul ; sans poste, `checkTravel` rend **info** « position inconnue ». |
| Liste jamais synchronisée, hors ligne | `INCONNU` non opposable. |
| Aucun contrôle antérieur | `checkTravel` ok. |

## 10. Tests (`tests/verification.test.mjs`, Node 22 : `globalThis.crypto.subtle` disponible)

1. Signature : aller-retour signer/vérifier ; charge altérée d'un octet → invalide ; mauvaise clé → invalide.
2. `parseQr` : v2, legacy, invalide, préfixe seul.
3. Validité : avant `nbf`, après `exp`, dedans.
4. Repli : chaque combinaison de constats donne le niveau attendu ; hors ligne sans constat → ORANGE ; `NON_OPPOSABLE` → INCONNU.
5. Révocation : présent → block ; âge 23 h → rien ; 25 h → warn ; 73 h → NON_OPPOSABLE.
6. Voyage : Abidjan→Bouaké (~300 km) en 1 h → block ; en 6 h → ok ; sans position → info.
7. Canari : block + action d'audit.
8. Dérogation : motif absent → erreur explicite ; `AUTRE` sans note → erreur ; valide → enregistrée et auditée.
9. Ensemencement : tout DUT numéroté de la démo porte un `qrSigned` dont la signature se vérifie avec la clé ensemencée ; aucun QR au format `oicdut://verify/` ne subsiste dans les données.
10. Garde-fou : `verifyScan` sans réseau et sans liste rend `INCONNU`, pas d'exception.

## 11. Hors périmètre

Validation par seuil, quatre yeux, plafonds, révocation par plage (lot 2). Journal chaîné et ancrage (lot 3). Rotation de clé, attestation d'appareil, photo de plaque, bénéficiaire effectif. Vrai mode hors ligne (service worker) : la simulation suffit à la démo.

## 12. Fichiers

| Fichier | Rôle |
|---|---|
| `js/services/signing.service.js` (nouveau) | génération, chargement, signature, vérification |
| `js/repositories/signing-key.repository.js` (nouveau) | clé en LocalStorage |
| `js/services/qr.service.js` (modifié) | `parseQr`, `buildSignedUri`, suppression de `extractToken`, mention « clé de démonstration » |
| `js/services/verification.service.js` (nouveau) | pipeline, six vérificateurs, repli, Haversine |
| `js/services/revocation.service.js` + `js/repositories/revocations.repository.js` (nouveaux) | liste locale |
| `js/repositories/control-settings.repository.js` (nouveau) | hors-ligne simulé, horloge, poste |
| `js/services/control.service.js` (modifié) | `verifyScan` async enrichi ; `recordDerogation` |
| `js/repositories/controls.repository.js` (modifié) | dérogations |
| `js/services/dut.service.js` (modifié) | signature à la validation |
| `js/seed.js` (modifié) | clé, signature des validés, canari |
| `js/views/control.view.js` (modifié) | poste, interrupteur, verdict, constats, dérogation |
| `js/core/constants.js` (modifié) | clés de stockage, actions d'audit, niveaux, motifs |
| `tests/verification.test.mjs` (nouveau) | § 10 |
