"use server";

import { currentUser } from "@clerk/nextjs/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { resoudreAcces } from "@/lib/acces"
import { finDeJournee } from "@/lib/stock"

export type PaiementGlobal = {
    id: string
    date: string
    clientNom: string
    agentvendeurNom: string | null
    plan: string
    provider: string
    montant: number
    statut: string
}

export type DepenseClient = {
    id: string
    date: string
    description: string
    categorie: string
    montant: number
}

type Portee = { tous: true } | { tous: false; agentvendeurId: string }

// Qui appelle ? Propriétaire = tous les clients ; agent vendeur = seulement les siens ; sinon refus.
async function porteeAcces(): Promise<Portee> {
    const user = await currentUser()
    if (!user) throw new Error("Non connecté.")
    const acces = await resoudreAcces(user)
    if (acces.type === "owner") return { tous: true }
    if (acces.type === "agentvendeur") return { tous: false, agentvendeurId: acces.agentvendeurId }
    throw new Error("Accès refusé.")
}

// Dépenses : réservées au propriétaire et aux super agents vendeurs (vérifié dans la base à chaque appel)
async function porteeDepenses(): Promise<Portee> {
    const portee = await porteeAcces()
    if (portee.tous) return portee
    const agent = await prisma.agentvendeur.findUnique({
        where: { id: portee.agentvendeurId },
        select: { actif: true, superAgent: true }
    })
    if (!agent?.actif || !agent.superAgent) {
        throw new Error("Accès réservé aux super agents vendeurs.")
    }
    return portee
}

function filtreDate(debut?: string, fin?: string): Prisma.DateTimeFilter | undefined {
    const gte = debut ? new Date(debut + "T00:00:00.000Z") : undefined
    const lte = fin ? finDeJournee(fin) : undefined
    if (!gte && !lte) return undefined
    return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) }
}

function clientsDeLaPortee(portee: Portee): Prisma.BusinessbiWhereInput {
    return portee.tous ? {} : { agentvendeurId: portee.agentvendeurId }
}

// Paiements d'abonnement de TOUS les clients (de l'agent vendeur, ou de toute l'application pour le propriétaire)
export async function getPaiementsTousClients(dateDebut?: string, dateFin?: string): Promise<PaiementGlobal[]> {
    const portee = await porteeAcces()
    const periode = filtreDate(dateDebut, dateFin)

    const paiements = await prisma.paiementAbonnement.findMany({
        where: {
            businessbi: clientsDeLaPortee(portee),
            ...(periode ? { createdAt: periode } : {})
        },
        orderBy: { createdAt: "desc" },
        include: {
            businessbi: {
                select: { name: true, agentvendeur: { select: { nom: true } } }
            }
        }
    })

    return paiements.map((p) => ({
        id: p.id,
        date: p.createdAt.toISOString(),
        clientNom: p.businessbi.name,
        agentvendeurNom: p.businessbi.agentvendeur?.nom ?? null,
        plan: p.plan,
        provider: p.provider,
        montant: p.montant,
        statut: p.statut
    }))
}

// Total des dépenses de chaque client sur la période : { idClient: total }
export async function getTotauxDepenses(dateDebut?: string, dateFin?: string): Promise<Record<string, number>> {
    const portee = await porteeDepenses()
    const periode = filtreDate(dateDebut, dateFin)

    const groupes = await prisma.depense.groupBy({
        by: ["businessbiId"],
        where: {
            businessbi: clientsDeLaPortee(portee),
            ...(periode ? { date: periode } : {})
        },
        _sum: { montant: true }
    })

    const totaux: Record<string, number> = {}
    for (const g of groupes) totaux[g.businessbiId] = g._sum.montant ?? 0
    return totaux
}

// Détail des dépenses d'un client (le client doit être dans la portée de l'appelant)
export async function getDepensesClient(clientId: string, dateDebut?: string, dateFin?: string): Promise<DepenseClient[]> {
    const portee = await porteeDepenses()

    const client = await prisma.businessbi.findFirst({
        where: { id: clientId, ...clientsDeLaPortee(portee) },
        select: { id: true }
    })
    if (!client) throw new Error("Client introuvable.")

    const periode = filtreDate(dateDebut, dateFin)
    const depenses = await prisma.depense.findMany({
        where: { businessbiId: clientId, ...(periode ? { date: periode } : {}) },
        orderBy: { date: "desc" }
    })

    return depenses.map((d) => ({
        id: d.id,
        date: d.date.toISOString(),
        description: d.description,
        categorie: d.categorie,
        montant: d.montant
    }))
}
