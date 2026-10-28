"use server";

import { prisma } from "@/lib/prisma"
import { clerkClient, currentUser } from "@clerk/nextjs/server"
import { resoudreAcces } from "@/lib/acces"
import { executer } from "@/lib/resultat"
import { withRetry } from "@/lib/retry"
import { chercherFicheImportee } from "@/lib/import-clients"
import { DUREE_ESSAI_JOURS } from "@/lib/plans"

// Le client s'enregistre lui-même avec le code de son agentvendeur.
// L'identité (email / téléphone) est lue côté serveur dans Clerk : rien n'est cru depuis le navigateur.
// Le téléphone saisi dans le formulaire n'est qu'un contact (telephoneContact) : il ne sert jamais à identifier le compte.
// Seuls le code de l'agentvendeur et le nom de l'entreprise sont obligatoires ; RC, NIF, secteur d'activité,
// propriétaire et téléphone sont facultatifs.
//
// Si l'agentvendeur a déjà importé le client depuis son fichier Excel (même RC et même NIF), on complète cette fiche
// au lieu d'en créer une nouvelle : le nom, le RC et le NIF de l'agentvendeur sont conservés.
// Cette recherche n'a lieu que si le RC et le NIF sont tous les deux renseignés.
//
// À l'inscription, l'entreprise reçoit un essai gratuit de DUREE_ESSAI_JOURS jours (voir lib/plans.ts).
export async function rejoindreAgentVendeur(data: {
    code: string
    name: string
    rc?: string
    nif?: string
    secteurActivite?: string
    proprietaire?: string
    telephone?: string
}) {
    return executer(async () => {
        const user = await currentUser()
        if (!user) throw new Error("Non connecté.")

        // Seul un compte pas encore rattaché peut s'inscrire
        const acces = await withRetry(() => resoudreAcces(user))
        if (acces.type !== "inscription") throw new Error("Ce compte est déjà enregistré.")

        const code = data.code?.trim()
        const name = data.name?.trim()
        // Champs facultatifs : une valeur vide devient null
        const rc = data.rc?.trim() || null
        const nif = data.nif?.trim() || null
        const secteurActivite = data.secteurActivite?.trim() || null
        const proprietaire = data.proprietaire?.trim() || null
        const telephoneContact = data.telephone?.trim() || null

        if (!code) throw new Error("Le code de l'agentvendeur est requis.")
        if (!name) throw new Error("Le nom de votre entreprise est requis.")
        if (telephoneContact && !/^[+\d\s().-]{6,20}$/.test(telephoneContact)) {
            throw new Error("Numéro de téléphone invalide.")
        }

        const agentvendeur = await withRetry(() =>
            prisma.agentvendeur.findFirst({
                where: { code: { equals: code, mode: "insensitive" }, actif: true },
                select: { id: true }
            })
        )
        // Message volontairement identique pour un code faux ou un agentvendeur suspendu
        if (!agentvendeur) throw new Error("Code agentvendeur invalide.")

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

        // Ce client figure-t-il déjà dans la liste importée par son agentvendeur ?
        // Recherche possible seulement si le RC et le NIF sont tous les deux fournis.
        let recherche: ReturnType<typeof chercherFicheImportee> | null = null
        if (rc && nif) {
            const existants = await withRetry(() =>
                prisma.businessbi.findMany({
                    where: { agentvendeurId: agentvendeur.id },
                    select: { id: true, name: true, numeroPolice: true, nif: true, email: true, telephone: true }
                })
            )
            recherche = chercherFicheImportee(rc, nif, existants)
            if (recherche.type === "deja_inscrit") {
                throw new Error("Ce RC est déjà enregistré chez votre agentvendeur.")
            }
            if (recherche.type === "nif_different") {
                throw new Error("Le NIF ne correspond pas à celui que votre agentvendeur a enregistré pour ce RC.")
            }
        }

        // Fin de l'essai gratuit
        const dateFinEssai = new Date(Date.now() + DUREE_ESSAI_JOURS * 24 * 60 * 60 * 1000)

        let client: { id: string }
        try {
            if (recherche && recherche.type === "a_completer") {
                const ficheId = recherche.id
                // updateMany : ne réussit que si la fiche est toujours en attente (pas d'inscription simultanée)
                const resultat = await withRetry(() =>
                    prisma.businessbi.updateMany({
                        where: { id: ficheId, agentvendeurId: agentvendeur.id, email: null, telephone: null },
                        data: { email, telephone, secteurActivite, proprietaire, telephoneContact }
                    })
                )
                if (resultat.count === 0) {
                    throw new Error("Cette fiche vient d'être utilisée. Contactez votre agentvendeur.")
                }
                client = { id: ficheId }

                // Essai gratuit pour cette entreprise (sans écraser un abonnement déjà existant)
                await withRetry(() =>
                    prisma.abonnement.upsert({
                        where: { businessbiId: ficheId },
                        update: {},
                        create: { businessbiId: ficheId, statut: "essai", dateFin: dateFinEssai }
                    })
                )
            } else {
                client = await withRetry(() =>
                    prisma.businessbi.create({
                        data: {
                            name,
                            email,
                            telephone,
                            numeroPolice: rc,
                            nif,
                            secteurActivite,
                            proprietaire,
                            telephoneContact,
                            agentvendeurId: agentvendeur.id,
                            // Essai gratuit créé en même temps que l'entreprise
                            abonnement: { create: { statut: "essai", dateFin: dateFinEssai } }
                        }
                    })
                )
            }
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
