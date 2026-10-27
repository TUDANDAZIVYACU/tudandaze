import { ProductOverviewStats } from '@/type'
import React, { useEffect, useState } from 'react'
import { getProductOverviewStats } from '../actions'
import { useStockSync } from '@/lib/stock-sync'

const fmt = (n: number) => n.toLocaleString()

// Rechargement désactivé quand les données viennent de la page (mode « piloté »)
const rien = () => {}

type LigneProps = {
    libelle: string
    aide?: string
    valeur: number
    // Sans signe : ligne d'information (ex. la marge), qui n'entre pas dans le versement
    signe?: '+' | '−'
    couleur: string
}

// Une ligne du récapitulatif : le signe dit si le montant s'ajoute ou se retire du versement
const Ligne = ({ libelle, aide, valeur, signe, couleur }: LigneProps) => (
    <div className='flex items-baseline justify-between gap-3 py-3'>
        <div className='min-w-0'>
            <p className='font-semibold'>{libelle}</p>
            {aide && <p className='text-xs font-normal opacity-60'>{aide}</p>}
        </div>
        <p className={`whitespace-nowrap text-lg font-bold tabular-nums ${couleur}`}>
            {signe && (
                <>
                    <span className='mr-1.5 inline-block w-3 text-center opacity-60' aria-hidden='true'>{signe}</span>
                    <span className='sr-only'>{signe === '+' ? 'plus' : 'moins'}</span>
                </>
            )}
            {fmt(valeur)}
        </p>
    </div>
)

const ProductOverview = ({ email, dateFiltre, donnees, margeTotale, onTotalDepenses, onTotalDettes, onValeurAchats, onValeurVentes }: {
    email: string
    dateFiltre: string
    // undefined : le composant charge lui-même ses chiffres ; null ou objet : fournis par la page
    donnees?: ProductOverviewStats | null
    // Marge totale des ventes de la période (calculée par la page) ; absente : la ligne n'est pas affichée
    margeTotale?: number
    onTotalDepenses?: (value: number) => void
    onTotalDettes?: (value: number) => void
    onValeurAchats?: (value: number) => void
    onValeurVentes?: (value: number) => void
}) => {
    const piloté = donnees !== undefined
    const [statsLocales, setStatsLocales] = useState<ProductOverviewStats | null>(null)
    const stats = piloté ? donnees : statsLocales

    const fetchStats = async () => {
        try {
            if (email) {
                const result = await getProductOverviewStats(email, dateFiltre || undefined)
                if (result) {
                    setStatsLocales(result)
                    onTotalDepenses?.(result.totalDepenses)
                    onTotalDettes?.(result.totalDettes)
                    onValeurAchats?.(result.valeurAchats)
                    onValeurVentes?.(result.valeurVentes)
                }
            }
        } catch (error) {
            console.error(error)
        }
    }

    useEffect(() => {
        if (email && !piloté) fetchStats()
    }, [email, dateFiltre, piloté])

    // Rechargement automatique après toute création, approvisionnement, vente, annulation, dépense ou dette
    // (sans afficher le chargement : les anciens chiffres restent visibles jusqu'à l'arrivée des nouveaux)
    useStockSync(piloté ? rien : fetchStats)

    if (!stats) {
        return (
            <section
                className='space-y-4 rounded-3xl border border-base-300 bg-base-100 p-5 md:p-6'
                aria-busy='true'
                aria-label='Chargement du récapitulatif'
            >
                <div className='skeleton h-6 w-56'></div>
                <div className='skeleton h-10 w-full'></div>
                <div className='skeleton h-10 w-full'></div>
                <div className='skeleton h-10 w-full'></div>
                <div className='skeleton h-16 w-2/3'></div>
            </section>
        )
    }

    // Même formule qu'avant : ventes - dépenses - dettes accordées + paiements de dettes
    const versement = stats.valeurVentes - stats.totalDepenses - stats.dettesDonnees + stats.dettesPaye
    const enJournee = !!dateFiltre

    return (
        <section className='rounded-3xl border border-base-300 bg-base-100 p-5 md:p-6'>
            <h2 className='text-lg font-bold'>
                {enJournee ? 'Récapitulatif de la journée' : 'Récapitulatif de toutes les dates'}
            </h2>

            <div className='mt-1 divide-y divide-dashed divide-base-content/20'>
                <Ligne libelle='Ventes' valeur={stats.valeurVentes} signe='+' couleur='text-success' />
                {margeTotale !== undefined && (
                    <Ligne
                        libelle='Marge totale'
                        aide='Gain sur les ventes, non compté dans le versement'
                        valeur={margeTotale}
                        couleur={margeTotale >= 0 ? 'text-success' : 'text-error'}
                    />
                )}
                <Ligne libelle='Dépenses' valeur={stats.totalDepenses} signe='−' couleur='text-error' />
                <Ligne
                    libelle='Dettes accordées'
                    valeur={stats.dettesDonnees}
                    signe='−'
                    couleur='text-error'
                />
                <Ligne
                    libelle='Paiements des dettes'
                    valeur={stats.dettesPaye}
                    signe='+'
                    couleur='text-success'
                />
            </div>

            {/* Le chiffre à retenir : l'argent à verser */}
            <div className='mt-1 border-t-2 border-dashed border-base-content/30 pt-4'>
                <p className='font-semibold'>{enJournee ? 'Versement du jour' : 'Versement total'}</p>
                <p className='text-xs font-normal font-bold '>
                    Ventes − Dépenses − Dettes accordées + Paiements de dettes
                </p>
                <p className={`mt-2 text-4xl font-bold tabular-nums md:text-5xl ${versement >= 0 ? 'text-success' : 'text-error'}`}>
                    {fmt(versement)}{' '}
                    <span className='text-base font-medium opacity-60'></span>
                </p>
            </div>

            {/* Les achats entrent en stock : ils ne se déduisent pas du versement */}
            <div className='mt-5 flex items-baseline justify-between gap-3 border-t border-dashed border-base-content/20 pt-4'>
                <div className='min-w-0'>
                    <p className='font-semibold'>Achats</p>
                    <p className='text-xs font-normal font-bold '>Marchandises entrées en stock, non déduites du versement</p>
                </div>
                <p className='whitespace-nowrap text-lg font-bold tabular-nums text-warning'>
                    {fmt(stats.valeurAchats)}
                </p>
            </div>
        </section>
    )
}

export default ProductOverview