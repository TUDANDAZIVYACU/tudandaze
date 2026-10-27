import { StockSummary } from '@/type'
import React, { useEffect, useState } from 'react'
import { getStockSummary } from '../actions'
import EmptyState from './EmptyState'
import { useStockSync } from '@/lib/stock-sync'

// Seuil de stock faible (identique au calcul côté serveur)
const SEUIL_FAIBLE = 12

// Rechargement désactivé quand les données viennent de la page (mode « piloté »)
const rien = () => {}

const StockSummaryTable = ({ email, dateFiltre, donnees }: {
    email: string
    dateFiltre: string
    // undefined : le composant charge lui-même ses chiffres ; null ou objet : fournis par la page
    donnees?: StockSummary | null
}) => {
    const piloté = donnees !== undefined
    const [dataLocale, setDataLocale] = useState<StockSummary | null>(null)
    const data = piloté ? donnees : dataLocale

    const fetchSummary = async () => {
        try {
            if (email) {
                const resultat = await getStockSummary(email, dateFiltre || undefined)
                if (resultat) setDataLocale(resultat)
            }
        } catch (error) {
            console.error(error)
        }
    }

    useEffect(() => {
        if (email && !piloté) fetchSummary()
    }, [email, dateFiltre, piloté])

    // Rechargement automatique après toute création, approvisionnement, vente ou annulation
    useStockSync(piloté ? rien : fetchSummary)

    if (!data) {
        return (
            <section
                className='space-y-4 rounded-3xl border border-base-300 bg-base-100 p-5 md:p-6'
                aria-busy='true'
                aria-label="Chargement de l'état du stock"
            >
                <div className='skeleton h-6 w-40'></div>
                <div className='skeleton h-3 w-full'></div>
                <div className='skeleton h-24 w-full'></div>
            </section>
        )
    }

    const total = data.inStockCount + data.lowStockCount + data.outOfStockCount

    const segments = [
        { libelle: 'Stock normal', nombre: data.inStockCount, couleurBarre: 'bg-success', couleurTexte: 'text-success' },
        { libelle: `Stock faible (${SEUIL_FAIBLE} ou moins)`, nombre: data.lowStockCount, couleurBarre: 'bg-warning', couleurTexte: 'text-warning' },
        { libelle: 'Produits finis', nombre: data.outOfStockCount, couleurBarre: 'bg-error', couleurTexte: 'text-error' },
    ]

    // Les produits les plus bas en premier
    const aSurveiller = [...data.criticalProducts].sort(
        (a, b) => (a.quantity ?? 0) - (b.quantity ?? 0)
    )

    const resume = segments.map((s) => `${s.nombre} ${s.libelle.toLowerCase()}`).join(', ')

    return (
        <section className='rounded-3xl border border-base-300 bg-base-100 p-5 md:p-6'>
            <div className='flex items-baseline justify-between gap-3'>
                <h2 className='text-lg font-bold'>État du stock</h2>
                <p className='text-sm font-normal font-bold '>
                    {total} produit{total > 1 ? 's' : ''}
                </p>
            </div>

            {/* Répartition du stock */}
            <div
                className='mt-4 flex h-3 w-full overflow-hidden rounded-full bg-base-200'
                role='img'
                aria-label={resume}
            >
                {total > 0 && segments.map((s) =>
                    s.nombre > 0 ? (
                        <div
                            key={s.libelle}
                            className={s.couleurBarre}
                            style={{ width: `${(s.nombre / total) * 100}%` }}
                        />
                    ) : null
                )}
            </div>

            <ul className='mt-4 space-y-2'>
                {segments.map((s) => (
                    <li key={s.libelle} className='flex items-center justify-between gap-3'>
                        <span className='flex items-center gap-2'>
                            <span className={`inline-block h-3 w-3 rounded-full ${s.couleurBarre}`} aria-hidden='true'></span>
                            <span className='font-semibold'>{s.libelle}</span>
                        </span>
                        <span className={`text-lg font-bold tabular-nums ${s.couleurTexte}`}>{s.nombre}</span>
                    </li>
                ))}
            </ul>

            {/* Produits à réapprovisionner */}
            <div className='mt-6 border-t border-base-300 pt-5'>
                <h3 className='font-bold'>Produits à surveiller</h3>

                {aSurveiller.length > 0 ? (
                    <ul className='mt-2 max-h-96 divide-y divide-base-300 overflow-y-auto'>
                        {aSurveiller.map((product) => {
                            const quantite = product.quantity ?? 0
                            return (
                                <li key={product.id} className='py-3'>
                                    <div className='flex items-baseline justify-between gap-3'>
                                        <p className='min-w-0 truncate font-semibold'>{product.name}</p>
                                        {quantite === 0 ? (
                                            <span className='badge badge-error badge-soft font-bold'>Fini</span>
                                        ) : (
                                            <p className='whitespace-nowrap font-bold tabular-nums text-warning'>
                                                {quantite}{' '}
                                                <span className='text-xs font-normal opacity-60'>{product.unit}</span>
                                            </p>
                                        )}
                                    </div>
                                    {quantite > 0 && (
                                        <progress
                                            className='progress progress-warning mt-2 h-1.5 w-full'
                                            value={Math.min(quantite, SEUIL_FAIBLE)}
                                            max={SEUIL_FAIBLE}
                                            aria-label={`Stock restant de ${product.name}`}
                                        />
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                ) : (
                    <div className='mt-2'>
                        <EmptyState
                            message={`Aucun produit à surveiller : tout le stock dépasse ${SEUIL_FAIBLE}`}
                            IconComponent='PackageSearch'
                        />
                    </div>
                )}
            </div>
        </section>
    )
}

export default StockSummaryTable