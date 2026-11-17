"use client";
import React from 'react'
import { PERIODES, fmt, type PeriodeId } from '@/lib/periodes'

export type Analyse = { ton: 'ok' | 'alerte' | 'info'; texte: string }

// Évolution en % par rapport à la période précédente (vert si c'est bon, rouge sinon)
export function Evolution({ pct, bonSiHausse = true }: { pct: number | null; bonSiHausse?: boolean }) {
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

// Carte de chiffre clé : libellé, grand chiffre, puis évolution ou précision
export function Kpi({ libelle, valeur, unite = 'FBU', classeValeur = '', pct, bonSiHausse, note }: {
  libelle: string
  valeur: string
  unite?: string
  classeValeur?: string
  pct?: number | null
  bonSiHausse?: boolean
  note?: string
}) {
  return (
    <div className='rounded-2xl bg-base-100 p-4 shadow-sm'>
      <p className='text-xs font-medium opacity-60 sm:text-sm'>{libelle}</p>
      <p className={`mt-1 break-words text-xl font-bold tabular-nums sm:text-2xl ${classeValeur}`}>
        {valeur} {unite && <span className='text-xs font-medium opacity-60'>{unite}</span>}
      </p>
      <div className='mt-0.5 min-h-4'>
        {pct !== undefined ? <Evolution pct={pct} bonSiHausse={bonSiHausse} /> : null}
        {note && <p className='truncate text-[11px] font-normal opacity-60'>{note}</p>}
      </div>
    </div>
  )
}

export function Barre({ libelle, valeur, max, classe, detail }: {
  libelle: string
  valeur: number
  max: number
  classe: string
  detail?: string
}) {
  const largeur = max > 0 ? Math.max(valeur > 0 ? 2 : 0, (valeur / max) * 100) : 0
  return (
    <div>
      <div className='mb-1 flex items-baseline justify-between gap-3 text-sm'>
        <span className='min-w-0 truncate font-semibold'>{libelle}</span>
        <span className='shrink-0 font-bold tabular-nums'>
          {fmt(valeur)}
          {detail && <span className='ml-1 text-xs font-normal opacity-60'>{detail}</span>}
        </span>
      </div>
      <div className='h-3 w-full overflow-hidden rounded-full bg-base-200'>
        <div className={`h-full rounded-full ${classe}`} style={{ width: `${largeur}%` }} />
      </div>
    </div>
  )
}

// Carte « barres » : un titre et une liste de barres comparées entre elles
export function CarteBarres({ titre, lignes, classe = 'bg-primary', className = '', vide = 'Rien à afficher pour le moment.' }: {
  titre: string
  lignes: { libelle: string; valeur: number; detail?: string; classe?: string }[]
  classe?: string
  className?: string
  vide?: string
}) {
  const max = Math.max(0, ...lignes.map((l) => l.valeur))
  return (
    <section className={`space-y-4 rounded-2xl bg-base-100 p-5 shadow-sm ${className}`}>
      <h2 className='text-lg font-bold'>{titre}</h2>
      {lignes.length === 0 && <p className='text-sm font-normal opacity-60'>{vide}</p>}
      {lignes.map((l) => (
        <Barre key={l.libelle} libelle={l.libelle} valeur={l.valeur} max={max} classe={l.classe ?? classe} detail={l.detail} />
      ))}
    </section>
  )
}

// Carte « analyse » : des phrases calculées automatiquement, vertes, rouges ou neutres
export function CarteAnalyse({ titre = 'Analyse', analyses, className = '' }: {
  titre?: string
  analyses: Analyse[]
  className?: string
}) {
  return (
    <section className={`rounded-2xl bg-base-100 p-5 shadow-sm ${className}`}>
      <h2 className='mb-3 text-lg font-bold'>{titre}</h2>
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
  )
}

// Boutons de période : Aujourd'hui, 7 jours, Ce mois, Cette année
export function BoutonsPeriode({ actif, onChoisir }: { actif?: PeriodeId; onChoisir: (id: PeriodeId) => void }) {
  return (
    <div className='flex flex-wrap gap-1'>
      {PERIODES.map((p) => (
        <button
          key={p.id}
          type='button'
          className={`btn btn-sm ${actif === p.id ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => onChoisir(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
