"use server";

import { prisma } from "@/lib/prisma"
import { currentUser } from "@clerk/nextjs/server"
import { resoudreAcces } from "@/lib/acces"
import { nettoyerContact, verifierIdentifiantsLibres } from "@/lib/contacts"
import { executer } from "@/lib/resultat"
import { withRetry } from "@/lib/retry"
import { accesAvecCache } from "@/lib/acces-cache"
import { abonnementsDesClients, bornesDates, historiquePaiements, SANS_ABONNEMENT } from "@/lib/stats-abonnement"

const MESSAGES_SURS = [
    "Non connecté.",
    "Accès réservé aux propriétaires de l'application.",
    "Date invalide (format attendu : AAAA-MM-JJ).",
    "La date de début doit être avant la date de fin."
]

// Toutes les fonctions de ce fichier sont réservées aux propriétaires de l'application
// (emails listés dans SUPER_ADMIN_EMAILS). L'identité est lue côté serveur (Clerk).
async function exigerOwner() {
    const user = await currentUser()
    if (!user) throw new Error("Non connecté.")

    const acces = await accesAvecCache(user.id, () => withRetry(() => resoudreAcces(user)))
    if (acces.type !== "owner") {
        throw new Error("Accès réservé aux propriétaires de l'application.")
    }
}

function genererCodeAgentVendeur(nom: string): string {
    const prefixe = nom
        .trim()
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, 3) || "ASS"
    const suffixe = Math.random().toString(36).slice(2, 7).toUpperCase()
    return `${prefixe}${suffixe}`
}

// Liste des agentvendeurs avec leur nombre de clients
export async function getAgentVendeurs() {
    await exigerOwner()
    const agentvendeurs = await withRetry(() =>
        prisma.agentvendeur.findMany({
            include: {
                _count: { select: { clients: true } }
            },
            orderBy: { nom: "asc" }
        })
    )
    return agentvendeurs.map(a => ({
        id: a.id,
        code: a.code,
        nom: a.nom,
        email: a.email,
        telephone: a.telephone,
        actif: a.actif,
        superAgent: a.superAgent,
        createdAt: a.createdAt,
        nombreClients: a._count.clients
    }))
}

// Crée un agentvendeur avec son premier administrateur (identifié par email et/ou téléphone)
export async function creerAgentVendeur(data: {
    nom: string
    email?: string
    telephone?: string
    adminNom?: string
    superAgent?: boolean
}) {
    return executer(async () => {
        await exigerOwner()

        const nom = data.nom?.trim()
        if (!nom) throw new Error("Le nom de l'agentvendeur est requis.")

        const contact = nettoyerContact(data.email, data.telephone)
        await verifierIdentifiantsLibres(contact)

        let code = genererCodeAgentVendeur(nom)
        let tentative = 0
        while (await prisma.agentvendeur.findUnique({ where: { code } })) {
            tentative++
            code = genererCodeAgentVendeur(nom)
            if (tentative > 10) throw new Error("Impossible de générer un code unique, réessayez.")
        }

        const agentvendeur = await withRetry(() =>
            prisma.$transaction(async (tx) => {
                const nouvelAgentVendeur = await tx.agentvendeur.create({
                    data: {
                        code,
                        nom,
                        email: contact.email,
                        telephone: contact.telephone,
                        superAgent: !!data.superAgent
                    }
                })
                await tx.agentvendeurUser.create({
                    data: {
                        agentvendeurId: nouvelAgentVendeur.id,
                        email: contact.email,
                        telephone: contact.telephone,
                        nom: data.adminNom?.trim() || null,
                        role: "ADMIN"
                    }
                })
                return nouvelAgentVendeur
            })
        )
        return { id: agentvendeur.id, code: agentvendeur.code, nom: agentvendeur.nom }
    })
}

// Donne ou retire à un agent vendeur le statut de super agent vendeur :
// accès, pour tous ses clients, au stock à une date donnée et aux entrées/sorties (IN/OUT)
export async function definirSuperAgent(agentvendeurId: string, superAgent: boolean) {
    return executer(async () => {
        await exigerOwner()
        await withRetry(() =>
            prisma.agentvendeur.update({ where: { id: agentvendeurId }, data: { superAgent } })
        )
    })
}

// Suspend ou réactive un agentvendeur : ses utilisateurs et tous ses clients perdent (ou retrouvent) l'accès
export async function basculerAgentVendeurActif(agentvendeurId: string, actif: boolean) {
    return executer(async () => {
        await exigerOwner()
        await withRetry(() => prisma.agentvendeur.update({ where: { id: agentvendeurId }, data: { actif } }))
    })
}

// Tous les clients, avec leur agentvendeur et leur abonnement (pour rattacher les clients existants et suivre les paiements) :
// - montantEnCours : paiements confirmés dont la période payée est encore en cours, quelles que soient les dates ;
// - montantPaye / nombrePaiements : paiements confirmés faits entre dateDebut et dateFin (sans dates : tous les paiements).
export async function getClientsOwner(dateDebut?: string, dateFin?: string) {
    await exigerOwner()
    const bornes = bornesDates(dateDebut, dateFin)

    const clients = await withRetry(() =>
        prisma.businessbi.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                telephone: true,
                accesActif: true,
                agentvendeur: { select: { id: true, nom: true, code: true } }
            },
            orderBy: { name: "asc" }
        })
    )

    const infos = await abonnementsDesClients(clients.map(c => c.id), bornes)

    return clients.map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        telephone: c.telephone,
        accesActif: c.accesActif,
        agentvendeurId: c.agentvendeur?.id ?? null,
        agentvendeurNom: c.agentvendeur?.nom ?? null,
        agentvendeurCode: c.agentvendeur?.code ?? null,
        ...(infos.get(c.id) ?? SANS_ABONNEMENT)
    }))
}

// Historique des paiements d'abonnement d'un client (du plus récent au plus ancien),
// éventuellement limité à une période (dates AAAA-MM-JJ, bornes incluses)
export async function getPaiementsClientOwner(clientId: string, dateDebut?: string, dateFin?: string) {
    try {
        await exigerOwner()
        const bornes = bornesDates(dateDebut, dateFin)

        const client = await withRetry(() =>
            prisma.businessbi.findUnique({ where: { id: clientId }, select: { id: true } })
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

// Rattache un client à un agentvendeur (ou le détache avec agentvendeurId = null)
export async function rattacherClient(
    businessbiId: string,
    agentvendeurId: string | null,
    numeroPolice?: string
) {
    return executer(async () => {
        await exigerOwner()

        if (agentvendeurId) {
            const agentvendeur = await withRetry(() =>
                prisma.agentvendeur.findUnique({ where: { id: agentvendeurId }, select: { id: true } })
            )
            if (!agentvendeur) throw new Error("AgentVendeur introuvable.")
        }

        await withRetry(() =>
            prisma.businessbi.update({
                where: { id: businessbiId },
                data: {
                    agentvendeurId,
                    ...(numeroPolice !== undefined ? { numeroPolice: numeroPolice.trim() || null } : {})
                }
            })
        )
    })
}

// Suspend ou réactive l'accès d'un client
export async function basculerAccesClientOwner(businessbiId: string, accesActif: boolean) {
    return executer(async () => {
        await exigerOwner()
        await withRetry(() =>
            prisma.businessbi.update({ where: { id: businessbiId }, data: { accesActif } })
        )
    })
}
