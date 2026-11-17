"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import Wrapper from '../components/Wrapper'
import { BoutonsExport } from '../components/suivi-ui'
import { getBilanPeriode, getBusinessName } from '../actions'
import { useStockSync } from '@/lib/stock-sync'
import { nomFichierSur, type TableauExport } from '@/lib/export-tableau'

type Bilan = NonNullable<Awaited<ReturnType<typeof getBilanPeriode>>>

// ───────── Dates (jour du Burundi, format AAAA-MM-JJ) ─────────
const aujourdhui = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Bujumbura' })

const ajouterJours = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Nombre de jours de la période, bornes comprises
const nbJours = (debut: string, fin: string) =>
  Math.round((Date.parse(fin + 'T00:00:00Z') - Date.parse(debut + 'T00:00:00Z')) / 86400000) + 1

const dateFr = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR')

const PERIODES = [
  { id: 'jour', label: "Aujourd'hui" },
  { id: '7j', label: '7 jours' },
  { id: 'mois', label: 'Ce mois' },
  { id: 'annee', label: 'Cette année' }
] as const

const bornesPeriode = (id: (typeof PERIODES)[number]['id']) => {
  const fin = aujourdhui()
  if (id === 'jour') return { debut: fin, fin }
  if (id === '7j') return { debut: ajouterJours(fin, -6), fin }
  if (id === 'mois') return { debut: fin.slice(0, 8) + '01', fin }
  return { debut: fin.slice(0, 5) + '01-01', fin }
}

// ───────── Calculs ─────────
const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')
const signe = (n: number) => (n > 0 ? '+' : '') + fmt(n)

// Toutes les opérations de la période, calculées à partir du bilan renvoyé par le serveur
const calculer = (b: Bilan) => {
  const ventes = b.valeurVentes
  const achats = b.valeurAchats
  const depenses = b.totalDepenses
  const dettesAccordees = b.dettesDonnees
  const dettesPayees = b.dettesPaye
  // Argent réellement encaissé : ventes, moins ce qui est resté à crédit, plus les dettes récupérées
  const recettes = ventes - dettesAccordees + dettesPayees
  const sorties = achats + depenses
  const solde = recettes - sorties
  const variationStock = b.valeurStockFin - b.valeurStockDebut
  const caisseSolde = b.caisseReport + b.caisseDebit - b.caisseCredit
  const banqueSolde = b.banqueReport + b.banqueCredit - b.banqueDebit
  const aCaisseBanque = [b.caisseReport, b.caisseDebit, b.caisseCredit, b.banqueReport, b.banqueDebit, b.banqueCredit]
    .some((v) => v !== 0)
  // Rapprochement : encaissements commerciaux comparés à ce qui est enregistré en caisse (débit) et en banque (crédit)
  const encaisseCompta = b.caisseDebit + b.banqueCredit
  const ecart = recettes - encaisseCompta
  return {
    ventes, achats, depenses, dettesAccordees, dettesPayees,
    recettes, sorties, solde, variationStock,
    caisseSolde, banqueSolde, aCaisseBanque, encaisseCompta, ecart
  }
}

type Calculs = ReturnType<typeof calculer>

const variationPct = (actuel: number, avant: number | undefined) =>
  avant === undefined || avant === 0 ? null : ((actuel - avant) / Math.abs(avant)) * 100

// ───────── Petits composants ─────────
function Evolution({ pct, bonSiHausse = true }: { pct: number | null; bonSiHausse?: boolean }) {
  if (pct === null) return <span className='text-[11px] font-normal opacity-50'>pas de comparaison</span>
  const hausse = pct > 0.5
  const baisse = pct < -0.5
  if (!hausse && !baisse) return <span className='text-[11px] font-normal opacity-60'>stable vs période précédente</span>
  const bon = hausse === bonSiHausse
  return (
    <span className={`text-[11px] font-semibold ${bon ? 'text-success' : 'text-error'}`}>
      {hausse ? '▲' : '▼'} {Math.abs(Math.round(pct))} % vs période précédente
    </span>
  )
}

function Kpi({ libelle, valeur, classeValeur, pct, bonSiHausse, note }: {
  libelle: string
  valeur: string
  classeValeur: string
  pct?: number | null
  bonSiHausse?: boolean
  note?: string
}) {
  return (
    <div className='rounded-2xl bg-base-100 p-4 shadow-sm'>
      <p className='text-xs font-medium opacity-60 sm:text-sm'>{libelle}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${classeValeur}`}>
        {valeur} <span className='text-xs font-medium opacity-60'>FBU</span>
      </p>
      <div className='mt-0.5 min-h-4'>
        {pct !== undefined ? <Evolution pct={pct} bonSiHausse={bonSiHausse} /> : null}
        {note && <p className='text-[11px] font-normal opacity-60'>{note}</p>}
      </div>
    </div>
  )
}

function Barre({ libelle, valeur, max, classe }: { libelle: string; valeur: number; max: number; classe: string }) {
  const largeur = max > 0 ? Math.max(valeur > 0 ? 2 : 0, (valeur / max) * 100) : 0
  return (
    <div>
      <div className='mb-1 flex items-baseline justify-between gap-3 text-sm'>
        <span className='font-semibold'>{libelle}</span>
        <span className='font-bold tabular-nums'>{fmt(valeur)}</span>
      </div>
      <div className='h-3 w-full overflow-hidden rounded-full bg-base-200'>
        <div className={`h-full rounded-full ${classe}`} style={{ width: `${largeur}%` }} />
      </div>
    </div>
  )
}

const page = () => {
  const { user } = useUser()
  const identifiant = user?.primaryEmailAddress?.emailAddress ?? user?.primaryPhoneNumber?.phoneNumber

  const [dateDebut, setDateDebut] = useState(() => bornesPeriode('mois').debut)
  const [dateFin, setDateFin] = useState(() => bornesPeriode('mois').fin)
  const [bilan, setBilan] = useState<Bilan | null>(null)
  const [precedent, setPrecedent] = useState<Bilan | null>(null)
  const [nomEntreprise, setNomEntreprise] = useState('')
  const [erreur, setErreur] = useState(false)
  const [actualisation, setActualisation] = useState(false)
  const derniereRequete = useRef(0)

  const datesInvalides = !!dateDebut && !!dateFin && dateDebut > dateFin

  const charger = useCallback(async () => {
    if (!identifiant || !dateDebut || !dateFin || dateDebut > dateFin) return
    const numero = ++derniereRequete.current
    setActualisation(true)
    try {
      // Période précédente de même durée, juste avant celle choisie : sert aux comparaisons
      const jours = nbJours(dateDebut, dateFin)
      const finPrec = ajouterJours(dateDebut, -1)
      const debutPrec = ajouterJours(finPrec, -(jours - 1))
      const [actuel, avant] = await Promise.all([
        getBilanPeriode(identifiant, dateDebut, dateFin),
        getBilanPeriode(identifiant, debutPrec, finPrec)
      ])
      if (numero !== derniereRequete.current) return
      if (actuel) {
        setBilan(actuel)
        setPrecedent(avant)
        setErreur(false)
      } else {
        setErreur(true)
      }
    } catch (error) {
      console.error(error)
      if (numero === derniereRequete.current) setErreur(true)
    } finally {
      if (numero === derniereRequete.current) setActualisation(false)
    }
  }, [identifiant, dateDebut, dateFin])

  useEffect(() => {
    charger()
  }, [charger])

  // Rechargement automatique après une vente, un achat, une dépense...
  useStockSync(charger)

  useEffect(() => {
    if (!identifiant) return
    getBusinessName(identifiant)
      .then((nom) => setNomEntreprise(nom))
      .catch((error) => console.error(error))
  }, [identifiant])

  const periodeActive = PERIODES.find((p) => {
    const b = bornesPeriode(p.id)
    return b.debut === dateDebut && b.fin === dateFin
  })?.id

  const choisirPeriode = (id: (typeof PERIODES)[number]['id']) => {
    const b = bornesPeriode(id)
    setDateDebut(b.debut)
    setDateFin(b.fin)
  }

  const c: Calculs | null = bilan ? calculer(bilan) : null
  const p: Calculs | null = precedent ? calculer(precedent) : null

  // ───────── Analyse en phrases ─────────
  const analyses: { ton: 'ok' | 'alerte' | 'info'; texte: string }[] = []
  if (c) {
    if (c.ventes === 0 && c.achats === 0 && c.depenses === 0 && c.dettesPayees === 0) {
      analyses.push({ ton: 'info', texte: 'Aucune opération enregistrée sur cette période.' })
    } else {
      if (c.solde >= 0) {
        analyses.push({ ton: 'ok', texte: `Période bénéficiaire : les recettes dépassent les sorties (achats et dépenses) de ${fmt(c.solde)} FBU.` })
      } else {
        analyses.push({ ton: 'alerte', texte: `Les sorties (achats et dépenses) dépassent les recettes de ${fmt(-c.solde)} FBU.` })
      }
      if (c.ventes > 0) {
        const partDettes = (c.dettesAccordees / c.ventes) * 100
        if (c.dettesAccordees > 0) {
          analyses.push({
            ton: partDettes > 20 ? 'alerte' : 'info',
            texte: `${Math.round(partDettes)} % des ventes n'ont pas été encaissées (${fmt(c.dettesAccordees)} FBU accordés en dettes).`
          })
        }
        if (c.depenses > 0) {
          analyses.push({ ton: 'info', texte: `Les dépenses représentent ${Math.round((c.depenses / c.ventes) * 100)} % des ventes.` })
        }
      }
      if (c.dettesPayees > 0) {
        analyses.push({ ton: 'ok', texte: `${fmt(c.dettesPayees)} FBU de dettes ont été récupérés sur la période.` })
      }
      if (c.achats > c.ventes && c.achats > 0) {
        analyses.push({ ton: 'info', texte: `Vous avez acheté plus que vendu (${fmt(c.achats)} contre ${fmt(c.ventes)}) : le stock augmente.` })
      }
      if (c.variationStock !== 0) {
        analyses.push({
          ton: 'info',
          texte: `La valeur du stock a ${c.variationStock > 0 ? 'augmenté' : 'diminué'} de ${fmt(Math.abs(c.variationStock))} FBU sur la période.`
        })
      }
      const pctVentes = p ? variationPct(c.ventes, p.ventes) : null
      if (pctVentes !== null && Math.abs(pctVentes) >= 1) {
        analyses.push({
          ton: pctVentes > 0 ? 'ok' : 'alerte',
          texte: `Les ventes ont ${pctVentes > 0 ? 'augmenté' : 'baissé'} de ${Math.abs(Math.round(pctVentes))} % par rapport à la période précédente (${fmt(p!.ventes)} FBU).`
        })
      }
    }
  }

  // ───────── Export PDF / Excel ─────────
  const tableauExport: TableauExport | null =
    c && bilan
      ? {
          organisation: nomEntreprise || undefined,
          titre: 'Centralisation',
          sousTitre: `Période du ${dateFr(dateDebut)} au ${dateFr(dateFin)}`,
          nomFichier: `centralisation-${nomFichierSur(nomEntreprise || 'entreprise')}-${dateDebut}-${dateFin}`,
          colonnes: ['Rubrique', 'Montant (FBU)'],
          lignes: [
            ['Ventes de la période', Math.round(c.ventes)],
            ['Dettes accordées (ventes non encaissées)', -Math.round(c.dettesAccordees)],
            ['Dettes payées (recouvrement)', Math.round(c.dettesPayees)],
            ['RECETTES ENCAISSÉES', Math.round(c.recettes)],
            ['Achats', -Math.round(c.achats)],
            ['Dépenses', -Math.round(c.depenses)],
            ['SOLDE DE LA PÉRIODE', Math.round(c.solde)],
            ['Valeur du stock au début', Math.round(bilan.valeurStockDebut)],
            ['Valeur du stock à la fin', Math.round(bilan.valeurStockFin)],
            ['Variation du stock', Math.round(c.variationStock)]
          ],
          colonnesGras: [1],
          resume: [
            { libelle: 'Recettes (FBU)', valeur: Math.round(c.recettes), ton: 'vert' },
            { libelle: 'Sorties (FBU)', valeur: Math.round(c.sorties), ton: 'rouge' },
            { libelle: 'Solde (FBU)', valeur: Math.round(c.solde), ton: c.solde < 0 ? 'rouge' : 'vert' }
          ],
          totaux: [{ libelle: 'Solde de la période (FBU)', valeur: Math.round(c.solde), ton: c.solde < 0 ? 'rouge' : 'vert' }],
          sections: c.aCaisseBanque
            ? [
                {
                  titre: 'Caisse et banque',
                  colonnes: ['Compte', 'Report', 'Encaissements', 'Décaissements', 'Solde'],
                  lignes: [
                    ['Caisse', Math.round(bilan.caisseReport), Math.round(bilan.caisseDebit), Math.round(bilan.caisseCredit), Math.round(c.caisseSolde)],
                    ['Banque', Math.round(bilan.banqueReport), Math.round(bilan.banqueCredit), Math.round(bilan.banqueDebit), Math.round(c.banqueSolde)]
                  ]
                }
              ]
            : undefined
        }
      : null

  const maxBarres = c ? Math.max(c.ventes, c.achats, c.depenses, c.recettes, 0) : 0

  return (
    <Wrapper>
      <div className='space-y-4'>

        {/* En-tête */}
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold leading-tight md:text-3xl'>Centralisation</h1>
            <p className='text-sm font-normal opacity-60'>Toutes les opérations de la période, calculées et analysées</p>
          </div>
          <div className='flex items-center gap-2'>
            {actualisation && bilan && <span className='loading loading-spinner loading-sm text-primary'></span>}
            <BoutonsExport tableau={tableauExport} />
          </div>
        </div>

        {/* Période */}
        <section className='rounded-2xl bg-base-100 p-3 shadow-sm md:p-4'>
          <div className='flex flex-wrap items-end gap-3'>
            <div className='flex flex-wrap gap-1'>
              {PERIODES.map((pr) => (
                <button
                  key={pr.id}
                  type='button'
                  className={`btn btn-sm ${periodeActive === pr.id ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => choisirPeriode(pr.id)}
                >
                  {pr.label}
                </button>
              ))}
            </div>
            <label className='flex min-w-0 flex-col gap-1'>
              <span className='text-sm font-normal opacity-70'>Du</span>
              <input
                type='date'
                className='input input-bordered input-sm w-full min-w-0'
                value={dateDebut}
                max={aujourdhui()}
                onChange={(e) => setDateDebut(e.target.value)}
              />
            </label>
            <label className='flex min-w-0 flex-col gap-1'>
              <span className='text-sm font-normal opacity-70'>Au</span>
              <input
                type='date'
                className='input input-bordered input-sm w-full min-w-0'
                value={dateFin}
                max={aujourdhui()}
                onChange={(e) => setDateFin(e.target.value)}
              />
            </label>
          </div>
          {datesInvalides && (
            <p className='mt-2 text-xs text-error normal-case'>La date de début doit être avant la date de fin.</p>
          )}
        </section>

        {!c && !erreur && (
          <div className='flex justify-center py-10'>
            <span className='loading loading-spinner loading-md text-primary'></span>
          </div>
        )}

        {erreur && !c && (
          <div role='alert' className='alert alert-error alert-soft flex flex-wrap items-center justify-between gap-3'>
            <span>Impossible de charger les données. Vérifiez la connexion ou réessayez.</span>
            <button type='button' className='btn btn-sm' onClick={() => charger()}>Réessayer</button>
          </div>
        )}

        {c && bilan && (
          <>
            {/* Chiffres clés, comparés à la période précédente */}
            <section className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
              <Kpi
                libelle='Recettes encaissées'
                valeur={fmt(c.recettes)}
                classeValeur='text-success'
                pct={p ? variationPct(c.recettes, p.recettes) : null}
              />
              <Kpi
                libelle='Sorties (achats + dépenses)'
                valeur={fmt(c.sorties)}
                classeValeur='text-error'
                pct={p ? variationPct(c.sorties, p.sorties) : null}
                bonSiHausse={false}
              />
              <Kpi
                libelle='Solde de la période'
                valeur={signe(c.solde)}
                classeValeur={c.solde < 0 ? 'text-error' : 'text-success'}
                pct={p ? variationPct(c.solde, p.solde) : null}
              />
              <Kpi
                libelle={`Stock au ${dateFr(dateFin)}`}
                valeur={fmt(bilan.valeurStockFin)}
                classeValeur='text-primary'
                note={`${c.variationStock >= 0 ? '+' : ''}${fmt(c.variationStock)} sur la période`}
              />
            </section>

            <div className='grid gap-4 lg:grid-cols-12'>

              {/* Détail des opérations */}
              <section className='rounded-2xl bg-base-100 p-5 shadow-sm lg:col-span-7'>
                <h2 className='mb-3 text-lg font-bold'>Détail des opérations</h2>
                <table className='table table-sm w-full'>
                  <tbody>
                    <tr>
                      <td>Ventes de la période</td>
                      <td className='text-right font-bold tabular-nums text-success'>+ {fmt(c.ventes)}</td>
                    </tr>
                    <tr>
                      <td>
                        Dettes accordées
                        <span className='block text-xs font-normal opacity-60'>ventes non encaissées</span>
                      </td>
                      <td className='text-right font-bold tabular-nums text-error'>− {fmt(c.dettesAccordees)}</td>
                    </tr>
                    <tr>
                      <td>
                        Dettes payées
                        <span className='block text-xs font-normal opacity-60'>argent récupéré des clients</span>
                      </td>
                      <td className='text-right font-bold tabular-nums text-success'>+ {fmt(c.dettesPayees)}</td>
                    </tr>
                    <tr className='border-t-2 border-base-300 bg-base-200'>
                      <td className='font-bold'>Recettes encaissées</td>
                      <td className='text-right text-base font-bold tabular-nums'>{fmt(c.recettes)}</td>
                    </tr>
                    <tr>
                      <td>Achats de marchandises</td>
                      <td className='text-right font-bold tabular-nums text-error'>− {fmt(c.achats)}</td>
                    </tr>
                    <tr>
                      <td>Dépenses</td>
                      <td className='text-right font-bold tabular-nums text-error'>− {fmt(c.depenses)}</td>
                    </tr>
                    <tr className='border-t-2 border-base-300 bg-base-200'>
                      <td className='font-bold'>Solde de la période</td>
                      <td className={`text-right text-base font-bold tabular-nums ${c.solde < 0 ? 'text-error' : 'text-success'}`}>
                        {signe(c.solde)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* Répartition en barres */}
              <section className='space-y-4 rounded-2xl bg-base-100 p-5 shadow-sm lg:col-span-5'>
                <h2 className='text-lg font-bold'>En un coup d&apos;œil</h2>
                <Barre libelle='Ventes' valeur={c.ventes} max={maxBarres} classe='bg-success' />
                <Barre libelle='Recettes encaissées' valeur={Math.max(c.recettes, 0)} max={maxBarres} classe='bg-primary' />
                <Barre libelle='Achats' valeur={c.achats} max={maxBarres} classe='bg-warning' />
                <Barre libelle='Dépenses' valeur={c.depenses} max={maxBarres} classe='bg-error' />
              </section>

              {/* Stock */}
              <section className='rounded-2xl bg-base-100 p-5 shadow-sm lg:col-span-5'>
                <h2 className='mb-3 text-lg font-bold'>Stock</h2>
                <div className='grid grid-cols-3 divide-x divide-base-300 rounded-2xl bg-base-200'>
                  <div className='p-3'>
                    <p className='text-xs font-normal opacity-70'>Au début</p>
                    <p className='font-bold tabular-nums'>{fmt(bilan.valeurStockDebut)}</p>
                  </div>
                  <div className='p-3'>
                    <p className='text-xs font-normal opacity-70'>À la fin</p>
                    <p className='font-bold tabular-nums'>{fmt(bilan.valeurStockFin)}</p>
                  </div>
                  <div className='p-3'>
                    <p className='text-xs font-normal opacity-70'>Variation</p>
                    <p className={`font-bold tabular-nums ${c.variationStock < 0 ? 'text-error' : 'text-success'}`}>
                      {signe(c.variationStock)}
                    </p>
                  </div>
                </div>
                <p className='mt-2 text-xs font-normal opacity-60'>Valeur du stock au prix de vente.</p>
              </section>

              {/* Analyse */}
              <section className='rounded-2xl bg-base-100 p-5 shadow-sm lg:col-span-7'>
                <h2 className='mb-3 text-lg font-bold'>Analyse de la période</h2>
                <ul className='space-y-2'>
                  {analyses.map((a, i) => (
                    <li
                      key={i}
                      className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
                        a.ton === 'ok' ? 'bg-success/15' : a.ton === 'alerte' ? 'bg-error/15' : 'bg-base-200'
                      }`}
                    >
                      <span aria-hidden className='font-bold'>
                        {a.ton === 'ok' ? '✓' : a.ton === 'alerte' ? '!' : 'i'}
                      </span>
                      <span className='font-medium'>{a.texte}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Caisse et banque : affichées seulement si elles sont utilisées */}
              {c.aCaisseBanque && (
                <section className='rounded-2xl bg-base-100 p-5 shadow-sm lg:col-span-12'>
                  <h2 className='mb-3 text-lg font-bold'>Caisse et banque</h2>
                  <div className='overflow-x-auto'>
                    <table className='table table-sm w-full'>
                      <thead>
                        <tr className='text-xs uppercase opacity-70'>
                          <th>Compte</th>
                          <th className='text-right'>Report</th>
                          <th className='text-right'>Encaissements</th>
                          <th className='text-right'>Décaissements</th>
                          <th className='text-right'>Solde</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className='font-bold'>Caisse</td>
                          <td className='text-right tabular-nums'>{fmt(bilan.caisseReport)}</td>
                          <td className='text-right tabular-nums text-success'>{fmt(bilan.caisseDebit)}</td>
                          <td className='text-right tabular-nums text-error'>{fmt(bilan.caisseCredit)}</td>
                          <td className='text-right font-bold tabular-nums'>{fmt(c.caisseSolde)}</td>
                        </tr>
                        <tr>
                          <td className='font-bold'>Banque</td>
                          <td className='text-right tabular-nums'>{fmt(bilan.banqueReport)}</td>
                          <td className='text-right tabular-nums text-success'>{fmt(bilan.banqueCredit)}</td>
                          <td className='text-right tabular-nums text-error'>{fmt(bilan.banqueDebit)}</td>
                          <td className='text-right font-bold tabular-nums'>{fmt(c.banqueSolde)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className='mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-base-200 px-3 py-2 text-sm'>
                    <span className='font-medium'>
                      Rapprochement : recettes {fmt(c.recettes)} − encaissements en caisse et banque {fmt(c.encaisseCompta)}
                    </span>
                    <span className={`font-bold tabular-nums ${Math.abs(c.ecart) < 1 ? 'text-success' : 'text-error'}`}>
                      Écart : {signe(c.ecart)}
                    </span>
                  </div>
                  {Math.abs(c.ecart) >= 1 && (
                    <p className='mt-1 text-xs font-normal opacity-60'>
                      Un écart peut venir d&apos;une vente encaissée mais pas encore versée en caisse, d&apos;une dette payée non enregistrée,
                      ou d&apos;une opération de caisse ou de banque sans lien avec les ventes (apport personnel, par exemple).
                    </p>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </Wrapper>
  )
}

export default page
