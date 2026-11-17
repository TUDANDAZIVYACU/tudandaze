// Dates et calculs partagés par les pages (jour du Burundi, format AAAA-MM-JJ)

export const aujourdhui = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Bujumbura' })

export const ajouterJours = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Nombre de jours d'une période, bornes comprises
export const nbJours = (debut: string, fin: string) =>
  Math.round((Date.parse(fin + 'T00:00:00Z') - Date.parse(debut + 'T00:00:00Z')) / 86400000) + 1

export const dateFr = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR')

export const PERIODES = [
  { id: 'jour', label: "Aujourd'hui" },
  { id: '7j', label: '7 jours' },
  { id: 'mois', label: 'Ce mois' },
  { id: 'annee', label: 'Cette année' }
] as const

export type PeriodeId = (typeof PERIODES)[number]['id']

export const bornesPeriode = (id: PeriodeId) => {
  const fin = aujourdhui()
  if (id === 'jour') return { debut: fin, fin }
  if (id === '7j') return { debut: ajouterJours(fin, -6), fin }
  if (id === 'mois') return { debut: fin.slice(0, 8) + '01', fin }
  return { debut: fin.slice(0, 5) + '01-01', fin }
}

// Période de même durée, juste avant celle choisie : sert aux comparaisons
export const periodePrecedente = (debut: string, fin: string) => {
  const jours = nbJours(debut, fin)
  const finPrec = ajouterJours(debut, -1)
  return { debut: ajouterJours(finPrec, -(jours - 1)), fin: finPrec }
}

export const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')

// Évolution en % par rapport à une valeur précédente (null si la comparaison n'a pas de sens)
export const variationPct = (actuel: number, avant: number | null | undefined) =>
  avant === null || avant === undefined || avant === 0 ? null : ((actuel - avant) / Math.abs(avant)) * 100
