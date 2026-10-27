import { config } from "dotenv"
import { PrismaClient } from "@prisma/client"

// Charge la base indiquée dans .env.local (même base que l'application)
config({ path: ".env.local" })
config()

const prisma = new PrismaClient()

// Emails des comptes de démonstration (à créer aussi dans Clerk)
const EMAIL_ASSUREUR = "kingstarmuha1@gmail.com"
const EMAIL_CLIENT = "kingstarmuha1@gmail.com"
const EMAIL_CLIENT_2 = "nkuflorix@gmail.com" // sans compte : sert à remplir la liste de l'assureur
const CODE_ASSUREUR = "DEMO2026"

// Date locale d'il y a d jours, à l'heure h
const jour = (d: number, h = 10) => {
    const x = new Date()
    x.setDate(x.getDate() - d)
    x.setHours(h, 0, 0, 0)
    return x
}

// Supprime les données de démonstration existantes (uniquement celles-ci)
async function nettoyer() {
    const clients = await prisma.businessbi.findMany({
        where: { email: { in: [EMAIL_CLIENT, EMAIL_CLIENT_2] } },
        select: { id: true }
    })
    for (const { id } of clients) {
        await prisma.transaction.deleteMany({ where: { businessbiId: id } })
        await prisma.vente.deleteMany({ where: { businessbiId: id } })
        await prisma.dette.deleteMany({ where: { businessbiId: id } })
        await prisma.depense.deleteMany({ where: { businessbiId: id } })
        await prisma.caisseEntry.deleteMany({ where: { businessbiId: id } })
        await prisma.banqueEntry.deleteMany({ where: { businessbiId: id } })
        await prisma.categorie.deleteMany({ where: { businessbiId: id } })
        await prisma.immobilisation.deleteMany({ where: { businessbiId: id } })
        await prisma.mouvementStock.deleteMany({ where: { businessbiId: id } })
        await prisma.product.deleteMany({ where: { businessbiId: id } })
        await prisma.membreBusinessbi.deleteMany({ where: { businessbiId: id } })
        await prisma.businessbi.delete({ where: { id } })
    }
    const assureur = await prisma.assureur.findUnique({ where: { code: CODE_ASSUREUR } })
    if (assureur) {
        await prisma.assureurUser.deleteMany({ where: { assureurId: assureur.id } })
        await prisma.assureur.delete({ where: { id: assureur.id } })
    }
}

type ProduitDemo = { nom: string; unite: string; pa: number; pv: number; stockInitial: number }

// Crée un client avec ses produits, ses approvisionnements, ses ventes sur 10 jours,
// une dette partiellement payée et quelques dépenses
async function creerClient(
    assureurId: string,
    infos: { name: string; email: string; rc: string; nif: string; secteur: string; proprietaire: string },
    produits: ProduitDemo[],
    avecHistorique: boolean
) {
    const client = await prisma.businessbi.create({
        data: {
            name: infos.name,
            email: infos.email,
            assureurId,
            numeroPolice: infos.rc,
            nif: infos.nif,
            secteurActivite: infos.secteur,
            proprietaire: infos.proprietaire,
            accesActif: true
        }
    })

    // Produits et stock initial (approvisionnement d'il y a 12 jours)
    const creees: { id: string; nom: string; unite: string; pa: number; pv: number }[] = []
    for (const p of produits) {
        const produit = await prisma.product.create({
            data: {
                name: p.nom,
                unit: p.unite,
                prixAchat: p.pa,
                prixVente: p.pv,
                price: p.pv,
                quantity: 0,
                businessbiId: client.id,
                createdAt: jour(12)
            }
        })
        await prisma.transaction.create({
            data: {
                type: "IN",
                quantity: p.stockInitial,
                prixAchat: p.pa,
                prixVente: p.pv,
                dateApprovis: jour(12),
                createdAt: jour(12),
                productId: produit.id,
                businessbiId: client.id
            }
        })
        creees.push({ id: produit.id, nom: p.nom, unite: p.unite, pa: p.pa, pv: p.pv })
    }

    if (!avecHistorique) return client

    // Un réapprovisionnement du premier produit, à un prix d'achat légèrement plus élevé
    const premier = creees[0]
    await prisma.transaction.create({
        data: {
            type: "IN",
            quantity: 60,
            prixAchat: premier.pa + 100,
            prixVente: premier.pv,
            dateApprovis: jour(5, 9),
            createdAt: jour(5, 9),
            productId: premier.id,
            businessbiId: client.id
        }
    })

    // Une vente par jour sur 10 jours (de il y a 9 jours à aujourd'hui)
    for (let d = 9; d >= 0; d--) {
        const lignes = creees
            .map((p, i) => ({ p, i }))
            .filter(({ i }) => (d + i) % 2 === 0)
            .map(({ p, i }) => ({ ...p, quantite: 3 + ((d * 7 + i * 3) % 9) }))
        if (lignes.length === 0) continue

        const total = lignes.reduce((acc, l) => acc + l.pv * l.quantite, 0)
        const dette = d === 2 ? 20000 : 0
        const date = jour(d, 15)

        const vente = await prisma.vente.create({
            data: {
                avecFacture: false,
                clientNom: dette ? "Client Démo" : null,
                montantHT: total,
                montantTVA: 0,
                montantTotal: total,
                montantPaye: total - dette,
                solde: -dette,
                businessbiId: client.id,
                createdAt: date,
                items: {
                    create: lignes.map((l) => ({
                        productId: l.id,
                        productName: l.nom,
                        quantity: l.quantite,
                        unit: l.unite,
                        prixVente: l.pv,
                        prixAchat: l.pa
                    }))
                }
            }
        })

        await prisma.transaction.createMany({
            data: lignes.map((l) => ({
                type: "OUT",
                quantity: l.quantite,
                prixAchat: l.pa,
                prixVente: l.pv,
                productId: l.id,
                businessbiId: client.id,
                venteId: vente.id,
                createdAt: date
            }))
        })

        // Vente non soldée : une dette, dont une partie a déjà été payée
        if (dette) {
            await prisma.dette.create({
                data: {
                    debiteur: "Client Démo",
                    montant: dette,
                    montantPaye: 5000,
                    statut: "partiellement_paye",
                    description: `Vente non soldée (${lignes.map((l) => l.nom).join(", ")})`,
                    businessbiId: client.id,
                    venteId: vente.id,
                    createdAt: date,
                    paiements: { create: [{ montant: 5000, date: jour(1, 11), note: "Acompte" }] }
                }
            })
        }
    }

    // Dépenses
    await prisma.depense.createMany({
        data: [
            { montant: 50000, description: "Loyer du magasin", categorie: "Loyer", date: jour(8, 9), businessbiId: client.id },
            { montant: 15000, description: "Facture d'électricité", categorie: "Électricité", date: jour(4, 9), businessbiId: client.id },
            { montant: 8000, description: "Transport de marchandises", categorie: "Transport", date: jour(1, 9), businessbiId: client.id }
        ]
    })

    return client
}

async function main() {
    await nettoyer()

    const assureur = await prisma.assureur.create({
        data: { code: CODE_ASSUREUR, nom: "Assurance Démo", email: EMAIL_ASSUREUR, actif: true }
    })
    await prisma.assureurUser.create({
        data: { assureurId: assureur.id, email: EMAIL_ASSUREUR, nom: "Administrateur Démo", role: "ADMIN" }
    })

    await creerClient(
        assureur.id,
        {
            name: "BOUTIQUE DÉMO",
            email: EMAIL_CLIENT,
            rc: "RC/DEMO/001",
            nif: "4000000001",
            secteur: "Commerce de boissons et d'alimentation",
            proprietaire: "Jean Démo"
        },
        [
            { nom: "Primus", unite: "Bout", pa: 3500, pv: 5000, stockInitial: 150 },
            { nom: "Bock", unite: "Bout", pa: 6000, pv: 7000, stockInitial: 100 },
            { nom: "Fanta", unite: "Bout", pa: 800, pv: 1000, stockInitial: 300 },
            { nom: "Sucre", unite: "Kg", pa: 2500, pv: 3000, stockInitial: 150 },
            { nom: "Riz", unite: "Kg", pa: 1800, pv: 2200, stockInitial: 400 }
        ],
        true
    )

    await creerClient(
        assureur.id,
        {
            name: "QUINCAILLERIE DÉMO",
            email: EMAIL_CLIENT_2,
            rc: "RC/DEMO/002",
            nif: "4000000002",
            secteur: "Quincaillerie",
            proprietaire: "Marie Démo"
        },
        [
            { nom: "Ciment (sac)", unite: "Pcs", pa: 28000, pv: 32000, stockInitial: 80 },
            { nom: "Tôle", unite: "Pcs", pa: 15000, pv: 18000, stockInitial: 120 }
        ],
        false
    )

    console.log("Démo créée. Assureur :", EMAIL_ASSUREUR, "| Client :", EMAIL_CLIENT, "| Code :", CODE_ASSUREUR)
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
