// Export d'un ou plusieurs tableaux en PDF (style « Historique des approvisionnements et ventes ») ou en Excel (.xlsx).
// À utiliser côté navigateur uniquement.
// Les nombres sont passés bruts (number) : formatés en « 1 234 » dans le PDF, gardés numériques dans Excel.

export type Ton = 'vert' | 'rouge' | 'normal'

// Une paire « LIBELLÉ : valeur » (résumé en haut à droite, totaux en bas)
export type Paire = {
  libelle: string
  valeur: string | number
  ton?: Ton
}

export type Section = {
  titre?: string
  colonnes: string[]
  lignes: (string | number)[][]
}

export type TableauExport = {
  organisation?: string // grand titre : nom de l'entreprise / du client
  titre: string // titre du document
  sousTitre?: string // période, date... (à gauche, sous le titre)
  nomFichier: string // sans extension
  colonnes: string[]
  lignes: (string | number)[][]
  colonnesGras?: number[] // index des colonnes affichées en gras (ex. Total)
  resume?: Paire[] // en haut à droite
  totaux?: Paire[] // en bas, sous la ligne dorée
  sections?: Section[] // tableaux supplémentaires, à la suite du premier
}

type Couleur = readonly [number, number, number]
const BRUN: Couleur = [122, 52, 16]
const VERT: Couleur = [0, 121, 107]
const ROUGE: Couleur = [244, 98, 98]
const OR: Couleur = [221, 204, 146]
const FILET: Couleur = [236, 229, 216]
const GRIS: Couleur = [150, 130, 115]
const BLANC: Couleur = [255, 255, 255]

const couleurTon = (ton?: Ton): Couleur => (ton === 'vert' ? VERT : ton === 'rouge' ? ROUGE : BRUN)

// jsPDF ne gère pas les espaces insécables ni le signe moins typographique produits par toLocaleString('fr-FR')
const nettoyer = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ').replace(/\u2212/g, '-')
const texte = (v: string | number | undefined) =>
  typeof v === 'number' ? nettoyer(v.toLocaleString('fr-FR')) : nettoyer(String(v ?? ''))

export async function exporterPdf(t: TableauExport) {
  const { jsPDF } = await import('jspdf')
  const tables: Section[] = [{ colonnes: t.colonnes, lignes: t.lignes }, ...(t.sections ?? [])]
  const maxColonnes = Math.max(...tables.map((s) => s.colonnes.length))

  const doc = new jsPDF({
    orientation: maxColonnes > 6 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4'
  })
  const largeurPage = doc.internal.pageSize.getWidth()
  const hauteurPage = doc.internal.pageSize.getHeight()
  const marge = 14
  const utile = largeurPage - marge * 2
  const droite = marge + utile
  const limite = hauteurPage - marge - 4

  const encre = (c: Couleur) => doc.setTextColor(c[0], c[1], c[2])
  const remplir = (c: Couleur) => doc.setFillColor(c[0], c[1], c[2])
  const trait = (c: Couleur, epaisseur: number) => {
    doc.setDrawColor(c[0], c[1], c[2])
    doc.setLineWidth(epaisseur)
  }

  // « LIBELLÉ : valeur » : libellé normal, valeur en gras et en couleur
  const mesurerPaire = (p: Paire) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const l = doc.getTextWidth(nettoyer(p.libelle.toUpperCase()) + ' :') + 1.8
    doc.setFont('helvetica', 'bold')
    const v = doc.getTextWidth(texte(p.valeur))
    return { l, v }
  }
  const dessinerPaire = (p: Paire, xDebut: number, ligneY: number) => {
    const { l } = mesurerPaire(p)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    encre(BRUN)
    doc.text(nettoyer(p.libelle.toUpperCase()) + ' :', xDebut, ligneY)
    doc.setFont('helvetica', 'bold')
    encre(couleurTon(p.ton))
    doc.text(texte(p.valeur), xDebut + l, ligneY)
  }

  // ───── En-tête : entreprise, titre, période, résumé à droite ─────
  let y = marge
  doc.setFont('helvetica', 'bold')
  encre(BRUN)
  if (t.organisation) {
    doc.setFontSize(20)
    doc.text(nettoyer(t.organisation), marge, y + 6)
    y += 11
    doc.setFontSize(17)
    doc.text(nettoyer(t.titre), marge, y + 6)
    y += 11
  } else {
    doc.setFontSize(20)
    doc.text(nettoyer(t.titre), marge, y + 6)
    y += 11
  }

  const resume = t.resume ?? []
  const interligneResume = 5.5
  resume.forEach((p, i) => {
    const { l, v } = mesurerPaire(p)
    dessinerPaire(p, droite - l - v, y + 3 + i * interligneResume)
  })
  if (t.sousTitre) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    encre(BRUN)
    const largeurSousTitre = resume.length > 0 ? utile * 0.55 : utile
    const lignesSousTitre = doc.splitTextToSize(nettoyer(t.sousTitre), largeurSousTitre) as string[]
    const baseY = y + 3 + (resume.length > 1 ? interligneResume : 0)
    lignesSousTitre.forEach((l, i) => doc.text(l, marge, baseY + i * 5))
    y = Math.max(y + 3 + resume.length * interligneResume, baseY + lignesSousTitre.length * 5)
  } else {
    y += 3 + resume.length * interligneResume
  }
  y += 4

  // ───── Tableaux ─────
  const hauteurEntete = 9
  const padH = 3
  const interligne = 4.4
  const padV = 1.6

  const dessinerEntete = (colonnes: string[], largeurs: number[], adroite: boolean[]) => {
    remplir(VERT)
    doc.rect(marge, y, utile, hauteurEntete, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    encre(BLANC)
    let x = marge
    colonnes.forEach((titre, i) => {
      const ty = y + 6
      if (adroite[i]) doc.text(nettoyer(titre), x + largeurs[i] - padH, ty, { align: 'right' })
      else doc.text(nettoyer(titre), x + padH, ty)
      x += largeurs[i]
    })
    y += hauteurEntete
  }

  const dessinerTable = (s: Section) => {
    if (s.titre) {
      if (y + 25 > limite) {
        doc.addPage()
        y = marge
      }
      y += 4
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      encre(BRUN)
      doc.text(nettoyer(s.titre), marge, y + 4)
      y += 8
    }

    // Une colonne est alignée à droite si elle contient des nombres
    const adroite = s.colonnes.map((_, i) => s.lignes.some((l) => typeof l[i] === 'number'))

    // Largeur minimale de chaque colonne = largeur réelle de son plus long contenu (plafonnée : au-delà, le texte passe à la ligne)
    const minimales = s.colonnes.map((titre, i) => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      let max = doc.getTextWidth(nettoyer(titre))
      doc.setFont('helvetica', t.colonnesGras?.includes(i) ? 'bold' : 'normal')
      doc.setFontSize(9)
      for (const l of s.lignes) max = Math.max(max, doc.getTextWidth(texte(l[i])))
      return Math.min(max, 60) + padH * 2 + 1
    })
    const sommeMin = minimales.reduce((a, b) => a + b, 0)
    // Place restante répartie selon le poids de chaque colonne ; si ça ne tient pas, on réduit proportionnellement
    const poids = minimales.map((m) => m)
    const sommePoids = poids.reduce((a, b) => a + b, 0)
    const largeurs =
      sommeMin <= utile
        ? minimales.map((m, i) => m + ((utile - sommeMin) * poids[i]) / sommePoids)
        : minimales.map((m) => (m / sommeMin) * utile)

    dessinerEntete(s.colonnes, largeurs, adroite)

    for (const ligne of s.lignes) {
      doc.setFontSize(9)
      const cellules = ligne.map((v, i) => {
        doc.setFont('helvetica', t.colonnesGras?.includes(i) ? 'bold' : 'normal')
        return doc.splitTextToSize(texte(v), largeurs[i] - padH * 2) as string[]
      })
      const nombreLignes = Math.max(1, ...cellules.map((c) => c.length))
      const h = nombreLignes * interligne + padV * 2

      if (y + h > limite) {
        doc.addPage()
        y = marge
        dessinerEntete(s.colonnes, largeurs, adroite)
      }

      encre(BRUN)
      doc.setFontSize(9)
      let x = marge
      cellules.forEach((c, i) => {
        doc.setFont('helvetica', t.colonnesGras?.includes(i) ? 'bold' : 'normal')
        c.forEach((morceau, k) => {
          const ty = y + padV + interligne * (k + 1) - 1
          if (adroite[i]) doc.text(morceau, x + largeurs[i] - padH, ty, { align: 'right' })
          else doc.text(morceau, x + padH, ty)
        })
        x += largeurs[i]
      })
      trait(FILET, 0.25)
      doc.line(marge, y + h, droite, y + h)
      y += h
    }
  }

  tables.forEach(dessinerTable)

  // ───── Ligne dorée puis totaux en bas, alignés à droite ─────
  const totaux = t.totaux ?? []
  if (totaux.length > 0) {
    if (y + 20 > limite) {
      doc.addPage()
      y = marge
    }
    y += 4
    trait(OR, 0.7)
    doc.line(marge, y, droite, y)
    y += 8

    const ecart = 10
    const lignesTotaux: { paire: Paire; l: number; v: number }[][] = [[]]
    let largeurLigne = 0
    for (const p of totaux) {
      const { l, v } = mesurerPaire(p)
      const w = l + v
      const courante = lignesTotaux[lignesTotaux.length - 1]
      if (courante.length > 0 && largeurLigne + ecart + w > utile) {
        lignesTotaux.push([])
        largeurLigne = 0
      }
      const cible = lignesTotaux[lignesTotaux.length - 1]
      largeurLigne += (cible.length > 0 ? ecart : 0) + w
      cible.push({ paire: p, l, v })
    }
    for (const ligne of lignesTotaux) {
      const largeurTotale = ligne.reduce((a, e, i) => a + e.l + e.v + (i > 0 ? ecart : 0), 0)
      let x = droite - largeurTotale
      for (const e of ligne) {
        dessinerPaire(e.paire, x, y)
        x += e.l + e.v + ecart
      }
      y += 6
    }
  }

  // ───── Pied de page ─────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    encre(GRIS)
    doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')}`, marge, hauteurPage - 7)
    doc.text(`Page ${p}/${totalPages}`, droite, hauteurPage - 7, { align: 'right' })
  }

  doc.save(`${t.nomFichier}.pdf`)
}

export async function exporterExcel(t: TableauExport) {
  const XLSX = await import('xlsx')
  const sections = t.sections ?? []

  const donnees: (string | number)[][] = []
  if (t.organisation) donnees.push([t.organisation])
  donnees.push([t.titre])
  if (t.sousTitre) donnees.push([t.sousTitre])
  for (const p of t.resume ?? []) donnees.push([p.libelle, p.valeur])
  donnees.push([], t.colonnes, ...t.lignes)
  for (const s of sections) {
    donnees.push([], ...(s.titre ? [[s.titre]] : []), s.colonnes, ...s.lignes)
  }
  if (t.totaux && t.totaux.length > 0) {
    donnees.push([])
    for (const p of t.totaux) donnees.push([p.libelle, p.valeur])
  }

  const feuille = XLSX.utils.aoa_to_sheet(donnees)

  // Largeur de chaque colonne = plus long contenu de tous les tableaux
  const tables = [{ colonnes: t.colonnes, lignes: t.lignes }, ...sections]
  const nombreColonnes = Math.max(...tables.map((s) => s.colonnes.length))
  feuille['!cols'] = Array.from({ length: nombreColonnes }, (_, i) => {
    const longueurs = tables.flatMap((s) => [
      (s.colonnes[i] ?? '').length,
      ...s.lignes.map((l) => String(l[i] ?? '').length)
    ])
    return { wch: Math.min(Math.max(...longueurs) + 2, 50) }
  })

  const classeur = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(classeur, feuille, 'Export')
  XLSX.writeFile(classeur, `${t.nomFichier}.xlsx`)
}

// Nom de fichier propre à partir d'un nom de client, ex. « Entreprise Kigobe » → « entreprise-kigobe »
export function nomFichierSur(texteBrut: string) {
  return texteBrut
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}
