"use server";

import { prisma } from "@/lib/prisma"
import { clerkClient, currentUser } from "@clerk/nextjs/server"
import { resoudreAcces } from "@/lib/acces"
import { executer } from "@/lib/resultat"
import { withRetry } from "@/lib/retry"
import { DUREE_ESSAI_JOURS } from "@/lib/plans"

// Le client s'enregistre lui-même avec le code d'authentification donné par son agent vendeur.
// L'identité (email / téléphone) est lue côté serveur dans Clerk : rien n'est cru depuis le navigateur.
// Seuls le code d'authentification et le nom de l'activité sont demandés (plus de RC, NIF, secteur d'activité,
// propriétaire ni téléphone de contact).
//
// À l'inscription, l'entreprise reçoit un essai gratuit de DUREE_ESSAI_JOURS jours (voir lib/plans.ts).
export async function rejoindreAgentVendeur(data: {
    code: string
    name: string
}) {
    return executer(async () => {
        const user = await currentUser()
        if (!user) throw new Error("Non connecté.")

        // Seul un compte pas encore rattaché peut s'inscrire
        const acces = await withRetry(() => resoudreAcces(user))
        if (acces.type !== "inscription") throw new Error("Ce compte est déjà enregistré.")

        const code = data.code?.trim()
        const name = data.name?.trim()

        if (!code) throw new Error("Le code d'authentification est requis.")
        if (!name) throw new Error("Le nom de votre activité est requis.")

        const agentvendeur = await withRetry(() =>
            prisma.agentvendeur.findFirst({
                where: { code: { equals: code, mode: "insensitive" }, actif: true },
                select: { id: true }
            })
        )
        // Message volontairement identique pour un code faux ou un agent vendeur suspendu
        if (!agentvendeur) throw new Error("Code d'authentification invalide.")

        // Identifiants vérifiés (principal en priorité)
        const emailsVerifies = user.emailAddresses.filter((e) => e.verification?.status === "verified")
        const telephonesVerifies = user.phoneNumbers.filter((p) => p.verification?.status === "verified")
        const email =
            (emailsVerifies.find((e) => e.id === user.primaryEmailAddressId) ?? emailsVerifies[0])
                ?.emailAddress.toLowerCase() ?? null
        const telephone =
            (telephonesVerifies.find((p) => p.id === user.primaryPhoneNumberId) ?? telephonesVerifies[0])
                ?.phoneNumber ?? null
        if (!email && !telephone) throw new Error("Aucun email ou téléphone vérifié sur ce compte.")

        // Fin de l'essai gratuit
        const dateFinEssai = new Date(Date.now() + DUREE_ESSAI_JOURS * 24 * 60 * 60 * 1000)

        let client: { id: string }
        try {
            client = await withRetry(() =>
                prisma.businessbi.create({
                    data: {
                        name,
                        email,
                        telephone,
                        agentvendeurId: agentvendeur.id,
                        // Essai gratuit créé en même temps que l'entreprise
                        abonnement: { create: { statut: "essai", dateFin: dateFinEssai } }
                    }
                })
            )
        } catch (error: any) {
            if (error?.code === "P2002") throw new Error("Ce compte est déjà enregistré.")
            throw error
        }

        // Le titulaire du compte client devient "admin" (comme avant, via checkAndAddBusinessbi)
        try {
            const role = (user.publicMetadata as { role?: string } | undefined)?.role
            if (!role) {
                const clerk = await clerkClient()
                await clerk.users.updateUserMetadata(user.id, {
                    publicMetadata: { role: "admin" }
                })
            }
        } catch (error) {
            // Non bloquant : checkAndAddBusinessbi (Navbar) réessaiera à la prochaine connexion
            console.error(error)
        }

        return { id: client.id }
    })
}
