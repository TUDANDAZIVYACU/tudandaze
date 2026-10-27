import { Product as PrismaProduct } from "@prisma/client"
import { Transaction as PrismaTransaction } from "@prisma/client"

export interface Product extends PrismaProduct {
  // categoryName supprimé
}

export interface FormDataType {
  id?: string
  name: string
  prixAchat: number
  prixVente: number
  price: number
  // categoryId supprimé
  // newCategorie supprimé
  unit: string
  imageUrl?: string
  dateCreation?: string
  pieceUrl?: string // photo d'une pièce justifiant le stock initial (facultative)
}

export interface OrderItem {
  productId: string
  quantity: number
  unit: string
  name: string
  availableQuantity: number
  prixVente: number
  prixAchat: number
}

export interface Transaction extends PrismaTransaction {
  // categoryName supprimé
  productName: string
  price: number
  unit: string
  prixAchat: number
  prixVente: number
  dateApprovis: Date
}

export type ProductOverviewStats = {
    totalProducts: number
    totalTransactions: number
    stockValue: number
    valeurAchats: number
    valeurVentes: number
    totalDepenses: number
    totalDettes: number
    dettesDonnees: number   // ← nouveau
    dettesPaye: number      // ← nouveau
}

export interface ChartData {
  name: string
  value: number
}

export interface StockSummary {
  inStockCount: number
  lowStockCount: number
  outOfStockCount: number
  criticalProducts: Product[]
}

export type CaisseEntry = {
  id: string
  ordo: number
  date: string | Date
  libelle: string
  categorie: string
  type: "DEBIT" | "CREDIT"
  debit: number
  credit: number
  businessbiId?: string
}

export type CaisseFormType = {
  date: string
  libelle: string
  categorie: string
  type: "DEBIT" | "CREDIT"
  montant: number
}

export const CATEGORIES_DEBIT = [
  "PAIEMENT AVANCE",
  "PAIEMENT RESTE SUR AVANCE",
]

export const CATEGORIES_CREDIT = [
  "ACHATS DIVERS",
  "FOURNITURES DIVERSES",
  "FRAIS DU PERSONNEL",
  "FRAIS FINANCIERS",
  "FRAIS DE COMMUNICATION",
  "FRAIS DE DEPLACEMENT",
  "FRAIS DIVERS",
  "IMPOTS ET TAXES",
  "REGIDESO",
  "GROUPE ELECTROGENE",
  "SERVICES DIVERS",
]

export type BanqueEntry = {
  id: string
  ordo: number
  date: string | Date
  bordereau: string
  libelle: string
  banque: string
  compte: string
  categorie: string
  type: "CREDIT" | "DEBIT"
  credit: number
  debit: number
  businessbiId?: string
}

export type BanqueFormType = {
  date: string
  bordereau: string
  libelle: string
  banque: string
  compte: string
  categorie: string
  type: "CREDIT" | "DEBIT"
  montant: number
}

// CREDIT = encaissement (argent qui entre sur le compte)
export const CATEGORIES_CREDIT_BANQUE = [
  "PAIEMENT AVANCE",
  "PAIEMENT RESTE SUR AVANCE",
]

// DEBIT = décaissement (argent qui sort du compte)
export const CATEGORIES_DEBIT_BANQUE = [
  "ALIMENTATION CAISSE",
  "ACHATS DIVERS",
  "FOURNITURES DIVERSES",
  "FRAIS DU PERSONNEL",
  "FRAIS FINANCIERS",
  "FRAIS DE COMMUNICATION",
  "FRAIS DE DEPLACEMENT",
  "FRAIS DIVERS",
  "IMPOTS ET TAXES",
  "REGIDESO",
  "GROUPE ELECTROGENE",
  "SERVICES DIVERS",
]

export interface VenteItemType {
  id: string
  productId: string
  productName: string
  quantity: number
  unit: string
  prixVente: number
  prixAchat: number
}

export interface VenteForPrint {
  id: string
  numero: string | null
  avecFacture: boolean
  clientNom: string | null
  montantHT: number
  montantTVA: number
  montantTotal: number
  montantPaye: number
  solde: number
  createdAt: string | Date
  items: VenteItemType[]
  businessName: string
}