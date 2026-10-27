import { Transaction } from '@/type'
import React, { useEffect, useState, useCallback } from 'react'
import { getTransactions } from '../actions'
import EmptyState from './EmptyState'
import TransactionComponent from './TransactionComponent'
import { useStockSync } from '@/lib/stock-sync'

// Rechargement désactivé quand les données viennent de la page (mode « piloté »)
const rien = () => {}

// Prix d'achat unitaire du dernier achat du même produit avant cette vente (0 si aucun)
const prixAchatPrecedent = (vente: Transaction, toutes: Transaction[]) => {
    const dateVente = new Date(vente.createdAt).getTime()
    const precedents = toutes
        .filter((t) =>
            t.type === "IN" &&
            t.productId === vente.productId &&
            new Date(t.createdAt).getTime() <= dateVente
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return precedents.length > 0 ? (precedents[0].prixAchat || 0) : 0
}

const RecentTransactions = ({ email, dateFiltre, donnees, coutsAchat }: {
  email: string
  dateFiltre: string
  // undefined : le composant charge lui-même ses opérations ; null ou liste : fournies par la page
  // (déjà filtrées sur la date par le serveur)
  donnees?: Transaction[] | null
  // Prix d'achat unitaire de chaque vente (clé : id de la transaction), calculé par le serveur
  coutsAchat?: Record<string, number>
}) => {
    const piloté = donnees !== undefined
    const [transactions, setTransactions] = useState<Transaction[]>([])

    const fetchData = useCallback(async () => {
        try {
            if (email) {
                const txs = await getTransactions(email)
                if (txs) setTransactions(txs)
            }
        } catch (error) {
            console.error(error)
        }
    }, [email])

    useEffect(() => {
        if (email && !piloté) fetchData()
    }, [email, fetchData, piloté])

    // Rechargement automatique après toute création, approvisionnement, vente ou annulation
    useStockSync(piloté ? rien : fetchData)

    if (piloté && donnees === null) {
        return (
            <section
                className='space-y-4 rounded-3xl border border-base-300 bg-base-100 p-5 md:p-6'
                aria-busy='true'
                aria-label='Chargement des opérations'
            >
                <div className='skeleton h-6 w-40'></div>
                <div className='skeleton h-12 w-full'></div>
                <div className='skeleton h-12 w-full'></div>
            </section>
        )
    }

    const filtered = piloté
        ? (donnees ?? [])
        : transactions.filter(tx => {
            if (!dateFiltre) return true
            const dateTx = new Date(tx.createdAt).toISOString().split("T")[0]
            return dateTx === dateFiltre
        })

    // Prix d'achat à envoyer à chaque opération (les achats n'en ont pas besoin)
    const coutDe = (tx: Transaction) => {
        if (tx.type === "IN") return 0
        return piloté ? (coutsAchat?.[tx.id] ?? 0) : prixAchatPrecedent(tx, transactions)
    }

    return (
        <section className='rounded-3xl border border-base-300 bg-base-100 p-5 md:p-6'>
            <div className='flex items-baseline justify-between gap-3'>
                <h2 className='text-lg font-bold'>Achats et ventes</h2>
                {filtered.length > 0 && (
                    <p className='text-lg font-bold '>
                        {filtered.length} opération{filtered.length > 1 ? 's' : ''}
                    </p>
                )}
            </div>

            {filtered.length === 0 ? (
                <div className='mt-2'>
                    <EmptyState
                        message='Aucun achat ni vente pour cette date'
                        IconComponent='CaptionsOff'
                    />
                </div>
            ) : (
                <div className='mt-2 divide-y divide-base-300'>
                    {filtered.map((tx) => (
                        <TransactionComponent key={tx.id} tx={tx} productCostPrice={coutDe(tx)} />
                    ))}
                </div>
            )}
        </section>
    )
}

export default RecentTransactions