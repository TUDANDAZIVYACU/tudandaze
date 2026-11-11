import { prisma } from "@/lib/prisma"
import { withRetry } from "@/lib/retry"
import { dateValide } from "@/lib/stock"
import { getPlan } from "@/lib/plans"

// Calculs d'abonnement partagés par l'espace agent vendeur et l'administration (super admin).
// Les vérifications d'accès restent dans les actions qui appellent ces fonctions.

export type BornesDates = { gte?: Date; lte?: Date }

// Bornes (heure du Burundi, UTC+2) d'un filtre par dates AAAA-MM-JJ ; une date vide = pas de borne
export function bornesDates(dateDebut?: string, dateFin?: string): BornesDates {
    const debut = (dateDebut ?? "").trim()
    const fin = (dateFin ?? "").trim()
    if ((debut && !dateValide(debut)) || (fin && !dateValide(fin))) {
        throw new Error("Date invalide (format attendu : AAAA-MM-JJ).")
    }
    if (debut && fin && debut > fin) throw new Error("La date de début doit être avant la date de fin.")
    return {
        gte: debut ? new Date(`${debut}T00:00:00+02:00`) : undefined,
        lte: fin ? new Date(`${fin}T23:59:59.999+02:00`) : undefined
    }
}

// Recule une date d'un nombre de mois
function reculerMois(date: Date, mois: number) {
    const d = new Date(date)
    d.setMonth(d.getMonth() - mois)
    return d
}

// Valeur d'un abonnement payé encore en cours : somme des paiements confirmés dont la période payée n'est pas terminée.
// On part de la date de fin de l'abonnement et on remonte, paiement par paiement (du plus récent au plus ancien),
// en reculant de la durée de chaque plan : un paiement compte tant que sa période se termine dans le futur.
// (Les mois payés à l'avance s'ajoutent à la fin de l'abonnement, comme dans le webhook Lumicash.)
function montantAbonnementEnCours(
    dateFin: Date,
    paiements: { montant: number; plan: string; createdAt: Date }[],
    maintenant: Date
) {
    const recents = [...paiements].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    let fin = dateFin
    let total = 0
    for (const p of recents) {
        if (fin <= maintenant) break
        total += p.montant
        fin = reculerMois(fin, getPlan(p.plan)?.mois ?? 1)
    }
    return total
}

export type InfosAbonnement = {
    // État de l'abonnement (null : aucun abonnement enregistré)
    abonnement: { etat: "essai" | "actif" | "expire"; plan: string | null; dateFin: Date } | null
    // Paiements confirmés dont la période payée est encore en cours (0 pour un essai ou un abonnement expiré)
    montantEnCours: number
    // Paiements confirmés faits sur la période choisie (tous les paiements si aucune date) et leur nombre
    montantPaye: number
    nombrePaiements: number
}

export const SANS_ABONNEMENT: InfosAbonnement = {
    abonnement: null,
    montantEnCours: 0,
    montantPaye: 0,
    nombrePaiements: 0
}

// Abonnement et paiements confirmés de plusieurs clients, en deux requêtes seulement
export async function abonnementsDesClients(ids: string[], bornes: BornesDates) {
    const resultat = new Map<string, InfosAbonnement>()
    if (ids.length === 0) return resultat

    // Séquentiel pour ménager la connexion en réseau instable
    const abonnements = await withRetry(() =>
        prisma.abonnement.findMany({
            where: { businessbiId: { in: ids } },
            select: { businessbiId: true, statut: true, plan: true, dateFin: true }
        })
    )
    const paiementsConfirmes = await withRetry(() =>
        prisma.paiementAbonnement.findMany({
            where: { businessbiId: { in: ids }, statut: "confirme" },
            select: { businessbiId: true, plan: true, montant: true, createdAt: true }
        })
    )

    const abonnementParClient = new Map(abonnements.map(a => [a.businessbiId, a]))
    const paiementsParClient = new Map<string, { montant: number; plan: string; createdAt: Date }[]>()
    const sommeParClient = new Map<string, { montant: number; nombre: number }>()

    for (const p of paiementsConfirmes) {
        const liste = paiementsParClient.get(p.businessbiId) ?? []
        liste.push({ montant: p.montant, plan: p.plan, createdAt: p.createdAt })
        paiementsParClient.set(p.businessbiId, liste)

        // Somme sur la période choisie (sans dates : tous les paiements)
        if ((!bornes.gte || p.createdAt >= bornes.gte) && (!bornes.lte || p.createdAt <= bornes.lte)) {
            const actuel = sommeParClient.get(p.businessbiId) ?? { montant: 0, nombre: 0 }
            actuel.montant += p.montant
            actuel.nombre += 1
            sommeParClient.set(p.businessbiId, actuel)
        }
    }

    const maintenant = new Date()

    for (const id of ids) {
        const ab = abonnementParClient.get(id)
        let abonnement: InfosAbonnement["abonnement"] = null
        let montantEnCours = 0

        if (ab) {
            const enCours = ab.dateFin > maintenant
            const etat = !enCours ? "expire" : ab.statut === "essai" ? "essai" : "actif"
            abonnement = { etat, plan: ab.plan, dateFin: ab.dateFin }
            // L'essai gratuit n'a rien rapporté : seuls les abonnements payés comptent
            if (etat === "actif") {
                montantEnCours = montantAbonnementEnCours(ab.dateFin, paiementsParClient.get(id) ?? [], maintenant)
            }
        }

        const somme = sommeParClient.get(id)
        resultat.set(id, {
            abonnement,
            montantEnCours,
            montantPaye: somme?.montant ?? 0,
            nombrePaiements: somme?.nombre ?? 0
        })
    }

    return resultat
}

// Historique des paiements d'abonnement d'un client (du plus récent au plus ancien), limité à une période si elle est donnée
export async function historiquePaiements(businessbiId: string, bornes: BornesDates) {
    const paiements = await withRetry(() =>
        prisma.paiementAbonnement.findMany({
            where: { businessbiId, createdAt: { gte: bornes.gte, lte: bornes.lte } },
            orderBy: { createdAt: "desc" },
            take: 100,
            select: { id: true, createdAt: true, plan: true, montant: true, statut: true, codeTrans: true }
        })
    )
    return paiements.map(p => ({
        id: p.id,
        createdAt: p.createdAt,
        duree: getPlan(p.plan)?.label ?? p.plan,
        montant: p.montant,
        statut: p.statut,
        codeTrans: p.codeTrans
    }))
}
