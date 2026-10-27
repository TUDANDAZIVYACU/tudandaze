// lib/import-clients.ts
// Logique pure (sans base de données) de l'import des clients d'un assureur depuis un fichier Excel,
// et du rapprochement avec la fiche importée au moment de l'inscription du client.
//
// Une fiche « en attente » est une fiche importée par l'assureur et jamais utilisée :
// elle n'a ni email ni téléphone de connexion (ils sont renseignés quand le client s'inscrit).

export type LigneImport = { ligne: number; nom: string; rc: string; nif: string }

export type ClientExistant = {
  id: string
  name: string
  numeroPolice: string | null // RC
  nif: string | null
  email: string | null
  telephone: string | null
}

export type LigneIgnoree = { ligne: number; nom: string; raison: string }

export const MAX_LIGNES_IMPORT = 2000

// Compare les RC / NIF sans tenir compte des espaces ni de la casse
export function normaliserCle(valeur: string): string {
  return valeur.replace(/\s+/g, "").toUpperCase()
}

export function estEnAttente(client: { email: string | null; telephone: string | null }): boolean {
  return !client.email && !client.telephone
}

export function planifierImport(lignes: LigneImport[], existants: ClientExistant[]) {
  const ignores: LigneIgnoree[] = []
  const aCreer: { nom: string; rc: string; nif: string }[] = []
  const aMettreAJour: { id: string; nom: string; nif: string }[] = []

  // Fiche existante par RC (une fiche en attente est prioritaire si le RC apparaît plusieurs fois)
  const parRc = new Map<string, ClientExistant>()
  for (const c of existants) {
    if (!c.numeroPolice) continue
    const cle = normaliserCle(c.numeroPolice)
    const deja = parRc.get(cle)
    if (!deja || (!estEnAttente(deja) && estEnAttente(c))) parRc.set(cle, c)
  }

  const vus = new Set<string>()
  for (const l of lignes) {
    const nom = String(l.nom ?? "").trim()
    const rc = String(l.rc ?? "").trim()
    const nif = String(l.nif ?? "").trim()

    if (!nom || !rc || !nif) {
      ignores.push({ ligne: l.ligne, nom: nom || "—", raison: "Ligne incomplète (nom, RC et NIF sont requis)." })
      continue
    }
    if (nom.length > 200 || rc.length > 50 || nif.length > 50) {
      ignores.push({ ligne: l.ligne, nom, raison: "Valeur trop longue." })
      continue
    }

    const cle = normaliserCle(rc)
    if (vus.has(cle)) {
      ignores.push({ ligne: l.ligne, nom, raison: "RC en double dans le fichier." })
      continue
    }
    vus.add(cle)

    const existant = parRc.get(cle)
    if (!existant) {
      aCreer.push({ nom, rc, nif })
      continue
    }
    if (!estEnAttente(existant)) {
      ignores.push({ ligne: l.ligne, nom, raison: "Client déjà inscrit avec ce RC." })
      continue
    }
    if (existant.name === nom && (existant.nif ?? "") === nif) {
      ignores.push({ ligne: l.ligne, nom, raison: "Déjà dans votre liste (inchangé)." })
      continue
    }
    // Fiche en attente dont le nom ou le NIF a été corrigé dans le fichier : on la met à jour
    aMettreAJour.push({ id: existant.id, nom, nif })
  }

  return { aCreer, aMettreAJour, ignores }
}

export type ResultatRecherche =
  | { type: "aucune" }
  | { type: "deja_inscrit" }
  | { type: "nif_different" }
  | { type: "a_completer"; id: string }

// À l'inscription : le client a-t-il déjà une fiche importée par son assureur (même RC, même NIF) ?
export function chercherFicheImportee(rc: string, nif: string, existants: ClientExistant[]): ResultatRecherche {
  const cle = normaliserCle(rc)
  const memeRc = existants.filter((c) => c.numeroPolice && normaliserCle(c.numeroPolice) === cle)
  if (memeRc.length === 0) return { type: "aucune" }

  const enAttente = memeRc.find(estEnAttente)
  if (!enAttente) return { type: "deja_inscrit" }
  if (!enAttente.nif || normaliserCle(enAttente.nif) !== normaliserCle(nif)) return { type: "nif_different" }
  return { type: "a_completer", id: enAttente.id }
}
