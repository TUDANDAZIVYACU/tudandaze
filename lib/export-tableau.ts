// Export d'un ou plusieurs tableaux en PDF ou en Excel (.xlsx), utilisable dans toutes les pages (côté navigateur uniquement).
// Les nombres sont passés bruts (number) : formatés en « 1 234 » dans le PDF, gardés numériques dans Excel.

export type Section = {
  titre?: string
  colonnes: string[]
  lignes: (string | number)[][]
}

export type TableauExport = {
  titre: string
  sousTitre?: string
  nomFichier: string // sans extension
  colonnes: string[]
  lignes: (string | number)[][]
  pied?: string // ex. « Total : 150 000 FBU », affiché sous le dernier tableau
  sections?: Section[] // tableaux supplémentaires, affichés à la suite du premier
}

// jsPDF ne gère pas les espaces insécables ni le signe moins typographique produits par toLocaleString('fr-FR')
const nettoyer = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ').replace(/\u2212/g, '-')
const texte = (v: string | number | undefined) =>
  typeof v === 'number' ? nettoyer(v.toLocaleString('fr-FR')) : nettoyer(String(v ?? ''))

export async function exporterPdf(t: TableauExport) {
  const { jsPDF } = await import('jspdf')
  const tables: Section[] = [{ colonnes: t.colonnes, lignes: t.lignes }, ...(t.sections ?? [])]
  const maxColonnes = Math.max(...tables.map((s) => s.colonnes.length))

  const doc = new jsPDF({
    orientation: maxColonnes > 5 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4'
  })
  const largeurPage = doc.internal.pageSize.getWidth()
  const hauteurPage = doc.internal.pageSize.getHeight()
  const marge = 12
  const utile = largeurPage - marge * 2
  const limite = hauteurPage - marge - 6
  const interligne = 4.2
  const pad = 1.5

  let y = marge
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(nettoyer(t.titre), marge, y + 4)
  y += 9
  if (t.sousTitre) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(nettoyer(t.sousTitre), marge, y)
    y += 6
  }
  y += 2

  const dessinerEntete = (colonnes: string[], largeurs: number[]) => {
    const h = interligne + pad * 2
    doc.setFillColor(225, 225, 225)
    doc.rect(marge, y, utile, h, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    let x = marge
    colonnes.forEach((titre, i) => {
      doc.text(nettoyer(titre), x + pad, y + pad + interligne - 1)
      x += largeurs[i]
    })
    y += h
  }

  const dessinerTable = (s: Section) => {
    if (s.titre) {
      if (y + 20 > limite) {
        doc.addPage()
        y = marge
      }
      y += 4
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(nettoyer(s.titre), marge, y)
      y += 4
    }

    // Largeur des colonnes proportionnelle à leur contenu
    const poids = s.colonnes.map((titre, i) => {
      const max = s.lignes.reduce((m, l) => Math.max(m, texte(l[i]).length), titre.length)
      return Math.min(Math.max(max, 6), 40)
    })
    const somme = poids.reduce((a, b) => a + b, 0)
    const largeurs = poids.map((p) => (p / somme) * utile)

    dessinerEntete(s.colonnes, largeurs)

    for (const ligne of s.lignes) {
      const cellules = ligne.map((v, i) => doc.splitTextToSize(texte(v), largeurs[i] - pad * 2) as string[])
      const nombreLignes = Math.max(1, ...cellules.map((c) => c.length))
      const h = nombreLignes * interligne + pad * 2

      if (y + h > limite) {
        doc.addPage()
        y = marge
        dessinerEntete(s.colonnes, largeurs)
      }

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      let x = marge
      cellules.forEach((c, i) => {
        const adroite = typeof ligne[i] === 'number'
        c.forEach((morceau, k) => {
          const ty = y + pad + interligne * (k + 1) - 1
          if (adroite) doc.text(morceau, x + largeurs[i] - pad, ty, { align: 'right' })
          else doc.text(morceau, x + pad, ty)
        })
        x += largeurs[i]
      })
      doc.setDrawColor(210)
      doc.line(marge, y + h, marge + utile, y + h)
      y += h
    }
  }

  tables.forEach(dessinerTable)

  if (t.pied) {
    if (y + 10 > limite) {
      doc.addPage()
      y = marge
    }
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(nettoyer(t.pied), marge + utile, y, { align: 'right' })
  }

  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')}`, marge, hauteurPage - 6)
    doc.text(`Page ${p}/${totalPages}`, largeurPage - marge, hauteurPage - 6, { align: 'right' })
  }

  doc.save(`${t.nomFichier}.pdf`)
}

export async function exporterExcel(t: TableauExport) {
  const XLSX = await import('xlsx')
  const sections = t.sections ?? []

  const donnees: (string | number)[][] = [
    [t.titre],
    ...(t.sousTitre ? [[t.sousTitre]] : []),
    [],
    t.colonnes,
    ...t.lignes
  ]
  for (const s of sections) {
    donnees.push([], ...(s.titre ? [[s.titre]] : []), s.colonnes, ...s.lignes)
  }
  if (t.pied) donnees.push([], [t.pied])

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
