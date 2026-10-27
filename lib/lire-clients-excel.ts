// lib/lire-clients-excel.ts
// Lit, dans le navigateur, un fichier Excel (.xlsx) de clients : Nom de l'entreprise, RC, NIF.
// La première ligne contient les titres de colonnes (dans n'importe quel ordre).
import type { LigneImport } from "./import-clients"

const simplifier = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")

type Colonnes = { nom: number; rc: number; nif: number }

function reconnaitreColonnes(titres: string[]): Partial<Colonnes> {
  const colonnes: Partial<Colonnes> = {}
  titres.forEach((titre, index) => {
    const t = simplifier(titre)
    if (!t) return
    const colonne = index + 1
    if (colonnes.nif === undefined && (t.includes("nif") || t.includes("identificationfiscale"))) {
      colonnes.nif = colonne
    } else if (colonnes.rc === undefined && (t === "rc" || t.includes("registre"))) {
      colonnes.rc = colonne
    } else if (
      colonnes.nom === undefined &&
      (t.includes("nom") || t.includes("entreprise") || t.includes("raisonsociale") || t.includes("societe"))
    ) {
      colonnes.nom = colonne
    } else if (colonnes.rc === undefined && t.includes("commerce")) {
      colonnes.rc = colonne
    }
  })
  return colonnes
}

export async function lireClientsExcel(fichier: File): Promise<LigneImport[]> {
  const module: any = await import("exceljs")
  const ExcelJS = module.default ?? module

  const classeur = new ExcelJS.Workbook()
  await classeur.xlsx.load(await fichier.arrayBuffer())
  const feuille = classeur.worksheets[0]
  if (!feuille) throw new Error("Le fichier ne contient aucune feuille.")

  // Valeur d'une cellule telle qu'affichée dans Excel.
  // Nombre formaté « 0000 » : on remet les zéros du début (ex. 2 -> « 0002 »).
  const texte = (ligne: number, colonne: number): string => {
    const cellule = feuille.getRow(ligne).getCell(colonne)
    if (typeof cellule.value === "number") {
      const format = typeof cellule.numFmt === "string" ? cellule.numFmt : ""
      const entier = String(cellule.value)
      return /^0+$/.test(format) ? entier.padStart(format.length, "0") : entier
    }
    return String(cellule.text ?? "").trim()
  }

  // Ligne des titres : l'une des 10 premières lignes
  let ligneTitres = 0
  let colonnes: Partial<Colonnes> = {}
  for (let r = 1; r <= Math.min(10, feuille.rowCount); r++) {
    const titres: string[] = []
    for (let c = 1; c <= Math.max(feuille.columnCount, 3); c++) titres.push(texte(r, c))
    const trouvees = reconnaitreColonnes(titres)
    if (trouvees.nom && trouvees.rc && trouvees.nif) {
      ligneTitres = r
      colonnes = trouvees
      break
    }
  }
  if (!ligneTitres) {
    throw new Error("Colonnes introuvables : la première ligne doit contenir « Nom de l'entreprise », « RC » et « NIF ».")
  }

  const lignes: LigneImport[] = []
  const derniere = Math.min(feuille.rowCount, ligneTitres + 5000)
  for (let r = ligneTitres + 1; r <= derniere; r++) {
    const nom = texte(r, colonnes.nom!)
    const rc = texte(r, colonnes.rc!)
    const nif = texte(r, colonnes.nif!)
    if (!nom && !rc && !nif) continue // ligne vide
    lignes.push({ ligne: r, nom, rc, nif })
  }
  return lignes
}
