"use server";

import { prisma } from "@/lib/prisma"
import { del } from "@vercel/blob"
import { withRetry } from "@/lib/retry"
import { normaliserTelephone } from "@/lib/telephone"
import { calculerStock, finDeJournee, filtreMouvementsJusqua } from "@/lib/stock"
import { FormDataType, OrderItem, Product, ProductOverviewStats, StockSummary, Transaction } from "@/type"
import { CaisseFormType, BanqueFormType, CaisseEntry, BanqueEntry } from '@/type'
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server"
import type { Prisma } from "@prisma/client"

// Photo d'une facture / pièce justificative (facultative) : seule une adresse de notre stockage Vercel Blob est acceptée
function validerUrlPhoto(url: string | undefined, messageErreur: string): string | null {
    const adresse = url?.trim() || null
    if (adresse && !/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(adresse)) {
        throw new Error(messageErreur)
    }
    return adresse
}

// Retrouve l'entreprise du compte connecté (titulaire ou membre de l'équipe) à partir de
// ses emails et téléphones VÉRIFIÉS par Clerk, jamais à partir d'une valeur envoyée par le navigateur.
async function trouverBusinessbiPourUtilisateur(
    user: NonNullable<Awaited<ReturnType<typeof currentUser>>>
) {
    const emails = new Set<string>()
    for (const e of user.emailAddresses) {
        if (e.verification?.status !== "verified") continue
        emails.add(e.emailAddress)
        emails.add(e.emailAddress.toLowerCase())
    }

    const telephones = new Set<string>()
    for (const p of user.phoneNumbers) {
        if (p.verification?.status !== "verified") continue
        telephones.add(p.phoneNumber)
        const normalise = normaliserTelephone(p.phoneNumber)
        if (normalise) telephones.add(normalise)
    }

    const listeEmails = [...emails]
    const listeTelephones = [...telephones]

    const filtre: Prisma.BusinessbiWhereInput[] = []
    if (listeEmails.length > 0) {
        filtre.push(
            { email: { in: listeEmails } },
            { membres: { some: { email: { in: listeEmails } } } }
        )
    }
    if (listeTelephones.length > 0) {
        filtre.push(
            { telephone: { in: listeTelephones } },
            { membres: { some: { telephone: { in: listeTelephones } } } }
        )
    }
    if (filtre.length === 0) return null

    return prisma.businessbi.findFirst({
        where: { OR: filtre },
        include: { assureur: { select: { actif: true } } }
    })
}

// Appelée après la connexion. Ne crée plus aucun compte : les clients sont enregistrés
// par leur assureur. Si le titulaire d'un compte client n'a encore aucun rôle, il devient "admin"
// (les membres de son équipe ont le rôle défini par l'administrateur de l'entreprise, enregistré dans la base).
// L'identité est lue côté serveur (Clerk), jamais depuis les paramètres reçus du navigateur.
export async function checkAndAddBusinessbi(_email?: string, _name?: string, _userId?: string) {
    try {
        const user = await currentUser()
        if (!user) return

        const emails = user.emailAddresses
            .filter((e) => e.verification?.status === "verified")
            .map((e) => e.emailAddress.toLowerCase())
        const telephones = user.phoneNumbers
            .filter((p) => p.verification?.status === "verified")
            .map((p) => p.phoneNumber)

        const filtre = [
            ...emails.map((email) => ({ email })),
            ...telephones.map((telephone) => ({ telephone }))
        ]
        if (filtre.length === 0) return

        await withRetry(async () => {
            const role = (user.publicMetadata as { role?: string } | undefined)?.role

            const businessbi = await prisma.businessbi.findFirst({
                where: { OR: filtre },
                select: { id: true }
            })
            if (businessbi) {
                // Titulaire du compte de l'entreprise
                if (!role) {
                    const client = await clerkClient()
                    await client.users.updateUserMetadata(user.id, {
                        publicMetadata: { role: "admin" }
                    })
                }
                return
            }

            // Membre de l'équipe d'une entreprise : le rôle de la base fait foi
            const membre = await prisma.membreBusinessbi.findFirst({
                where: { OR: filtre },
                select: { role: true }
            })
            if (!membre) return
            const roleMembre = membre.role === "admin" ? "admin" : "caissier"
            if (role !== roleMembre) {
                const client = await clerkClient()
                await client.users.updateUserMetadata(user.id, {
                    publicMetadata: { role: roleMembre }
                })
            }
        })
    } catch (error) {
        console.error(error)
    }
}


// Ne crée plus de compte : renvoie le client du compte connecté, ou une erreur s'il est inconnu ou suspendu.
// Les paramètres sont conservés pour ne pas modifier les appelants, mais ils sont ignorés.
export async function getOrCreateBusinessbi(_email?: string, _name?: string) {
    const businessbi = await getBusinessbi()
    if (!businessbi) {
        throw new Error("Compte non enregistré ou accès suspendu. Contactez votre assureur.")
    }
    return businessbi
}

type BusinessbiTrouve = NonNullable<Awaited<ReturnType<typeof trouverBusinessbiPourUtilisateur>>>

// Cache court par compte Clerk : seul auth() (sans appel réseau) est lu à chaque action.
// Un accès suspendu est pris en compte avec au plus 30 s de retard.
const cacheBusinessbi = new Map<string, { expire: number; valeur: BusinessbiTrouve }>()
const DUREE_CACHE_MS = 30_000

// Renvoie l'entreprise du COMPTE CONNECTÉ (lu côté serveur) si son accès est actif
// (client non suspendu, assureur non suspendu). Le paramètre est ignoré.
export async function getBusinessbi(_email?: string) {
    try {
        const { userId } = await auth()
        if (!userId) return

        let businessbi: BusinessbiTrouve | null
        const enCache = cacheBusinessbi.get(userId)

        if (enCache && enCache.expire > Date.now()) {
            businessbi = enCache.valeur
        } else {
            const user = await currentUser()
            if (!user) return
            businessbi = await withRetry(() => trouverBusinessbiPourUtilisateur(user))
            if (businessbi) {
                cacheBusinessbi.set(userId, { expire: Date.now() + DUREE_CACHE_MS, valeur: businessbi })
            }
        }

        if (!businessbi) return
        if (!businessbi.accesActif) return
        if (businessbi.assureur && !businessbi.assureur.actif) return
        return businessbi
    } catch (error) {
        console.error(error)
    }
}

export async function getBusinessName(email: string): Promise<string> {
    try {
        const businessbi = await getBusinessbi(email)
        return businessbi?.name || "ASSURANCE.COM"
    } catch (error) {
        console.error(error)
        return "ASSURANCE.COM"
    }
}

export async function checkProductNameExists(name: string, email: string): Promise<boolean> {
    try {
        if (!name || !email) return false
        const businessbi = await getBusinessbi(email)
        if (!businessbi) return false
        const existing = await withRetry(() =>
            prisma.product.findFirst({
                where: {
                    businessbiId: businessbi.id,
                    name: { equals: name.trim(), mode: "insensitive" }
                }
            })
        )
        return !!existing
    } catch (error) {
        console.error(error)
        return false
    }
}

export async function createProduct(formData: FormDataType, email: string) {
    try {
        const { name, prixAchat, prixVente, price, unit, dateCreation, pieceUrl } = formData
        if (!email) throw new Error("Champs requis manquants.")

        // Photo d'une pièce justifiant le stock initial (facultative)
        const urlPiece = validerUrlPhoto(pieceUrl, "Photo de la pièce justificative invalide.")

        const businessbi = await getOrCreateBusinessbi(email)

        const existingProduct = await withRetry(() =>
            prisma.product.findFirst({
                where: {
                    businessbiId: businessbi.id,
                    name: { equals: name.trim(), mode: "insensitive" }
                }
            })
        )
        if (existingProduct) {
            throw new Error(`Un produit nommé "${name}" existe déjà.`)
        }

        const quantiteInitiale = Number(price || 0)
        // Si aucune date n'est fournie, on retombe sur la date/heure actuelle
        const dateReference = dateCreation ? new Date(dateCreation) : new Date()

        await withRetry(() =>
            prisma.$transaction(async (tx) => {
                const newProduct = await tx.product.create({
                    data: {
                        name,
                        price: Number(prixVente || 0),
                        prixAchat: Number(prixAchat || 0),
                        prixVente: Number(prixVente || 0),
                        quantity: 0,
                        unit: unit || "",
                        businessbiId: businessbi.id,
                        createdAt: dateReference
                    }
                })

                if (quantiteInitiale > 0) {
                    await tx.transaction.create({
                        data: {
                            type: "IN",
                            quantity: quantiteInitiale,
                            prixAchat: Number(prixAchat || 0),
                            prixVente: Number(prixVente || 0),
                            dateApprovis: dateReference,
                            createdAt: dateReference,
                            factureUrl: urlPiece,
                            productId: newProduct.id,
                            businessbiId: businessbi.id
                        }
                    })
                }

                return newProduct
            })
        )
    } catch (error: any) {
        console.error(error)
        if (error?.code === "P1001" || error?.message?.includes("Can't reach database server")) {
            throw new Error("Connexion à la base de données instable. Vérifiez votre connexion internet et réessayez.")
        }
        throw error
    }
}

// Corrections : l'erreur n'est plus avalée (la page affichait « succès » même en cas d'échec),
// le nom est vérifié, et un nom déjà pris par un autre produit est refusé (comme à la création).
export async function updateProduct(formData: FormDataType, email: string) {
    try {
        const { id, name, prixAchat, prixVente, price, unit } = formData
        if (!email || !id) throw new Error("L'id et l'email sont requis.")
        if (!name || !name.trim()) throw new Error("Le nom du produit est requis.")

        const businessbi = await getOrCreateBusinessbi(email)

        const doublon = await prisma.product.findFirst({
            where: {
                businessbiId: businessbi.id,
                id: { not: id },
                name: { equals: name.trim(), mode: "insensitive" }
            }
        })
        if (doublon) {
            throw new Error(`Un produit nommé "${name.trim()}" existe déjà.`)
        }

        await prisma.product.update({
            where: { id, businessbiId: businessbi.id },
            data: {
                name: name.trim(),
                price: Number(prixVente || price),
                prixAchat: Number(prixAchat || 0),
                prixVente: Number(prixVente || price),
                unit,
            }
        })
    } catch (error) {
        console.error(error)
        throw error
    }
}

export async function deleteProduct(id: string, email: string) {
    try {
        if (!id) throw new Error("L'id est requis pour la suppression.")
        const businessbi = await getBusinessbi(email)
        if (!businessbi) throw new Error("Aucun Business trouvé avec cet email.")

        const product = await prisma.product.findUnique({
            where: { id, businessbiId: businessbi.id }
        })
        if (!product) throw new Error("Produit introuvable.")

        const VINGT_QUATRE_HEURES_MS = 24 * 60 * 60 * 1000
        const ageMs = Date.now() - new Date(product.createdAt).getTime()
        if (ageMs > VINGT_QUATRE_HEURES_MS) {
            throw new Error("Ce produit a été créé il y a plus de 24h. Sa suppression n'est plus autorisée.")
        }

        // L'historique des sorties de stock est conservé pour les assureurs : un produit déjà vendu ne se supprime plus
        const nombreSorties = await prisma.transaction.count({
            where: { productId: id, type: "OUT" }
        })
        if (nombreSorties > 0) {
            throw new Error("Ce produit a déjà été vendu. Sa suppression n'est plus autorisée.")
        }

        // Photos (pièce du stock initial, factures d'achat) liées à ce produit : à supprimer avec lui
        const photos = await prisma.transaction.findMany({
            where: { productId: id, factureUrl: { not: null } },
            select: { factureUrl: true }
        })

        await prisma.product.delete({ where: { id, businessbiId: businessbi.id } })

        // Suppression des fichiers (sans bloquer si elle échoue)
        for (const photo of photos) {
            if (!photo.factureUrl) continue
            try {
                await del(photo.factureUrl)
            } catch (error) {
                console.error(error)
            }
        }

        return { success: true }
    } catch (error) {
        console.error(error)
        throw error
    }
}

export async function readProducts(email: string): Promise<Product[]> {
    try {
        if (!email) throw new Error("Email requis")
        const businessbi = await getBusinessbi(email)
        if (!businessbi) return []
        const products = await prisma.product.findMany({
            where: { businessbiId: businessbi.id },
            take: 50,
            orderBy: { createdAt: "desc" }
        })
        return products as Product[]
    } catch (error) {
        console.error("readProducts error:", error)
        return []
    }
}

export async function readProductById(productId: string, email: string): Promise<Product | undefined> {
    try {
        if (!email) throw new Error("l'email est requis.")
        const businessbi = await getBusinessbi(email)
        if (!businessbi) throw new Error("Aucun Business trouvé avec cet email.")
        const product = await prisma.product.findUnique({
            where: { id: productId, businessbiId: businessbi.id }
        })
        return product as Product | undefined
    } catch (error) {
        console.error(error)
    }
}

export async function replenishStockWithTransaction(
    productId: string,
    quantity: number,
    email: string,
    prixAchat: number,
    prixVente: number,
    dateApprovis: string,
    factureUrl?: string
) {
    try {
        if (quantity <= 0) throw new Error("La quantité doit être supérieure à zéro.")
        if (!email) throw new Error("l'email est requis.")

        // Photo de la facture (facultative)
        const urlFacture = validerUrlPhoto(factureUrl, "Photo de facture invalide.")

        const businessbi = await getOrCreateBusinessbi(email)
        await prisma.product.update({
            where: { id: productId, businessbiId: businessbi.id },
            data: {
                prixAchat: Number(prixAchat),
                prixVente: Number(prixVente),
                price: Number(prixVente),
            }
        })
        await prisma.transaction.create({
            data: {
                type: "IN",
                quantity,
                prixAchat: Number(prixAchat),
                prixVente: Number(prixVente),
                dateApprovis: new Date(dateApprovis),
                factureUrl: urlFacture,
                productId,
                businessbiId: businessbi.id
            }
        })
    } catch (error) {
        console.error(error)
        throw error
    }
}

async function getRealQuantity(productId: string, baseQuantity: number): Promise<number> {
    const txs = await prisma.transaction.findMany({ where: { productId } })
    const quantity = txs.reduce((acc, tx) => {
        return tx.type === "IN" ? acc + tx.quantity : acc - tx.quantity
    }, baseQuantity)
    return Math.max(0, quantity)
}

// Génère un numéro de facture séquentiel par entreprise, ex: FAC-2026-0001.
// Basé sur le dernier numéro existant (et non sur leur nombre) : annuler une vente ne crée jamais de doublon.
async function genererNumeroFacture(businessbiId: string): Promise<string> {
    const annee = new Date().getFullYear()
    const prefixe = `FAC-${annee}-`

    const derniere = await prisma.vente.findFirst({
        where: {
            businessbiId,
            avecFacture: true,
            numero: { startsWith: prefixe }
        },
        orderBy: { numero: "desc" },
        select: { numero: true }
    })

    const dernierNumero = derniere?.numero ? parseInt(derniere.numero.slice(prefixe.length), 10) : 0
    const sequence = String((Number.isNaN(dernierNumero) ? 0 : dernierNumero) + 1).padStart(4, "0")
    return `${prefixe}${sequence}`
}

export async function deductStockWithTransaction(
    orderItems: OrderItem[],
    email: string,
    montantPaye?: number,
    clientNom?: string,
    avecFacture?: boolean,
    tauxTva?: number
) {
    try {
        if (!email) return { success: false, message: "Email requis" }
        const businessbi = await getBusinessbi(email)
        if (!businessbi) return { success: false, message: "Business introuvable" }

        if (avecFacture && (!clientNom || !clientNom.trim())) {
            return { success: false, message: "Le nom du client est requis pour une vente avec facture." }
        }

        const totalHT = orderItems.reduce((acc, item) => acc + (item.prixVente || 0) * item.quantity, 0)
        const taux = avecFacture ? (tauxTva ?? 18) / 100 : 0
        const tva = totalHT * taux
        const totalTTC = totalHT + tva
        const paye = montantPaye ?? totalTTC
        const solde = paye - totalTTC

        for (const item of orderItems) {
            const product = await prisma.product.findUnique({
                where: { id: item.productId, businessbiId: businessbi.id }
            })
            if (!product) return { success: false, message: "Produit introuvable" }
            if (item.quantity <= 0) return { success: false, message: "Quantité invalide" }

            const realQuantity = await getRealQuantity(item.productId, product.quantity)
            if (realQuantity < item.quantity) {
                return { success: false, message: `Stock insuffisant pour ${product.name} (disponible : ${realQuantity})` }
            }
        }

        const numero = avecFacture ? await genererNumeroFacture(businessbi.id) : null

        const venteId = await prisma.$transaction(async (tx) => {
            const vente = await tx.vente.create({
                data: {
                    numero,
                    avecFacture: !!avecFacture,
                    clientNom: clientNom?.trim() || null,
                    montantHT: totalHT,
                    montantTVA: tva,
                    montantTotal: totalTTC,
                    montantPaye: paye,
                    solde,
                    businessbiId: businessbi.id,
                    items: {
                        create: orderItems.map((item) => ({
                            productId: item.productId,
                            productName: item.name,
                            quantity: item.quantity,
                            unit: item.unit,
                            prixVente: item.prixVente || 0,
                            prixAchat: item.prixAchat || 0
                        }))
                    }
                }
            })

            // Chaque ligne de stock est liée à sa vente (permet d'annuler la vente en entier)
            await tx.transaction.createMany({
                data: orderItems.map((item) => ({
                    type: "OUT",
                    quantity: item.quantity,
                    prixAchat: item.prixAchat || 0,
                    prixVente: item.prixVente || 0,
                    productId: item.productId,
                    businessbiId: businessbi.id,
                    venteId: vente.id
                }))
            })

            if (solde < 0) {
                await tx.dette.create({
                    data: {
                        debiteur: clientNom && clientNom.trim() ? clientNom.trim() : "Client",
                        montant: Math.abs(solde),
                        description: `Vente non soldée (${orderItems.map(i => i.name).join(", ")})`,
                        businessbiId: businessbi.id,
                        venteId: vente.id
                    }
                })
            }

            return vente.id
        })

        return { success: true, totalHT, tva, totalTTC, montantPaye: paye, solde, venteId, numero }
    } catch (error: any) {
        console.error("ERROR GIVE:", error)
        return { success: false, message: error.message || "Erreur serveur" }
    }
}

// Récupère toutes les infos d'une vente pour l'impression de la facture
export async function getVenteForPrint(venteId: string, email: string) {
    try {
        const businessbi = await getBusinessbi(email)
        if (!businessbi) return null
        const vente = await prisma.vente.findUnique({
            where: { id: venteId, businessbiId: businessbi.id },
            include: { items: true }
        })
        if (!vente) return null
        return {
            ...vente,
            businessName: businessbi.name
        }
    } catch (error) {
        console.error(error)
        return null
    }
}

function versTransaction(tx: any): Transaction {
    return {
        ...tx,
        productName: tx.product.name,
        price: tx.product.price,
        unit: tx.product.unit,
        prixAchat: tx.prixAchat,
        prixVente: tx.prixVente,
    } as Transaction
}

export async function getTransactions(email: string, limit?: number): Promise<Transaction[]> {
    try {
        if (!email) throw new Error("l'email est requis.")
        const businessbi = await getBusinessbi(email)
        if (!businessbi) throw new Error("Aucun Business trouvé avec cet email.")
        const transactions = await prisma.transaction.findMany({
            where: { businessbiId: businessbi.id },
            orderBy: { createdAt: "desc" },
            take: limit,
            include: { product: true }
        })
        return transactions.map(versTransaction)
    } catch (error) {
        console.error(error)
        return []
    }
}

const STATS_VIDES: ProductOverviewStats = {
    totalProducts: 0,
    totalTransactions: 0,
    stockValue: 0,
    valeurAchats: 0,
    valeurVentes: 0,
    totalDepenses: 0,
    totalDettes: 0,
    dettesDonnees: 0,
    dettesPaye: 0,
}

// Chiffres de la période. Les sommes sont faites par la base (aggregate / groupBy),
// plus de chargement de tout l'historique. Si stockValueConnu est fourni, le calcul
// du stock est sauté (déjà fait par l'appelant).
async function statsPeriode(
    businessbiId: string,
    dateFiltre?: string,
    stockValueConnu?: number
): Promise<ProductOverviewStats> {
    const dateLte = dateFiltre ? finDeJournee(dateFiltre) : undefined
    const dateGte = dateFiltre ? new Date(dateFiltre + "T00:00:00.000Z") : undefined
    const periode = dateGte && dateLte
    const avecStock = stockValueConnu === undefined

    const [
        transactionsDuJour,
        mouvementsCumules,
        depenses,
        dettes,
        paiements,
        totalProducts,
        products
    ] = await Promise.all([
        prisma.transaction.findMany({
            where: {
                businessbiId,
                ...(periode ? { createdAt: { gte: dateGte, lte: dateLte } } : {})
            },
            select: {
                type: true,
                quantity: true,
                product: { select: { prixAchat: true, prixVente: true } }
            }
        }),
        avecStock
            ? prisma.transaction.groupBy({
                by: ["productId", "type"],
                where: { businessbiId, ...filtreMouvementsJusqua(dateLte) },
                _sum: { quantity: true }
            })
            : Promise.resolve(null),
        prisma.depense.aggregate({
            where: {
                businessbiId,
                ...(periode ? { date: { gte: dateGte, lte: dateLte } } : {})
            },
            _sum: { montant: true }
        }),
        // Dettes accordées pendant la période
        prisma.dette.findMany({
            where: {
                businessbiId,
                ...(periode ? { createdAt: { gte: dateGte, lte: dateLte } } : {})
            },
            select: { montant: true, montantPaye: true }
        }),
        // Paiements reçus pendant la période, quelle que soit la date de création de la dette
        prisma.paiement.aggregate({
            where: {
                dette: { businessbiId },
                ...(periode ? { date: { gte: dateGte, lte: dateLte } } : {})
            },
            _sum: { montant: true }
        }),
        prisma.product.count({ where: { businessbiId } }),
        avecStock
            ? prisma.product.findMany({
                where: { businessbiId },
                select: { id: true, prixVente: true, quantity: true }
            })
            : Promise.resolve(null)
    ])

    let stockValue = stockValueConnu ?? 0
    if (mouvementsCumules && products) {
        const quantiteParProduit: Record<string, number> = {}
        products.forEach(p => { quantiteParProduit[p.id] = p.quantity })
        mouvementsCumules.forEach(m => {
            if (!(m.productId in quantiteParProduit)) return
            const q = m._sum.quantity ?? 0
            quantiteParProduit[m.productId] += m.type === "IN" ? q : -q
        })
        stockValue = products.reduce(
            (acc, p) => acc + p.prixVente * Math.max(0, quantiteParProduit[p.id] ?? 0),
            0
        )
    }

    const valeurAchats = transactionsDuJour
        .filter(tx => tx.type === "IN")
        .reduce((acc, tx) => acc + tx.product.prixAchat * tx.quantity, 0)

    const valeurVentes = transactionsDuJour
        .filter(tx => tx.type === "OUT")
        .reduce((acc, tx) => acc + tx.product.prixVente * tx.quantity, 0)

    const dettesDonnees = dettes.reduce((acc, d) => acc + d.montant, 0)
    // Reste à payer sur les dettes accordées pendant la période
    const totalDettes = dettes.reduce((acc, d) => acc + Math.max(0, d.montant - d.montantPaye), 0)

    return {
        totalProducts,
        totalTransactions: transactionsDuJour.length,
        stockValue,
        valeurAchats,
        valeurVentes,
        totalDepenses: depenses._sum.montant ?? 0,
        totalDettes,
        dettesDonnees,
        dettesPaye: paiements._sum.montant ?? 0,
    }
}

export async function getProductOverviewStats(email: string, dateFiltre?: string): Promise<ProductOverviewStats> {
    try {
        if (!email) throw new Error("l'email est requis.")
        const businessbi = await getBusinessbi(email)
        if (!businessbi) throw new Error("Aucun Business trouvé avec cet email.")
        return await statsPeriode(businessbi.id, dateFiltre)
    } catch (error) {
        console.error(error)
        return { ...STATS_VIDES }
    }
}

type LignesStock = Awaited<ReturnType<typeof calculerStock>>

// Répartition du stock (seuil de stock faible : 12)
function resumerStock(lignes: LignesStock): StockSummary {
    const inStock = lignes.filter(l => l.quantity > 12)
    const lowStock = lignes.filter(l => l.quantity > 0 && l.quantity <= 12)
    const outOfStock = lignes.filter(l => l.quantity === 0)
    const criticalProducts = [...lowStock, ...outOfStock]

    return {
        inStockCount: inStock.length,
        lowStockCount: lowStock.length,
        outOfStockCount: outOfStock.length,
        criticalProducts: criticalProducts.map(l => ({
            ...l.product,
            quantity: l.quantity,
        })) as Product[]
    }
}

export async function getStockSummary(email: string, dateFiltre?: string): Promise<StockSummary> {
    try {
        if (!email) throw new Error("l'email est requis.")
        const businessbi = await getBusinessbi(email)
        if (!businessbi) throw new Error("Aucun Business trouvé avec cet email.")

        // Même calcul que la vue assureur : quantité de base + entrées - sorties jusqu'à la date
        const lignes = await calculerStock(businessbi.id, dateFiltre)
        return resumerStock(lignes)
    } catch (error) {
        console.error(error)
        return { inStockCount: 0, lowStockCount: 0, outOfStockCount: 0, criticalProducts: [] }
    }
}

// Prix d'achat unitaire à retenir pour chaque vente : celui du dernier achat (IN) du même produit
// enregistré avant elle (même règle que la page Historique). Clé du résultat : id de la transaction.
async function coutsAchatDesVentes(
    businessbiId: string,
    ventes: { id: string; productId: string; createdAt: Date }[],
    fin?: Date
): Promise<Record<string, number>> {
    if (ventes.length === 0) return {}

    const productIds = [...new Set(ventes.map(v => v.productId))]
    const achats = await prisma.transaction.findMany({
        where: {
            businessbiId,
            type: "IN",
            productId: { in: productIds },
            ...(fin ? { createdAt: { lte: fin } } : {})
        },
        select: { productId: true, createdAt: true, prixAchat: true },
        orderBy: { createdAt: "desc" }
    })

    const achatsParProduit = new Map<string, { createdAt: Date; prixAchat: number }[]>()
    for (const a of achats) {
        const liste = achatsParProduit.get(a.productId)
        if (liste) liste.push(a)
        else achatsParProduit.set(a.productId, [a])
    }

    const resultat: Record<string, number> = {}
    for (const v of ventes) {
        const liste = achatsParProduit.get(v.productId) ?? []
        const precedent = liste.find(a => a.createdAt.getTime() <= v.createdAt.getTime())
        resultat[v.id] = precedent?.prixAchat || 0
    }
    return resultat
}

export type DashboardData = {
    stockValue: number
    stats: ProductOverviewStats
    summary: StockSummary
    transactions: Transaction[]
    // Prix d'achat unitaire de chaque vente affichée (clé : id de la transaction)
    coutsAchat: Record<string, number>
}

// Tout le tableau de bord en UNE action : l'entreprise est cherchée une fois,
// le stock calculé une fois, et le reste part en parallèle.
export async function getDashboard(email: string, dateFiltre?: string): Promise<DashboardData | null> {
    try {
        if (!email) throw new Error("l'email est requis.")
        const businessbi = await getBusinessbi(email)
        if (!businessbi) throw new Error("Aucun Business trouvé avec cet email.")

        const dateLte = dateFiltre ? finDeJournee(dateFiltre) : undefined
        const dateGte = dateFiltre ? new Date(dateFiltre + "T00:00:00.000Z") : undefined

        const [lignes, transactionsBrutes] = await Promise.all([
            calculerStock(businessbi.id, dateFiltre),
            // Seules les opérations du jour sont chargées (le filtre se faisait avant dans le navigateur)
            prisma.transaction.findMany({
                where: {
                    businessbiId: businessbi.id,
                    ...(dateGte && dateLte ? { createdAt: { gte: dateGte, lte: dateLte } } : {})
                },
                orderBy: { createdAt: "desc" },
                include: { product: true }
            })
        ])

        const stockValue = lignes.reduce((acc, l) => acc + l.valeurVente, 0)

        const ventes = transactionsBrutes
            .filter(tx => tx.type !== "IN")
            .map(tx => ({ id: tx.id, productId: tx.productId, createdAt: tx.createdAt }))

        const [stats, coutsAchat] = await Promise.all([
            statsPeriode(businessbi.id, dateFiltre, stockValue),
            coutsAchatDesVentes(businessbi.id, ventes, dateLte)
        ])

        return {
            stockValue,
            stats,
            summary: resumerStock(lignes),
            transactions: transactionsBrutes.map(versTransaction),
            coutsAchat
        }
    } catch (error) {
        console.error("getDashboard error:", error)
        return null
    }
}

// ─────────────────────────────────────────────
// DEPENSES
// ─────────────────────────────────────────────

type DepenseData = { montant: number; description: string; categorie: string; date: string }

function validerDepense(data: DepenseData) {
    const montant = Number(data.montant)
    if (!montant || montant <= 0) throw new Error("Le montant doit être supérieur à 0.")
    if (!data.description?.trim() || !data.categorie || !data.date) {
        throw new Error("Champs requis manquants.")
    }
    return {
        montant,
        description: data.description.trim(),
        categorie: data.categorie,
        date: new Date(data.date),
    }
}

export async function createDepense(data: DepenseData, email: string) {
    const valide = validerDepense(data)
    const businessbi = await getOrCreateBusinessbi(email)
    await prisma.depense.create({
        data: { ...valide, businessbiId: businessbi.id }
    })
    return { success: true }
}

export async function readDepenses(email: string) {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) throw new Error("Business introuvable")
    return await prisma.depense.findMany({
        where: { businessbiId: businessbi.id },
        orderBy: { date: "desc" }
    })
}

// La dépense doit appartenir au client connecté (sinon Prisma renvoie une erreur)
export async function updateDepense(id: string, data: DepenseData, email: string) {
    const valide = validerDepense(data)
    const businessbi = await getBusinessbi(email)
    if (!businessbi) throw new Error("Business introuvable")
    await prisma.depense.update({
        where: { id, businessbiId: businessbi.id },
        data: valide
    })
    return { success: true }
}

export async function deleteDepense(id: string, email: string) {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) throw new Error("Business introuvable")
    await prisma.depense.delete({
        where: { id, businessbiId: businessbi.id }
    })
    return { success: true }
}


// ─────────────────────────────────────────────
// DETTES & PAIEMENTS
// ─────────────────────────────────────────────

type DetteData = { debiteur: string; montant: number; description: string; dateEcheance?: string }

function validerDette(data: DetteData) {
    const montant = Number(data.montant)
    if (!montant || montant <= 0) throw new Error("Le montant doit être supérieur à 0.")
    if (!data.debiteur?.trim() || !data.description?.trim()) {
        throw new Error("Champs requis manquants.")
    }
    return {
        debiteur: data.debiteur.trim(),
        montant,
        description: data.description.trim(),
        dateEcheance: data.dateEcheance ? new Date(data.dateEcheance) : null,
    }
}

function statutDette(montant: number, totalPaye: number) {
    if (totalPaye >= montant) return "solde"
    if (totalPaye > 0) return "partiellement_paye"
    return "en_cours"
}

export async function createDette(data: DetteData, email: string) {
    const valide = validerDette(data)
    const businessbi = await getOrCreateBusinessbi(email)
    await prisma.dette.create({
        data: { ...valide, businessbiId: businessbi.id }
    })
    return { success: true }
}

export async function readDettes(email: string) {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) throw new Error("Business introuvable")
    return await prisma.dette.findMany({
        where: { businessbiId: businessbi.id },
        include: { paiements: { orderBy: { date: "desc" } } },
        orderBy: { createdAt: "desc" }
    })
}

// La dette doit appartenir au client connecté. Le statut est recalculé si le montant change.
export async function updateDette(id: string, data: DetteData, email: string) {
    const valide = validerDette(data)
    const businessbi = await getBusinessbi(email)
    if (!businessbi) throw new Error("Business introuvable")

    const dette = await prisma.dette.findFirst({
        where: { id, businessbiId: businessbi.id }
    })
    if (!dette) throw new Error("Dette introuvable")

    await prisma.dette.update({
        where: { id, businessbiId: businessbi.id },
        data: { ...valide, statut: statutDette(valide.montant, dette.montantPaye) }
    })
    return { success: true }
}

export async function deleteDette(id: string, email: string) {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) throw new Error("Business introuvable")

    const dette = await prisma.dette.findFirst({
        where: { id, businessbiId: businessbi.id },
        select: { id: true }
    })
    if (!dette) throw new Error("Dette introuvable")

    await prisma.$transaction([
        prisma.paiement.deleteMany({ where: { detteId: id } }),
        prisma.dette.delete({ where: { id, businessbiId: businessbi.id } })
    ])
    return { success: true }
}

export async function addPaiement(
    detteId: string,
    data: { montant: number; note?: string; date: string },
    email: string
) {
    const montant = Number(data.montant)
    if (!montant || montant <= 0) throw new Error("Le montant doit être supérieur à 0.")
    if (!data.date) throw new Error("La date est requise.")

    const businessbi = await getBusinessbi(email)
    if (!businessbi) throw new Error("Business introuvable")

    const dette = await prisma.dette.findFirst({
        where: { id: detteId, businessbiId: businessbi.id },
        include: { paiements: true }
    })
    if (!dette) throw new Error("Dette introuvable")

    const dejaPaye = dette.paiements.reduce((sum, p) => sum + p.montant, 0)
    if (dejaPaye + montant > dette.montant) {
        throw new Error("Le paiement dépasse le reste à payer.")
    }

    await prisma.$transaction(async (tx) => {
        await tx.paiement.create({
            data: {
                montant,
                note: data.note?.trim() || null,
                date: new Date(data.date),
                detteId,
            }
        })
        const somme = await tx.paiement.aggregate({
            where: { detteId },
            _sum: { montant: true }
        })
        const totalPaye = somme._sum.montant ?? 0
        await tx.dette.update({
            where: { id: detteId },
            data: { montantPaye: totalPaye, statut: statutDette(dette.montant, totalPaye) }
        })
    })
    return { success: true }
}

export async function deletePaiement(paiementId: string, detteId: string, email: string) {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) throw new Error("Business introuvable")

    // Le paiement doit appartenir à cette dette, et la dette au client connecté
    const paiement = await prisma.paiement.findFirst({
        where: { id: paiementId, detteId, dette: { businessbiId: businessbi.id } },
        include: { dette: true }
    })
    if (!paiement) throw new Error("Paiement introuvable")

    await prisma.$transaction(async (tx) => {
        await tx.paiement.delete({ where: { id: paiementId } })
        const somme = await tx.paiement.aggregate({
            where: { detteId },
            _sum: { montant: true }
        })
        const totalPaye = somme._sum.montant ?? 0
        await tx.dette.update({
            where: { id: detteId },
            data: { montantPaye: totalPaye, statut: statutDette(paiement.dette.montant, totalPaye) }
        })
    })
    return { success: true }
}


export async function readProductsWithRealQuantity(email: string): Promise<Product[]> {
    try {
        if (!email) throw new Error("Email requis")
        const businessbi = await getBusinessbi(email)
        if (!businessbi) return []

        // Les deux lectures sont indépendantes : on les lance en parallèle
        const [products, transactions] = await Promise.all([
            prisma.product.findMany({
                where: { businessbiId: businessbi.id },
                orderBy: { createdAt: "desc" }
            }),
            prisma.transaction.findMany({
                where: { businessbiId: businessbi.id },
                orderBy: { createdAt: "desc" }
            })
        ])

        return products.map(p => {
            const txs = transactions.filter(tx => tx.productId === p.id)
            const quantity = txs.reduce((acc, tx) => {
                return tx.type === "IN" ? acc + tx.quantity : acc - tx.quantity
            }, p.quantity)
            return {
                ...p,
                quantity: Math.max(0, quantity)
            }
        }) as Product[]
    } catch (error) {
        console.error("readProductsWithRealQuantity error:", error)
        return []
    }
}

// Valeur du stock (au prix de vente) à une date, ou actuelle si aucune date.
// Même calcul que la vue assureur (lib/stock.ts).
export async function getValeurStock(email: string, dateFiltre?: string): Promise<number> {
    try {
        if (!email) throw new Error("Email requis")
        const businessbi = await getBusinessbi(email)
        if (!businessbi) return 0

        const lignes = await calculerStock(businessbi.id, dateFiltre)
        return lignes.reduce((acc, l) => acc + l.valeurVente, 0)
    } catch (error) {
        console.error("getValeurStock error:", error)
        return 0
    }
}

// ─────────────────────────────────────────────
// CAISSE
// ─────────────────────────────────────────────

export async function getNextOrdo(email: string) {
  const businessbi = await getOrCreateBusinessbi(email)
  const last = await prisma.caisseEntry.findFirst({
    where: { businessbiId: businessbi.id },
    orderBy: { ordo: 'desc' }
  })
  return (last?.ordo ?? 0) + 1
}

export async function getCaisseEntryByOrdo(email: string, ordo: number): Promise<CaisseEntry | null> {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) return null
    const entry = await prisma.caisseEntry.findFirst({
      where: { businessbiId: businessbi.id, ordo }
    })
    return entry as unknown as CaisseEntry | null
  } catch (error) {
    console.error(error)
    return null
  }
}

export async function createCaisseEntry(data: CaisseFormType, email: string) {
  try {
    const businessbi = await getOrCreateBusinessbi(email)
    const ordo = await getNextOrdo(email)
    const debit = data.type === "DEBIT" ? Number(data.montant) : 0
    const credit = data.type === "CREDIT" ? Number(data.montant) : 0
    await prisma.caisseEntry.create({
      data: {
        ordo,
        date: new Date(data.date),
        libelle: data.libelle,
        categorie: data.categorie,
        type: data.type,
        debit,
        credit,
        businessbiId: businessbi.id
      }
    })
  } catch (error) {
    console.error(error)
    throw error
  }
}

export async function updateCaisseEntry(id: string, data: CaisseFormType, email: string) {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) throw new Error("Aucun Business trouvé.")
    const debit = data.type === "DEBIT" ? Number(data.montant) : 0
    const credit = data.type === "CREDIT" ? Number(data.montant) : 0
    await prisma.caisseEntry.update({
      where: { id, businessbiId: businessbi.id },
      data: {
        date: new Date(data.date),
        libelle: data.libelle,
        categorie: data.categorie,
        type: data.type,
        debit,
        credit
      }
    })
  } catch (error) {
    console.error(error)
    throw error
  }
}

export async function deleteCaisseEntry(id: string, email: string) {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) throw new Error("Aucun Business trouvé.")
    await prisma.caisseEntry.delete({ where: { id, businessbiId: businessbi.id } })
  } catch (error) {
    console.error(error)
    throw error
  }
}

export async function getCaisseEntries(
  email: string,
  dateDebut: string,
  dateFin: string,
  categorie?: string
): Promise<CaisseEntry[]> {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) return []
    const start = new Date(dateDebut)
    start.setHours(0, 0, 0, 0)
    const end = new Date(dateFin)
    end.setHours(23, 59, 59, 999)

    const where: any = {
      businessbiId: businessbi.id,
      date: { gte: start, lte: end }
    }
    if (categorie) where.categorie = categorie

    const entries = await prisma.caisseEntry.findMany({
      where,
      orderBy: [{ date: 'asc' }, { ordo: 'asc' }]
    })
    return entries as unknown as CaisseEntry[]
  } catch (error) {
    console.error(error)
    return []
  }
}

export async function getReportAvant(email: string, dateDebut: string) {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) return 0
    const start = new Date(dateDebut)
    start.setHours(0, 0, 0, 0)
    const entries = await prisma.caisseEntry.findMany({
      where: { businessbiId: businessbi.id, date: { lt: start } }
    })
    return entries.reduce((acc: number, e: { debit: number; credit: number }) => acc + e.debit - e.credit, 0)
  } catch (error) {
    console.error(error)
    return 0
  }
}

// ─────────────────────────────────────────────
// BANQUE
// ─────────────────────────────────────────────

export async function getNextOrdoBanque(email: string) {
  const businessbi = await getOrCreateBusinessbi(email)
  const last = await prisma.banqueEntry.findFirst({
    where: { businessbiId: businessbi.id },
    orderBy: { ordo: 'desc' }
  })
  return (last?.ordo ?? 0) + 1
}

export async function getBanqueEntryByOrdo(email: string, ordo: number): Promise<BanqueEntry | null> {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) return null
    const entry = await prisma.banqueEntry.findFirst({
      where: { businessbiId: businessbi.id, ordo }
    })
    return entry as unknown as BanqueEntry | null
  } catch (error) {
    console.error(error)
    return null
  }
}

export async function createBanqueEntry(data: BanqueFormType, email: string) {
  try {
    const businessbi = await getOrCreateBusinessbi(email)
    const ordo = await getNextOrdoBanque(email)
    const credit = data.type === "CREDIT" ? Number(data.montant) : 0
    const debit = data.type === "DEBIT" ? Number(data.montant) : 0
    await prisma.banqueEntry.create({
      data: {
        ordo,
        date: new Date(data.date),
        bordereau: data.bordereau,
        libelle: data.libelle,
        banque: data.banque,
        compte: data.compte,
        categorie: data.categorie,
        type: data.type,
        credit,
        debit,
        businessbiId: businessbi.id
      }
    })
  } catch (error) {
    console.error(error)
    throw error
  }
}

export async function updateBanqueEntry(id: string, data: BanqueFormType, email: string) {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) throw new Error("Aucun Business trouvé.")
    const credit = data.type === "CREDIT" ? Number(data.montant) : 0
    const debit = data.type === "DEBIT" ? Number(data.montant) : 0
    await prisma.banqueEntry.update({
      where: { id, businessbiId: businessbi.id },
      data: {
        date: new Date(data.date),
        bordereau: data.bordereau,
        libelle: data.libelle,
        banque: data.banque,
        compte: data.compte,
        categorie: data.categorie,
        type: data.type,
        credit,
        debit
      }
    })
  } catch (error) {
    console.error(error)
    throw error
  }
}

export async function deleteBanqueEntry(id: string, email: string) {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) throw new Error("Aucun Business trouvé.")
    await prisma.banqueEntry.delete({ where: { id, businessbiId: businessbi.id } })
  } catch (error) {
    console.error(error)
    throw error
  }
}

export async function getBanqueEntries(
  email: string,
  dateDebut: string,
  dateFin: string,
  banque?: string,
  compte?: string
): Promise<BanqueEntry[]> {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) return []
    const start = new Date(dateDebut)
    start.setHours(0, 0, 0, 0)
    const end = new Date(dateFin)
    end.setHours(23, 59, 59, 999)

    const where: any = {
      businessbiId: businessbi.id,
      date: { gte: start, lte: end }
    }
    if (banque) where.banque = banque
    if (compte) where.compte = compte

    const entries = await prisma.banqueEntry.findMany({
      where,
      orderBy: [{ date: 'asc' }, { ordo: 'asc' }]
    })
    return entries as unknown as BanqueEntry[]
  } catch (error) {
    console.error(error)
    return []
  }
}

export async function getReportAvantBanque(email: string, dateDebut: string) {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) return 0
    const start = new Date(dateDebut)
    start.setHours(0, 0, 0, 0)
    const entries = await prisma.banqueEntry.findMany({
      where: { businessbiId: businessbi.id, date: { lt: start } }
    })
    return entries.reduce((acc: number, e: { credit: number; debit: number }) => acc + e.credit - e.debit, 0)
  } catch (error) {
    console.error(error)
    return 0
  }
}

export async function getBanquesEtComptes(email: string) {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) return { banques: [], comptes: [] }
    const entries = await prisma.banqueEntry.findMany({
      where: { businessbiId: businessbi.id },
      select: { banque: true, compte: true }
    })
    const banques = Array.from(new Set(entries.map((e: { banque: string }) => e.banque))).filter(Boolean)
    const comptes = Array.from(new Set(entries.map((e: { compte: string }) => e.compte))).filter(Boolean)
    return { banques, comptes }
  } catch (error) {
    console.error(error)
    return { banques: [], comptes: [] }
  }
}

// ─────────────────────────────────────────────
// CENTRALISATION : Banque + Caisse
// ─────────────────────────────────────────────
export async function getCentralisation(email: string, dateDebut: string, dateFin: string) {
  const vide = { report: 0, totalDebit: 0, totalCredit: 0, solde: 0, entries: [] as any[] }
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) {
      return { banque: vide, caisse: vide, soldeGeneral: 0 }
    }

    const [banqueEntries, banqueReport, caisseEntries, caisseReport] = await Promise.all([
      getBanqueEntries(email, dateDebut, dateFin),
      getReportAvantBanque(email, dateDebut),
      getCaisseEntries(email, dateDebut, dateFin),
      getReportAvant(email, dateDebut)
    ])

    const banqueTotalCredit = banqueEntries.reduce((acc: number, e: any) => acc + e.credit, 0)
    const banqueTotalDebit = banqueEntries.reduce((acc: number, e: any) => acc + e.debit, 0)
    const soldeBanque = banqueReport + banqueTotalCredit - banqueTotalDebit

    const caisseTotalDebit = caisseEntries.reduce((acc: number, e: any) => acc + e.debit, 0)
    const caisseTotalCredit = caisseEntries.reduce((acc: number, e: any) => acc + e.credit, 0)
    const soldeCaisse = caisseReport + caisseTotalDebit - caisseTotalCredit

    return {
      banque: {
        report: banqueReport,
        totalCredit: banqueTotalCredit,
        totalDebit: banqueTotalDebit,
        solde: soldeBanque,
        entries: banqueEntries
      },
      caisse: {
        report: caisseReport,
        totalDebit: caisseTotalDebit,
        totalCredit: caisseTotalCredit,
        solde: soldeCaisse,
        entries: caisseEntries
      },
      soldeGeneral: soldeBanque + soldeCaisse
    }
  } catch (error) {
    console.error(error)
    return { banque: vide, caisse: vide, soldeGeneral: 0 }
  }
}

// ─────────────────────────────────────────────
// COMPARAISON
// ─────────────────────────────────────────────
export async function getComparaisonCommerciale(email: string, dateDebut: string, dateFin: string) {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) return { ventes: 0, depenses: 0, dettesDonnees: 0, dettesPaye: 0 }

    const start = new Date(dateDebut)
    start.setHours(0, 0, 0, 0)
    const end = new Date(dateFin)
    end.setHours(23, 59, 59, 999)

    const [ventesTx, depenses, dettes, paiementsPeriode] = await Promise.all([
      prisma.transaction.findMany({
        where: { businessbiId: businessbi.id, type: "OUT", createdAt: { gte: start, lte: end } }
      }),
      prisma.depense.findMany({
        where: { businessbiId: businessbi.id, date: { gte: start, lte: end } }
      }),
      prisma.dette.findMany({
        where: { businessbiId: businessbi.id, createdAt: { gte: start, lte: end } }
      }),
      prisma.paiement.findMany({
        where: {
          date: { gte: start, lte: end },
          dette: { businessbiId: businessbi.id }
        }
      })
    ])

    const ventes = ventesTx.reduce((acc, tx) => acc + (tx.prixVente || 0) * tx.quantity, 0)
    const totalDepenses = depenses.reduce((acc, d) => acc + d.montant, 0)
    const dettesDonnees = dettes.reduce((acc, d) => acc + d.montant, 0)
    const dettesPaye = paiementsPeriode.reduce((acc, p) => acc + p.montant, 0)

    return { ventes, depenses: totalDepenses, dettesDonnees, dettesPaye }
  } catch (error) {
    console.error("getComparaisonCommerciale error:", error)
    return { ventes: 0, depenses: 0, dettesDonnees: 0, dettesPaye: 0 }
  }
}

// ─────────────────────────────────────────────
// BILAN DE PERIODE
// ─────────────────────────────────────────────
export async function getBilanPeriode(email: string, dateDebut: string, dateFin: string) {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) return null

    const start = new Date(dateDebut)
    start.setHours(0, 0, 0, 0)
    const end = new Date(dateFin)
    end.setHours(23, 59, 59, 999)

    const [
      valeurStockDebut,
      valeurStockFin,
      transactionsPeriode,
      depenses,
      dettes,
      paiementsPeriode,
      caisseEntries,
      banqueEntries,
      caisseReport,
      banqueReport
    ] = await Promise.all([
      getValeurStock(email, dateDebut),
      getValeurStock(email, dateFin),
      prisma.transaction.findMany({
        where: { businessbiId: businessbi.id, createdAt: { gte: start, lte: end } }
      }),
      prisma.depense.findMany({
        where: { businessbiId: businessbi.id, date: { gte: start, lte: end } }
      }),
      prisma.dette.findMany({
        where: { businessbiId: businessbi.id, createdAt: { gte: start, lte: end } }
      }),
      prisma.paiement.findMany({
        where: {
          date: { gte: start, lte: end },
          dette: { businessbiId: businessbi.id }
        }
      }),
      prisma.caisseEntry.findMany({
        where: { businessbiId: businessbi.id, date: { gte: start, lte: end } }
      }),
      prisma.banqueEntry.findMany({
        where: { businessbiId: businessbi.id, date: { gte: start, lte: end } }
      }),
      getReportAvant(email, dateDebut),
      getReportAvantBanque(email, dateDebut)
    ])

    const valeurAchats = transactionsPeriode
      .filter(tx => tx.type === "IN")
      .reduce((acc, tx) => acc + (tx.prixAchat || 0) * tx.quantity, 0)

    const valeurVentes = transactionsPeriode
      .filter(tx => tx.type === "OUT")
      .reduce((acc, tx) => acc + (tx.prixVente || 0) * tx.quantity, 0)

    const totalDepenses = depenses.reduce((acc, d) => acc + d.montant, 0)
    const dettesDonnees = dettes.reduce((acc, d) => acc + d.montant, 0)
    const dettesPaye = paiementsPeriode.reduce((acc, p) => acc + p.montant, 0)

    const caisseDebit = caisseEntries.reduce((acc, e) => acc + e.debit, 0)
    const caisseCredit = caisseEntries.reduce((acc, e) => acc + e.credit, 0)
    const banqueCredit = banqueEntries.reduce((acc, e) => acc + e.credit, 0)
    const banqueDebit = banqueEntries.reduce((acc, e) => acc + e.debit, 0)

    return {
      valeurStockDebut,
      valeurStockFin,
      valeurAchats,
      valeurVentes,
      totalDepenses,
      dettesDonnees,
      dettesPaye,
      caisseDebit,
      caisseCredit,
      banqueDebit,
      banqueCredit,
      caisseReport,
      banqueReport
    }
  } catch (error) {
    console.error("getBilanPeriode error:", error)
    return null
  }
}

// ─────────────────────────────────────────────
// CATEGORIES (Caisse / Banque)
// ─────────────────────────────────────────────

export async function getCategories(
  email: string,
  module: "CAISSE" | "BANQUE",
  type: "DEBIT" | "CREDIT"
): Promise<string[]> {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) return []
    const categories = await prisma.categorie.findMany({
      where: { businessbiId: businessbi.id, module, type },
      orderBy: { nom: "asc" }
    })
    return categories.map(c => c.nom)
  } catch (error) {
    console.error(error)
    return []
  }
}

export async function createCategorie(
  email: string,
  nom: string,
  module: "CAISSE" | "BANQUE",
  type: "DEBIT" | "CREDIT"
): Promise<string> {
  if (!nom || !nom.trim()) throw new Error("Le nom de la catégorie est requis.")
  const businessbi = await getOrCreateBusinessbi(email)
  try {
    const categorie = await prisma.categorie.create({
      data: {
        nom: nom.trim(),
        module,
        type,
        businessbiId: businessbi.id
      }
    })
    return categorie.nom
  } catch (error: any) {
    if (error?.code === "P2002") {
      // Catégorie déjà existante pour ce businessbi/module/type : on la réutilise
      return nom.trim()
    }
    console.error(error)
    throw error
  }
}

export async function deleteCategorie(
  email: string,
  nom: string,
  module: "CAISSE" | "BANQUE",
  type: "DEBIT" | "CREDIT"
) {
  try {
    const businessbi = await getBusinessbi(email)
    if (!businessbi) throw new Error("Aucun Business trouvé.")
    await prisma.categorie.delete({
      where: {
        businessbiId_module_type_nom: {
          businessbiId: businessbi.id,
          module,
          type,
          nom
        }
      }
    })
    return { success: true }
  } catch (error) {
    console.error(error)
    throw error
  }
}
