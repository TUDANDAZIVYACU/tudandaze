"use server";

import { prisma } from "@/lib/prisma"
import { clerkClient, currentUser } from "@clerk/nextjs/server"
import { resoudreAcces } from "@/lib/acces"
import { executer } from "@/lib/resultat"
import { withRetry } from "@/lib/retry"
import { chercherFicheImportee } from "@/lib/import-clients"

// Le client s'enregistre lui-même avec le code de son assureur.
// L'identité (email / téléphone) est lue côté serveur dans Clerk : rien n'est cru depuis le navigateur.
// Le téléphone saisi dans le formulaire n'est qu'un contact (telephoneContact) : il ne sert jamais à identifier le compte.
// Tous les champs du formulaire sont obligatoires.
//
// Si l'assureur a déjà importé le client depuis son fichier Excel (même RC et même NIF), on complète cette fiche
// au lieu d'en créer une nouvelle : le nom, le RC et le NIF de l'assureur sont conservés.
export async function rejoindreAssureur(data: {
    code: string
    name: string
    rc: string
    nif: string
    secteurActivite: string
    proprietaire: string
    telephone: string
}) {
    return executer(async () => {
        const user = await currentUser()
        if (!user) throw new Error("Non connecté.")

        // Seul un compte pas encore rattaché peut s'inscrire
        const acces = await withRetry(() => resoudreAcces(user))
        if (acces.type !== "inscription") throw new Error("Ce compte est déjà enregistré.")

        const code = data.code?.trim()
        const name = data.name?.trim()
        const rc = data.rc?.trim()
        const nif = data.nif?.trim()
        const secteurActivite = data.secteurActivite?.trim()
        const proprietaire = data.proprietaire?.trim()
        const telephoneContact = data.telephone?.trim()

        if (!code) throw new Error("Le code de l'assureur est requis.")
        if (!name) throw new Error("Le nom de votre entreprise est requis.")
        if (!rc) throw new Error("Le RC est requis.")
        if (!nif) throw new Error("Le NIF est requis.")
        if (!secteurActivite) throw new Error("Le secteur d'activité est requis.")
        if (!proprietaire) throw new Error("Le nom du propriétaire est requis.")
        if (!telephoneContact) throw new Error("Le téléphone est requis.")
        if (!/^[+\d\s().-]{6,20}$/.test(telephoneContact)) {
            throw new Error("Numéro de téléphone invalide.")
        }

        const assureur = await withRetry(() =>
            prisma.assureur.findFirst({
                where: { code: { equals: code, mode: "insensitive" }, actif: true },
                select: { id: true }
            })
        )
        // Message volontairement identique pour un code faux ou un assureur suspendu
        if (!assureur) throw new Error("Code assureur invalide.")

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

        // Ce client figure-t-il déjà dans la liste importée par son assureur ?
        const existants = await withRetry(() =>
            prisma.businessbi.findMany({
                where: { assureurId: assureur.id },
                select: { id: true, name: true, numeroPolice: true, nif: true, email: true, telephone: true }
            })
        )
        const recherche = chercherFicheImportee(rc, nif, existants)
        if (recherche.type === "deja_inscrit") {
            throw new Error("Ce RC est déjà enregistré chez votre assureur.")
        }
        if (recherche.type === "nif_different") {
            throw new Error("Le NIF ne correspond pas à celui que votre assureur a enregistré pour ce RC.")
        }

        let client: { id: string }
        try {
            if (recherche.type === "a_completer") {
                const ficheId = recherche.id
                // updateMany : ne réussit que si la fiche est toujours en attente (pas d'inscription simultanée)
                const resultat = await withRetry(() =>
                    prisma.businessbi.updateMany({
                        where: { id: ficheId, assureurId: assureur.id, email: null, telephone: null },
                        data: { email, telephone, secteurActivite, proprietaire, telephoneContact }
                    })
                )
                if (resultat.count === 0) {
                    throw new Error("Cette fiche vient d'être utilisée. Contactez votre assureur.")
                }
                client = { id: ficheId }
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
                            assureurId: assureur.id
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
