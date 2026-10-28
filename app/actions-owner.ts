"use server";

import { prisma } from "@/lib/prisma"
import { currentUser } from "@clerk/nextjs/server"
import { resoudreAcces } from "@/lib/acces"
import { nettoyerContact, verifierIdentifiantsLibres } from "@/lib/contacts"
import { executer } from "@/lib/resultat"
import { withRetry } from "@/lib/retry"
import { accesAvecCache } from "@/lib/acces-cache"

const ROLES_AGENTVENDEUR = ["ADMIN", "LECTEUR"]

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

// Liste des agentvendeurs avec leurs utilisateurs et leur nombre de clients
export async function getAgentVendeurs() {
    await exigerOwner()
    const agentvendeurs = await withRetry(() =>
        prisma.agentvendeur.findMany({
            include: {
                _count: { select: { clients: true } },
                utilisateurs: {
                    select: {
                        id: true,
                        email: true,
                        telephone: true,
                        nom: true,
                        role: true,
                        clerkUserId: true
                    },
                    orderBy: { createdAt: "asc" }
                }
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
        createdAt: a.createdAt,
        nombreClients: a._count.clients,
        utilisateurs: a.utilisateurs.map(u => ({
            id: u.id,
            email: u.email,
            telephone: u.telephone,
            nom: u.nom,
            role: u.role,
            connecte: !!u.clerkUserId
        }))
    }))
}

// Crée un agentvendeur avec son premier administrateur (identifié par email et/ou téléphone)
export async function creerAgentVendeur(data: {
    nom: string
    email?: string
    telephone?: string
    adminNom?: string
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
                        telephone: contact.telephone
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

// Suspend ou réactive un agentvendeur : ses utilisateurs et tous ses clients perdent (ou retrouvent) l'accès
export async function basculerAgentVendeurActif(agentvendeurId: string, actif: boolean) {
    return executer(async () => {
        await exigerOwner()
        await withRetry(() => prisma.agentvendeur.update({ where: { id: agentvendeurId }, data: { actif } }))
    })
}

// Ajoute un utilisateur à un agentvendeur
export async function ajouterUtilisateurAgentVendeur(
    agentvendeurId: string,
    data: { email?: string; telephone?: string; nom?: string; role?: string }
) {
    return executer(async () => {
        await exigerOwner()

        const role = data.role ?? "LECTEUR"
        if (!ROLES_AGENTVENDEUR.includes(role)) throw new Error("Rôle invalide.")

        const agentvendeur = await withRetry(() =>
            prisma.agentvendeur.findUnique({ where: { id: agentvendeurId }, select: { id: true } })
        )
        if (!agentvendeur) throw new Error("AgentVendeur introuvable.")

        const contact = nettoyerContact(data.email, data.telephone)
        await verifierIdentifiantsLibres(contact)

        await withRetry(() =>
            prisma.agentvendeurUser.create({
                data: {
                    agentvendeurId,
                    email: contact.email,
                    telephone: contact.telephone,
                    nom: data.nom?.trim() || null,
                    role
                }
            })
        )
    })
}

// Retire un utilisateur d'un agentvendeur (jamais le dernier : l'agentvendeur doit garder un accès)
export async function supprimerUtilisateurAgentVendeur(utilisateurId: string) {
    return executer(async () => {
        await exigerOwner()

        const utilisateur = await withRetry(() =>
            prisma.agentvendeurUser.findUnique({ where: { id: utilisateurId } })
        )
        if (!utilisateur) throw new Error("Utilisateur introuvable.")

        const nombre = await withRetry(() =>
            prisma.agentvendeurUser.count({ where: { agentvendeurId: utilisateur.agentvendeurId } })
        )
        if (nombre <= 1) throw new Error("Impossible de supprimer le seul utilisateur de cet agentvendeur.")

        await withRetry(() => prisma.agentvendeurUser.delete({ where: { id: utilisateurId } }))
    })
}

// Tous les clients, avec leur agentvendeur (pour rattacher les clients existants)
export async function getClientsOwner() {
    await exigerOwner()
    const clients = await withRetry(() =>
        prisma.businessbi.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                telephone: true,
                numeroPolice: true,
                accesActif: true,
                agentvendeur: { select: { id: true, nom: true, code: true } }
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
        accesActif: c.accesActif,
        agentvendeurId: c.agentvendeur?.id ?? null,
        agentvendeurNom: c.agentvendeur?.nom ?? null,
        agentvendeurCode: c.agentvendeur?.code ?? null
    }))
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
