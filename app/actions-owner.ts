"use server";

import { prisma } from "@/lib/prisma"
import { currentUser } from "@clerk/nextjs/server"
import { resoudreAcces } from "@/lib/acces"
import { nettoyerContact, verifierIdentifiantsLibres } from "@/lib/contacts"
import { executer } from "@/lib/resultat"
import { withRetry } from "@/lib/retry"
import { accesAvecCache } from "@/lib/acces-cache"

const ROLES_ASSUREUR = ["ADMIN", "LECTEUR"]

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

function genererCodeAssureur(nom: string): string {
    const prefixe = nom
        .trim()
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, 3) || "ASS"
    const suffixe = Math.random().toString(36).slice(2, 7).toUpperCase()
    return `${prefixe}${suffixe}`
}

// Liste des assureurs avec leurs utilisateurs et leur nombre de clients
export async function getAssureurs() {
    await exigerOwner()
    const assureurs = await withRetry(() =>
        prisma.assureur.findMany({
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
    return assureurs.map(a => ({
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

// Crée un assureur avec son premier administrateur (identifié par email et/ou téléphone)
export async function creerAssureur(data: {
    nom: string
    email?: string
    telephone?: string
    adminNom?: string
}) {
    return executer(async () => {
        await exigerOwner()

        const nom = data.nom?.trim()
        if (!nom) throw new Error("Le nom de l'assureur est requis.")

        const contact = nettoyerContact(data.email, data.telephone)
        await verifierIdentifiantsLibres(contact)

        let code = genererCodeAssureur(nom)
        let tentative = 0
        while (await prisma.assureur.findUnique({ where: { code } })) {
            tentative++
            code = genererCodeAssureur(nom)
            if (tentative > 10) throw new Error("Impossible de générer un code unique, réessayez.")
        }

        const assureur = await withRetry(() =>
            prisma.$transaction(async (tx) => {
                const nouvelAssureur = await tx.assureur.create({
                    data: {
                        code,
                        nom,
                        email: contact.email,
                        telephone: contact.telephone
                    }
                })
                await tx.assureurUser.create({
                    data: {
                        assureurId: nouvelAssureur.id,
                        email: contact.email,
                        telephone: contact.telephone,
                        nom: data.adminNom?.trim() || null,
                        role: "ADMIN"
                    }
                })
                return nouvelAssureur
            })
        )
        return { id: assureur.id, code: assureur.code, nom: assureur.nom }
    })
}

// Suspend ou réactive un assureur : ses utilisateurs et tous ses clients perdent (ou retrouvent) l'accès
export async function basculerAssureurActif(assureurId: string, actif: boolean) {
    return executer(async () => {
        await exigerOwner()
        await withRetry(() => prisma.assureur.update({ where: { id: assureurId }, data: { actif } }))
    })
}

// Ajoute un utilisateur à un assureur
export async function ajouterUtilisateurAssureur(
    assureurId: string,
    data: { email?: string; telephone?: string; nom?: string; role?: string }
) {
    return executer(async () => {
        await exigerOwner()

        const role = data.role ?? "LECTEUR"
        if (!ROLES_ASSUREUR.includes(role)) throw new Error("Rôle invalide.")

        const assureur = await withRetry(() =>
            prisma.assureur.findUnique({ where: { id: assureurId }, select: { id: true } })
        )
        if (!assureur) throw new Error("Assureur introuvable.")

        const contact = nettoyerContact(data.email, data.telephone)
        await verifierIdentifiantsLibres(contact)

        await withRetry(() =>
            prisma.assureurUser.create({
                data: {
                    assureurId,
                    email: contact.email,
                    telephone: contact.telephone,
                    nom: data.nom?.trim() || null,
                    role
                }
            })
        )
    })
}

// Retire un utilisateur d'un assureur (jamais le dernier : l'assureur doit garder un accès)
export async function supprimerUtilisateurAssureur(utilisateurId: string) {
    return executer(async () => {
        await exigerOwner()

        const utilisateur = await withRetry(() =>
            prisma.assureurUser.findUnique({ where: { id: utilisateurId } })
        )
        if (!utilisateur) throw new Error("Utilisateur introuvable.")

        const nombre = await withRetry(() =>
            prisma.assureurUser.count({ where: { assureurId: utilisateur.assureurId } })
        )
        if (nombre <= 1) throw new Error("Impossible de supprimer le seul utilisateur de cet assureur.")

        await withRetry(() => prisma.assureurUser.delete({ where: { id: utilisateurId } }))
    })
}

// Tous les clients, avec leur assureur (pour rattacher les clients existants)
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
                assureur: { select: { id: true, nom: true, code: true } }
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
        assureurId: c.assureur?.id ?? null,
        assureurNom: c.assureur?.nom ?? null,
        assureurCode: c.assureur?.code ?? null
    }))
}

// Rattache un client à un assureur (ou le détache avec assureurId = null)
export async function rattacherClient(
    businessbiId: string,
    assureurId: string | null,
    numeroPolice?: string
) {
    return executer(async () => {
        await exigerOwner()

        if (assureurId) {
            const assureur = await withRetry(() =>
                prisma.assureur.findUnique({ where: { id: assureurId }, select: { id: true } })
            )
            if (!assureur) throw new Error("Assureur introuvable.")
        }

        await withRetry(() =>
            prisma.businessbi.update({
                where: { id: businessbiId },
                data: {
                    assureurId,
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
