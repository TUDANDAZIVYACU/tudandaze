// lib/acces-cache.ts
// Garde en mémoire, quelques minutes, le résultat de la vérification d'accès d'un utilisateur.
// Sans cela, proxy.ts appelait Clerk (et la base de données) à CHAQUE requête, y compris à chaque
// appel serveur d'une page : environ 2,5 s d'attente par appel depuis Bujumbura.
//
// - Seuls les accès valides (propriétaire, assureur, client) sont gardés. Un compte « à inscrire » ou
//   « refusé » est toujours revérifié : une inscription ou une réactivation prend effet tout de suite.
// - Plusieurs requêtes simultanées du même utilisateur partagent une seule vérification.
// - Une suspension peut mettre jusqu'à DUREE_CACHE_MS à bloquer l'accès aux PAGES ; les données restent
//   protégées immédiatement, car chaque fonction serveur revérifie que le client est actif.
import type { Acces } from '@/lib/acces'

export const DUREE_CACHE_MS = 2 * 60 * 1000
const TAILLE_MAX = 500

type Entree = { acces: Acces; expire: number }

const cache = new Map<string, Entree>()
const enCours = new Map<string, Promise<Acces>>()

export async function accesAvecCache(userId: string, charger: () => Promise<Acces>): Promise<Acces> {
  const entree = cache.get(userId)
  if (entree) {
    if (entree.expire > Date.now()) return entree.acces
    cache.delete(userId)
  }

  const existante = enCours.get(userId)
  if (existante) return existante

  const promesse = charger()
    .then((acces) => {
      if (acces.type === 'refuse' || acces.type === 'inscription') {
        cache.delete(userId)
      } else {
        if (cache.size >= TAILLE_MAX) cache.clear()
        cache.set(userId, { acces, expire: Date.now() + DUREE_CACHE_MS })
      }
      return acces
    })
    .finally(() => {
      enCours.delete(userId)
    })

  enCours.set(userId, promesse)
  return promesse
}

// À appeler pour forcer une nouvelle vérification (ex. juste après une inscription)
export function oublierAcces(userId: string) {
  cache.delete(userId)
}
