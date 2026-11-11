"use server";

import { prisma } from "@/lib/prisma"
import { currentUser } from "@clerk/nextjs/server"
import { resoudreAcces } from "@/lib/acces"
import { calculerStock, dateValide, finDeJournee } from "@/lib/stock"
import { nettoyerContact, verifierIdentifiantsLibres } from "@/lib/contacts"
import { executer } from "@/lib/resultat"
import { withRetry } from "@/lib/retry"
import { accesAvecCache } from "@/lib/acces-cache"
import { abonnementsDesClients, bornesDates, historiquePaiements, SANS_ABONNEMENT } from "@/lib/stats-abonnement"

// Toutes les fonctions de ce fichier lisent l'identité côté serveur (Clerk) :
// aucun email ni identifiant envoyé par le navigateur n'est cru.
// Un agentvendeur ne voit et ne modifie que SES clients.
// Les clients s'enregistrent eux-mêmes avec son code (actions-inscription.ts).
async function exigerAgentVendeur(ecriture = false) {
    const user = await currentUser()
    if (!user) throw new Error("Non connecté.")

    const acces = await accesAvecCache(user.id, () => withRetry(() => resoudreAcces(user)))
    if (acces.type !== "agentvendeur") throw new Error("Accès réservé aux agentvendeurs.")
    if (ecriture && acces.role !== "ADMIN") {
        throw new Error("Action réservée aux administrateurs de l'agentvendeur.")
    }
    return acces
}

// Jour précédent d'une date AAAA-MM-JJ
function jourPrecedent(date: string) {
    const d = new Date(date + "T00:00:00Z")
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
}

// Informations de l'agentvendeur connecté (pour l'en-tête de son tableau de bord)
export async function getMonAgentVendeur() {
    const acces = await exigerAgentVendeur()
    const agentvendeur = await withRetry(() =>
        prisma.agentvendeur.findUnique({
            where: { id: acces.agentvendeurId },
            select: { id: true, nom: true, code: true }
        })
    )
    if (!agentvendeur) throw new Error("AgentVendeur introuvable.")
    return { ...agentvendeur, role: acces.role }
}

const MESSAGES_SURS = [
    "Non connecté.",
    "Accès réservé aux agentvendeurs.",
    "Action réservée aux administrateurs de l'agentvendeur.",
    "Date invalide (format attendu : AAAA-MM-JJ).",
    "La date de début doit être avant la date de fin."
]

// Liste des clients de l'agentvendeur, avec l'état de leur abonnement et leurs paiements confirmés :
// - montantEnCours : paiements confirmés dont la période payée est encore en cours (abonnement actif), quelles que soient les dates ;
// - montantPaye / nombrePaiements : paiements confirmés faits entre dateDebut et dateFin (sans dates : tous les paiements).
// (un client sans email ni téléphone est une fiche qui attend l'inscription du client)
export async function getClientsAgentVendeur(dateDebut?: string, dateFin?: string) {
    const acces = await exigerAgentVendeur()
    const bornes = bornesDates(dateDebut, dateFin)

    const clients = await withRetry(() =>
        prisma.businessbi.findMany({
            where: { agentvendeurId: acces.agentvendeurId },
            select: {
                id: true,
                name: true,
                email: true,
                telephone: true,
                accesActif: true,
                createdAt: true
            },
            orderBy: { name: "asc" }
        })
    )

    const infos = await abonnementsDesClients(clients.map(c => c.id), bornes)
    return clients.map(c => ({ ...c, ...(infos.get(c.id) ?? SANS_ABONNEMENT) }))
}

// Historique des paiements d'abonnement d'un client de l'agentvendeur (du plus récent au plus ancien),
// éventuellement limité à une période (dates AAAA-MM-JJ, bornes incluses)
export async function getPaiementsClient(clientId: string, dateDebut?: string, dateFin?: string) {
    try {
        const acces = await exigerAgentVendeur()
        const bornes = bornesDates(dateDebut, dateFin)

        const client = await withRetry(() =>
            prisma.businessbi.findFirst({
                where: { id: clientId, agentvendeurId: acces.agentvendeurId },
                select: { id: true }
            })
        )
        if (!client) return { success: false as const, message: "Client introuvable." }

        return { success: true as const, paiements: await historiquePaiements(client.id, bornes) }
    } catch (error) {
        console.error(error)
        const message = error instanceof Error ? error.message : ""
        return {
            success: false as const,
            message: MESSAGES_SURS.includes(message)
                ? message
                : "Erreur réseau ou serveur. Réessayez dans un instant."
        }
    }
}

// Stock d'un client à une date donnée (AAAA-MM-JJ) : c'est l'état à assurer en cas de sinistre.
// Sans date, on prend aujourd'hui (heure du Burundi).
export async function getStockClientALaDate(businessbiId: string, dateFiltre?: string) {
    return executer(async () => {
        const acces = await exigerAgentVendeur()

        const date = dateFiltre && dateFiltre.trim()
            ? dateFiltre.trim()
            : new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Bujumbura" })
        if (!dateValide(date)) throw new Error("Date invalide (format attendu : AAAA-MM-JJ).")

        const client = await withRetry(() =>
            prisma.businessbi.findFirst({
                where: { id: businessbiId, agentvendeurId: acces.agentvendeurId },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    telephone: true,
                    numeroPolice: true,
                    accesActif: true
                }
            })
        )
        if (!client) throw new Error("Client introuvable.")

        const lignes = await withRetry(() => calculerStock(client.id, date))
        const articles = lignes
            .filter(l => l.quantity > 0)
            .map(l => ({
                id: l.product.id,
                nom: l.product.name,
                unite: l.product.unit,
                quantite: l.quantity,
                prixAchat: l.prixAchat,
                prixVente: l.prixVente,
                valeurAchat: l.valeurAchat,
                valeurVente: l.valeurVente
            }))

        return {
            client,
            date,
            genereLe: new Date().toISOString(),
            articles,
            totalQuantite: articles.reduce((acc, a) => acc + a.quantite, 0),
            totalValeurAchat: articles.reduce((acc, a) => acc + a.valeurAchat, 0),
            totalValeurVente: articles.reduce((acc, a) => acc + a.valeurVente, 0)
        }
    })
}

// Variation du stock d'un client sur une période [dateDebut ; dateFin] (AAAA-MM-JJ, bornes incluses).
// Stock initial = fin de journée de la veille de dateDebut ; stock final = fin de journée de dateFin.
// Entrées = approvisionnements (IN) de la période + quantité de départ des produits créés pendant la période.
// Sorties = ventes (OUT) de la période.
// Approvisionnements = liste détaillée des entrées (IN) de la période, avec la photo de la facture si elle existe.
export async function getVariationStockClient(businessbiId: string, dateDebut: string, dateFin: string) {
    return executer(async () => {
        const acces = await exigerAgentVendeur()

        const debut = (dateDebut || "").trim()
        const fin = (dateFin || "").trim()
        if (!dateValide(debut) || !dateValide(fin)) {
            throw new Error("Date invalide (format attendu : AAAA-MM-JJ).")
        }
        if (debut > fin) throw new Error("La date de début doit être avant la date de fin.")

        const client = await withRetry(() =>
            prisma.businessbi.findFirst({
                where: { id: businessbiId, agentvendeurId: acces.agentvendeurId },
                select: { id: true, name: true, numeroPolice: true }
            })
        )
        if (!client) throw new Error("Client introuvable.")

        const veille = jourPrecedent(debut)
        const borneDebut = finDeJournee(veille) // exclue
        const borneFin = finDeJournee(fin)      // incluse

        // Séquentiel pour ménager la connexion en réseau instable
        const avant = await withRetry(() => calculerStock(client.id, veille))
        const apres = await withRetry(() => calculerStock(client.id, fin))
        const mouvementsPeriode = await withRetry(() =>
            prisma.transaction.findMany({
                where: {
                    businessbiId: client.id,
                    OR: [
                        { type: "IN", dateApprovis: { gt: borneDebut, lte: borneFin } },
                        { type: "OUT", createdAt: { gt: borneDebut, lte: borneFin } }
                    ]
                },
                select: {
                    id: true,
                    productId: true,
                    type: true,
                    quantity: true,
                    prixAchat: true,
                    dateApprovis: true,
                    factureUrl: true,
                    product: { select: { name: true, unit: true } }
                },
                orderBy: { dateApprovis: "desc" }
            })
        )

        const map = new Map<string, {
            id: string
            nom: string
            unite: string
            quantiteDebut: number
            quantiteFin: number
            entrees: number
            sorties: number
            prixAchat: number
            valeurDebut: number
            valeurFin: number
        }>()

        for (const l of avant) {
            map.set(l.product.id, {
                id: l.product.id,
                nom: l.product.name,
                unite: l.product.unit,
                quantiteDebut: l.quantity,
                quantiteFin: 0,
                entrees: 0,
                sorties: 0,
                prixAchat: l.prixAchat,
                valeurDebut: l.valeurAchat,
                valeurFin: 0
            })
        }
        for (const l of apres) {
            const existant = map.get(l.product.id)
            if (existant) {
                existant.quantiteFin = l.quantity
                existant.valeurFin = l.valeurAchat
                existant.prixAchat = l.prixAchat
            } else {
                // Produit créé pendant la période : sa quantité de départ compte comme une entrée
                map.set(l.product.id, {
                    id: l.product.id,
                    nom: l.product.name,
                    unite: l.product.unit,
                    quantiteDebut: 0,
                    quantiteFin: l.quantity,
                    entrees: l.product.quantity,
                    sorties: 0,
                    prixAchat: l.prixAchat,
                    valeurDebut: 0,
                    valeurFin: l.valeurAchat
                })
            }
        }

        for (const m of mouvementsPeriode) {
            const ligne = map.get(m.productId)
            if (!ligne) continue
            if (m.type === "IN") ligne.entrees += m.quantity
            else ligne.sorties += m.quantity
        }

        const articles = Array.from(map.values())
            .filter(a => a.quantiteDebut > 0 || a.quantiteFin > 0 || a.entrees > 0 || a.sorties > 0)
            .map(a => ({
                ...a,
                variationQuantite: a.quantiteFin - a.quantiteDebut,
                variationValeur: a.valeurFin - a.valeurDebut
            }))
            .sort((x, y) => x.nom.localeCompare(y.nom))

        // Liste des approvisionnements de la période (avec lien vers la facture si elle existe)
        const approvisionnements = mouvementsPeriode
            .filter(m => m.type === "IN")
            .map(m => ({
                id: m.id,
                date: m.dateApprovis.toISOString(),
                article: m.product.name,
                unite: m.product.unit,
                quantite: m.quantity,
                prixAchat: m.prixAchat,
                total: m.prixAchat * m.quantity,
                factureUrl: m.factureUrl
            }))

        return {
            client,
            dateDebut: debut,
            dateFin: fin,
            genereLe: new Date().toISOString(),
            articles,
            approvisionnements,
            totalValeurDebut: articles.reduce((acc, a) => acc + a.valeurDebut, 0),
            totalValeurFin: articles.reduce((acc, a) => acc + a.valeurFin, 0),
            totalVariationValeur: articles.reduce((acc, a) => acc + a.variationValeur, 0)
        }
    })
}

// Modifie un client de l'agentvendeur (champs non fournis = inchangés)
export async function modifierClientAgentVendeur(
    id: string,
    data: { name?: string; email?: string; telephone?: string; numeroPolice?: string }
) {
    return executer(async () => {
        const acces = await exigerAgentVendeur(true)

        const client = await withRetry(() =>
            prisma.businessbi.findFirst({ where: { id, agentvendeurId: acces.agentvendeurId } })
        )
        if (!client) throw new Error("Client introuvable.")

        const changements: {
            name?: string
            email?: string | null
            telephone?: string | null
            numeroPolice?: string | null
        } = {}

        if (data.name !== undefined) {
            const name = data.name.trim()
            if (!name) throw new Error("Le nom du client est requis.")
            changements.name = name
        }

        if (data.numeroPolice !== undefined) {
            changements.numeroPolice = data.numeroPolice.trim() || null
        }

        if (data.email !== undefined || data.telephone !== undefined) {
            const contact = nettoyerContact(
                data.email !== undefined ? data.email : client.email,
                data.telephone !== undefined ? data.telephone : client.telephone
            )
            await verifierIdentifiantsLibres(contact, { businessbiId: id })
            changements.email = contact.email
            changements.telephone = contact.telephone
        }

        await withRetry(() => prisma.businessbi.update({ where: { id }, data: changements }))
    })
}

// Suspend ou réactive l'accès d'un client de l'agentvendeur
export async function basculerAccesClient(clientId: string, actif: boolean) {
    return executer(async () => {
        const { agentvendeurId } = await exigerAgentVendeur(true)
        const resultat = await withRetry(() =>
            prisma.businessbi.updateMany({
                where: { id: clientId, agentvendeurId },
                data: { accesActif: actif }
            })
        )
        if (resultat.count === 0) throw new Error("Client introuvable.")
    })
}
