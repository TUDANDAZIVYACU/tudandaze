"use server";

import { prisma } from "@/lib/prisma"
import { currentUser } from "@clerk/nextjs/server"
import { resoudreAcces } from "@/lib/acces"
import { calculerStock, dateValide, finDeJournee } from "@/lib/stock"
import { nettoyerContact, verifierIdentifiantsLibres } from "@/lib/contacts"
import { executer } from "@/lib/resultat"
import { withRetry } from "@/lib/retry"
import { MAX_LIGNES_IMPORT, planifierImport, type LigneImport } from "@/lib/import-clients"
import { accesAvecCache } from "@/lib/acces-cache"

// Toutes les fonctions de ce fichier lisent l'identité côté serveur (Clerk) :
// aucun email ni identifiant envoyé par le navigateur n'est cru.
// Un assureur ne voit et ne modifie que SES clients.
// Les clients s'enregistrent eux-mêmes avec son code (actions-inscription.ts),
// ou sont importés par l'assureur depuis un fichier Excel (importerClientsAssureur) puis complétés à leur inscription.
async function exigerAssureur(ecriture = false) {
    const user = await currentUser()
    if (!user) throw new Error("Non connecté.")

    const acces = await accesAvecCache(user.id, () => withRetry(() => resoudreAcces(user)))
    if (acces.type !== "assureur") throw new Error("Accès réservé aux assureurs.")
    if (ecriture && acces.role !== "ADMIN") {
        throw new Error("Action réservée aux administrateurs de l'assureur.")
    }
    return acces
}

// Jour précédent d'une date AAAA-MM-JJ
function jourPrecedent(date: string) {
    const d = new Date(date + "T00:00:00Z")
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
}

// Informations de l'assureur connecté (pour l'en-tête de son tableau de bord)
export async function getMonAssureur() {
    const acces = await exigerAssureur()
    const assureur = await withRetry(() =>
        prisma.assureur.findUnique({
            where: { id: acces.assureurId },
            select: { id: true, nom: true, code: true }
        })
    )
    if (!assureur) throw new Error("Assureur introuvable.")
    return { ...assureur, role: acces.role }
}

// Liste des clients de l'assureur
// (un client sans email ni téléphone est une fiche importée qui attend l'inscription du client)
export async function getClientsAssureur() {
    const acces = await exigerAssureur()
    const clients = await withRetry(() =>
        prisma.businessbi.findMany({
            where: { assureurId: acces.assureurId },
            select: {
                id: true,
                name: true,
                email: true,
                telephone: true,
                numeroPolice: true,
                nif: true,
                accesActif: true,
                createdAt: true,
                _count: { select: { products: true } }
            },
            orderBy: { name: "asc" }
        })
    )
    return clients.map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        telephone: c.telephone,
        numeroPolice: c.numeroPolice,
        nif: c.nif,
        accesActif: c.accesActif,
        createdAt: c.createdAt,
        nombreProduits: c._count.products
    }))
}

const MESSAGES_IMPORT_SURS = [
    "Non connecté.",
    "Accès réservé aux assureurs.",
    "Action réservée aux administrateurs de l'assureur."
]

// Importe une liste de clients (Nom de l'entreprise, RC, NIF) lue dans un fichier Excel par le navigateur.
// Chaque client importé est une fiche « en attente » : le client la complète (propriétaire, téléphone, secteur…)
// et la rattache à son compte quand il demande à rejoindre son assureur (actions-inscription.ts).
// Ré-importer un fichier corrigé met à jour les fiches encore en attente ; les clients déjà inscrits ne sont jamais modifiés.
export async function importerClientsAssureur(lignes: LigneImport[]) {
    try {
        const acces = await exigerAssureur(true)

        if (!Array.isArray(lignes) || lignes.length === 0) {
            return { success: false as const, message: "Le fichier ne contient aucun client à importer." }
        }
        if (lignes.length > MAX_LIGNES_IMPORT) {
            return {
                success: false as const,
                message: `Trop de lignes (${MAX_LIGNES_IMPORT} maximum par import). Découpez votre fichier.`
            }
        }

        const existants = await withRetry(() =>
            prisma.businessbi.findMany({
                where: { assureurId: acces.assureurId },
                select: { id: true, name: true, numeroPolice: true, nif: true, email: true, telephone: true }
            })
        )

        const plan = planifierImport(lignes, existants)

        if (plan.aCreer.length > 0) {
            await withRetry(() =>
                prisma.businessbi.createMany({
                    data: plan.aCreer.map((c) => ({
                        name: c.nom,
                        numeroPolice: c.rc,
                        nif: c.nif,
                        assureurId: acces.assureurId
                    }))
                })
            )
        }

        // Seules les fiches encore en attente (sans email ni téléphone) peuvent être mises à jour
        for (const m of plan.aMettreAJour) {
            await withRetry(() =>
                prisma.businessbi.updateMany({
                    where: { id: m.id, assureurId: acces.assureurId, email: null, telephone: null },
                    data: { name: m.nom, nif: m.nif }
                })
            )
        }

        return {
            success: true as const,
            ajoutes: plan.aCreer.length,
            misAJour: plan.aMettreAJour.length,
            ignores: plan.ignores
        }
    } catch (error) {
        console.error(error)
        const message = error instanceof Error ? error.message : ""
        return {
            success: false as const,
            message: MESSAGES_IMPORT_SURS.includes(message)
                ? message
                : "Erreur réseau ou serveur pendant l'import. Réessayez dans un instant."
        }
    }
}

// Stock d'un client à une date donnée (AAAA-MM-JJ) : c'est l'état à assurer en cas de sinistre.
// Sans date, on prend aujourd'hui (heure du Burundi).
export async function getStockClientALaDate(businessbiId: string, dateFiltre?: string) {
    return executer(async () => {
        const acces = await exigerAssureur()

        const date = dateFiltre && dateFiltre.trim()
            ? dateFiltre.trim()
            : new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Bujumbura" })
        if (!dateValide(date)) throw new Error("Date invalide (format attendu : AAAA-MM-JJ).")

        const client = await withRetry(() =>
            prisma.businessbi.findFirst({
                where: { id: businessbiId, assureurId: acces.assureurId },
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
        const acces = await exigerAssureur()

        const debut = (dateDebut || "").trim()
        const fin = (dateFin || "").trim()
        if (!dateValide(debut) || !dateValide(fin)) {
            throw new Error("Date invalide (format attendu : AAAA-MM-JJ).")
        }
        if (debut > fin) throw new Error("La date de début doit être avant la date de fin.")

        const client = await withRetry(() =>
            prisma.businessbi.findFirst({
                where: { id: businessbiId, assureurId: acces.assureurId },
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

// Modifie un client de l'assureur (champs non fournis = inchangés)
export async function modifierClientAssureur(
    id: string,
    data: { name?: string; email?: string; telephone?: string; numeroPolice?: string }
) {
    return executer(async () => {
        const acces = await exigerAssureur(true)

        const client = await withRetry(() =>
            prisma.businessbi.findFirst({ where: { id, assureurId: acces.assureurId } })
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

// Suspend ou réactive l'accès d'un client de l'assureur
export async function basculerAccesClient(clientId: string, actif: boolean) {
    return executer(async () => {
        const { assureurId } = await exigerAssureur(true)
        const resultat = await withRetry(() =>
            prisma.businessbi.updateMany({
                where: { id: clientId, assureurId },
                data: { accesActif: actif }
            })
        )
        if (resultat.count === 0) throw new Error("Client introuvable.")
    })
}