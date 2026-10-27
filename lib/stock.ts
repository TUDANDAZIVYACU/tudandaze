import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import type { Product as ProductDb } from "@prisma/client"

// Le Burundi est en UTC+2 : la fin d'une journée locale est à 21:59:59.999 UTC
export function finDeJournee(dateFiltre: string): Date {
    return new Date(dateFiltre + "T21:59:59.999Z")
}

// Format attendu : AAAA-MM-JJ
export function dateValide(dateFiltre: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(dateFiltre) && !Number.isNaN(finDeJournee(dateFiltre).getTime())
}

// Mouvements de stock jusqu'à une date :
// - un approvisionnement (IN) compte à sa date d'approvisionnement (dateApprovis)
// - une sortie (OUT, vente) compte à sa date d'enregistrement (createdAt)
export function filtreMouvementsJusqua(fin?: Date): Prisma.TransactionWhereInput {
    if (!fin) return {}
    return {
        OR: [
            { type: "IN", dateApprovis: { lte: fin } },
            { type: "OUT", createdAt: { lte: fin } }
        ]
    }
}

export type LigneStock = {
    product: ProductDb
    quantity: number
    prixAchat: number
    prixVente: number
    valeurAchat: number
    valeurVente: number
}

type DernierIN = { productId: string; prixAchat: number; prixVente: number }

// Stock de chaque produit d'un client à une date (ou stock actuel si aucune date) :
// quantité de base du produit + entrées - sorties.
// Prix retenus : ceux du dernier approvisionnement jusqu'à cette date (sinon ceux du produit).
// Les sommes sont faites par la base : on ne charge plus toutes les transactions.
export async function calculerStock(businessbiId: string, dateFiltre?: string): Promise<LigneStock[]> {
    const fin = dateFiltre ? finDeJournee(dateFiltre) : undefined

    const [products, cumuls, derniersIN] = await Promise.all([
        prisma.product.findMany({
            where: { businessbiId, ...(fin ? { createdAt: { lte: fin } } : {}) },
            orderBy: { name: "asc" }
        }),
        // Total des entrées et des sorties par produit
        prisma.transaction.groupBy({
            by: ["productId", "type"],
            where: { businessbiId, ...filtreMouvementsJusqua(fin) },
            _sum: { quantity: true }
        }),
        // Dernier approvisionnement de chaque produit (une seule ligne par produit)
        prisma.$queryRaw<DernierIN[]>(Prisma.sql`
            SELECT DISTINCT ON ("productId") "productId", "prixAchat", "prixVente"
            FROM "Transaction"
            WHERE "businessbiId" = ${businessbiId}
              AND "type" = 'IN'
              ${fin ? Prisma.sql`AND "dateApprovis" <= ${fin}` : Prisma.empty}
            ORDER BY "productId", "dateApprovis" DESC
        `)
    ])

    // variation = entrées - sorties, par produit
    const variation = new Map<string, number>()
    for (const c of cumuls) {
        const q = c._sum.quantity ?? 0
        variation.set(c.productId, (variation.get(c.productId) ?? 0) + (c.type === "IN" ? q : -q))
    }

    const dernierINParProduit = new Map<string, DernierIN>()
    for (const d of derniersIN) dernierINParProduit.set(d.productId, d)

    return products.map(product => {
        const brute = product.quantity + (variation.get(product.id) ?? 0)
        const quantity = Math.max(0, brute)
        const dernierIN = dernierINParProduit.get(product.id)
        const prixAchat = dernierIN?.prixAchat || product.prixAchat
        const prixVente = dernierIN?.prixVente || product.prixVente
        return {
            product,
            quantity,
            prixAchat,
            prixVente,
            valeurAchat: prixAchat * quantity,
            valeurVente: prixVente * quantity
        }
    })
}