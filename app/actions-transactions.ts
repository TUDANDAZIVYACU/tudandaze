"use server";

import { prisma } from "@/lib/prisma"
import { del } from "@vercel/blob"
import { getBusinessbi } from "./actions"
import { executer } from "@/lib/resultat"
import { withRetry } from "@/lib/retry"

const VINGT_QUATRE_HEURES_MS = 24 * 60 * 60 * 1000

// Identifiants des produits qui ont déjà été vendus (au moins une sortie de stock).
// Sert à masquer le bouton SUPPRIMER de ces produits : leur suppression est refusée par le serveur.
export async function getProduitsVendus(email: string): Promise<string[]> {
    try {
        if (!email) return []
        const businessbi = await getBusinessbi(email)
        if (!businessbi) return []

        const lignes = await withRetry(() =>
            prisma.transaction.findMany({
                where: { businessbiId: businessbi.id, type: "OUT" },
                select: { productId: true },
                distinct: ["productId"]
            })
        )
        return lignes.map((l) => l.productId)
    } catch (error) {
        console.error("getProduitsVendus error:", error)
        return []
    }
}

// Supprime un achat (approvisionnement) de l'entreprise connectée, seulement dans les 24h suivant son enregistrement.
// Le stock diminue de la quantité de l'achat : refusé si une partie a déjà été vendue.
export async function deleteTransaction(id: string, email: string) {
    return executer(async () => {
        if (!id) throw new Error("L'id est requis.")
        const businessbi = await getBusinessbi(email)
        if (!businessbi) throw new Error("Aucun Business trouvé avec cet email.")

        const tx = await withRetry(() =>
            prisma.transaction.findFirst({
                where: { id, businessbiId: businessbi.id },
                include: { product: { select: { quantity: true, name: true } } }
            })
        )
        if (!tx) throw new Error("Opération introuvable.")

        if (tx.type !== "IN") {
            throw new Error("Pour une vente, utilisez l'annulation de vente.")
        }

        const ageMs = Date.now() - new Date(tx.createdAt).getTime()
        if (ageMs > VINGT_QUATRE_HEURES_MS) {
            throw new Error("Cette opération a été enregistrée il y a plus de 24h. Sa suppression n'est plus autorisée.")
        }

        // Le stock restant après suppression ne doit pas devenir négatif
        const mouvements = await withRetry(() =>
            prisma.transaction.findMany({
                where: { productId: tx.productId },
                select: { type: true, quantity: true }
            })
        )
        const stockActuel = mouvements.reduce(
            (acc, m) => (m.type === "IN" ? acc + m.quantity : acc - m.quantity),
            tx.product.quantity
        )
        if (stockActuel - tx.quantity < 0) {
            throw new Error(
                `Impossible : une partie de ce stock a déjà été vendue (stock actuel de ${tx.product.name} : ${stockActuel}).`
            )
        }

        await withRetry(() => prisma.transaction.delete({ where: { id: tx.id } }))

        // Photo de la facture : suppression du fichier (sans bloquer si elle échoue)
        if (tx.factureUrl) {
            try {
                await del(tx.factureUrl)
            } catch (error) {
                console.error(error)
            }
        }
    })
}

// Annule une vente en entier, seulement dans les 24h suivant son enregistrement :
// supprime toutes ses lignes de stock (le stock est donc restitué), sa facture et la dette qu'elle a créée.
// Refusé si des paiements ont déjà été enregistrés sur cette dette.
export async function annulerVente(venteId: string, email: string) {
    return executer(async () => {
        if (!venteId) throw new Error("L'id de la vente est requis.")
        const businessbi = await getBusinessbi(email)
        if (!businessbi) throw new Error("Aucun Business trouvé avec cet email.")

        const vente = await withRetry(() =>
            prisma.vente.findFirst({
                where: { id: venteId, businessbiId: businessbi.id },
                select: { id: true, createdAt: true }
            })
        )
        if (!vente) throw new Error("Vente introuvable.")

        const ageMs = Date.now() - new Date(vente.createdAt).getTime()
        if (ageMs > VINGT_QUATRE_HEURES_MS) {
            throw new Error("Cette vente a été enregistrée il y a plus de 24h. Son annulation n'est plus autorisée.")
        }

        // Sécurité : sans lignes de stock liées (vente antérieure à cette fonction), on ne supprime rien
        const lignesLiees = await withRetry(() =>
            prisma.transaction.count({
                where: { venteId: vente.id, businessbiId: businessbi.id, type: "OUT" }
            })
        )
        if (lignesLiees === 0) {
            throw new Error("Cette vente est antérieure à la fonction d'annulation : elle ne peut pas être annulée.")
        }

        const dettes = await withRetry(() =>
            prisma.dette.findMany({
                where: { venteId: vente.id, businessbiId: businessbi.id },
                include: { paiements: { select: { id: true } } }
            })
        )
        if (dettes.some((d) => d.paiements.length > 0)) {
            throw new Error("Des paiements ont déjà été enregistrés sur la dette de cette vente. Supprimez-les d'abord.")
        }

        // Tout ou rien : lignes de stock, dette (ses paiements partent avec) et vente (ses articles partent avec)
        await withRetry(() =>
            prisma.$transaction([
                prisma.transaction.deleteMany({ where: { venteId: vente.id, businessbiId: businessbi.id } }),
                prisma.dette.deleteMany({ where: { venteId: vente.id, businessbiId: businessbi.id } }),
                prisma.vente.delete({ where: { id: vente.id } })
            ])
        )
    })
}