"use server";

import { prisma } from "@/lib/prisma"
import { del } from "@vercel/blob"
import { getBusinessbi } from "./actions"
import { dateValide } from "@/lib/stock"
import { executer } from "@/lib/resultat"
import { withRetry } from "@/lib/retry"

const VINGT_QUATRE_HEURES_MS = 24 * 60 * 60 * 1000

// Photo (facture, équipement) : seule une adresse de notre stockage Vercel Blob est acceptée
function validerUrlPhoto(url: string | undefined, messageErreur: string): string | null {
    const adresse = url?.trim() || null
    if (adresse && !/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(adresse)) {
        throw new Error(messageErreur)
    }
    return adresse
}

// Enregistre un équipement (immobilisation) de l'entreprise connectée.
// L'identité est lue côté serveur ; les photos (facultatives) ont été envoyées au stockage avant cet appel.
export async function createImmobilisation(
    data: {
        designation: string
        dateAcquisition: string
        prix: number
        numeroSerie?: string
        factureUrl?: string
        photoUrl?: string
    },
    email: string
) {
    return executer(async () => {
        if (!email) throw new Error("Identifiant requis.")
        const businessbi = await getBusinessbi(email)
        if (!businessbi) throw new Error("Compte non enregistré ou accès suspendu. Contactez votre assureur.")

        const designation = data.designation?.trim()
        if (!designation) throw new Error("La désignation de l'équipement est requise.")
        if (designation.length > 150) throw new Error("La désignation est trop longue (150 caractères maximum).")

        const date = data.dateAcquisition?.trim()
        if (!date || !dateValide(date)) throw new Error("Date d'acquisition invalide.")
        const aujourdhui = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Bujumbura" })
        if (date > aujourdhui) throw new Error("La date d'acquisition ne peut pas être dans le futur.")

        const prix = Number(data.prix)
        if (!Number.isFinite(prix) || prix <= 0) throw new Error("Le prix doit être supérieur à 0.")

        const numeroSerie = data.numeroSerie?.trim() || null
        if (numeroSerie && numeroSerie.length > 100) throw new Error("Le numéro de série est trop long (100 caractères maximum).")

        const factureUrl = validerUrlPhoto(data.factureUrl, "Photo de facture invalide.")
        const photoUrl = validerUrlPhoto(data.photoUrl, "Photo d'équipement invalide.")

        // Un numéro de série n'est enregistré qu'une fois par entreprise
        if (numeroSerie) {
            const existant = await withRetry(() =>
                prisma.immobilisation.findFirst({
                    where: {
                        businessbiId: businessbi.id,
                        numeroSerie: { equals: numeroSerie, mode: "insensitive" }
                    },
                    select: { id: true }
                })
            )
            if (existant) throw new Error("Un équipement avec ce numéro de série est déjà enregistré.")
        }

        const creee = await withRetry(() =>
            prisma.immobilisation.create({
                data: {
                    designation,
                    dateAcquisition: new Date(date),
                    prix,
                    numeroSerie,
                    factureUrl,
                    photoUrl,
                    businessbiId: businessbi.id
                }
            })
        )
        return { id: creee.id }
    })
}

// Liste des équipements de l'entreprise connectée (les plus récemment acquis d'abord)
export async function readImmobilisations(email: string) {
    try {
        if (!email) return []
        const businessbi = await getBusinessbi(email)
        if (!businessbi) return []
        return await withRetry(() =>
            prisma.immobilisation.findMany({
                where: { businessbiId: businessbi.id },
                orderBy: [{ dateAcquisition: "desc" }, { createdAt: "desc" }]
            })
        )
    } catch (error) {
        console.error("readImmobilisations error:", error)
        return []
    }
}

// Supprime un équipement, seulement dans les 24h suivant son enregistrement. Ses photos sont supprimées aussi.
export async function deleteImmobilisation(id: string, email: string) {
    return executer(async () => {
        if (!id) throw new Error("L'id est requis.")
        const businessbi = await getBusinessbi(email)
        if (!businessbi) throw new Error("Aucun Business trouvé avec cet email.")

        const equipement = await withRetry(() =>
            prisma.immobilisation.findFirst({
                where: { id, businessbiId: businessbi.id }
            })
        )
        if (!equipement) throw new Error("Équipement introuvable.")

        const ageMs = Date.now() - new Date(equipement.createdAt).getTime()
        if (ageMs > VINGT_QUATRE_HEURES_MS) {
            throw new Error("Cet équipement a été enregistré il y a plus de 24h. Sa suppression n'est plus autorisée.")
        }

        await withRetry(() => prisma.immobilisation.delete({ where: { id: equipement.id } }))

        // Photos : suppression des fichiers (sans bloquer si elle échoue)
        for (const url of [equipement.factureUrl, equipement.photoUrl]) {
            if (!url) continue
            try {
                await del(url)
            } catch (error) {
                console.error(error)
            }
        }
    })
}