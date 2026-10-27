import { Transaction } from '@/type'
import React from 'react'
import { ArrowDownLeft, ArrowUpRight, FileText, Trash2 } from 'lucide-react'

const VINGT_QUATRE_HEURES_MS = 24 * 60 * 60 * 1000

const TransactionComponent = ({
    tx,
    productCostPrice = 0,
    onDelete
}: {
    tx: Transaction
    productCostPrice?: number
    onDelete?: (tx: Transaction) => void
}) => {
    const dateTx = new Date(tx.createdAt)
    const formattedDate = dateTx.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
    })
    const heure = dateTx.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })

    const isAchat = tx.type === "IN"
    const prixUnitaire = isAchat ? (tx.prixAchat || 0) : (tx.prixVente || tx.price || 0)
    const prixTotal = prixUnitaire * tx.quantity

    // Marge = (Prix de vente unitaire - Prix d'achat unitaire du produit) * quantité vendue
    // (affichée seulement quand le prix d'achat est connu)
    const margeTotale = (prixUnitaire - productCostPrice) * tx.quantity
    const afficherMarge = !isAchat && productCostPrice > 0

    // Photo de la facture : uniquement pour les achats (approvisionnements), si elle existe
    const factureUrl = isAchat && tx.factureUrl && tx.factureUrl.startsWith('https://') ? tx.factureUrl : null

    // Suppression d'un achat / annulation d'une vente entière : l'icône est toujours affichée,
    // mais désactivée après 24h, ou pour une vente non liée à ses lignes de stock (ancienne vente).
    const dansLes24h = Date.now() - dateTx.getTime() <= VINGT_QUATRE_HEURES_MS
    const venteAnnulable = isAchat || !!tx.venteId
    const peutSupprimer = dansLes24h && venteAnnulable

    let infobulle: string
    if (!dansLes24h) {
        infobulle = isAchat
            ? "Suppression impossible : cet achat a plus de 24h"
            : "Annulation impossible : cette vente a plus de 24h"
    } else if (!venteAnnulable) {
        infobulle = "Annulation impossible : cette vente est antérieure à la fonction d'annulation"
    } else {
        infobulle = isAchat
            ? "Supprimer l'achat (possible pendant 24h)"
            : "Annuler la vente entière (possible pendant 24h)"
    }

    return (
        <div className='flex items-center gap-3 py-3'>
            {/* Sens de l'opération : la vente sort du stock, l'achat y entre */}
            <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    isAchat ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'
                }`}
                aria-hidden='true'
            >
                {isAchat ? <ArrowDownLeft className='h-5 w-5' /> : <ArrowUpRight className='h-5 w-5' />}
            </span>

            {/* Produit et détail */}
            <div className='min-w-0 flex-1'>
                <p className='truncate font-semibold'>{tx.productName}</p>
                <p className='text-xs font-normal font-bold '>
                    Le {formattedDate} à {heure}
                </p>
                {factureUrl && (
                    <a
                        href={factureUrl}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='link link-primary mt-0.5 inline-flex items-center gap-1 text-xs font-semibold'
                    >
                        <FileText className='h-3.5 w-3.5' />
                        Voir la facture
                    </a>
                )}
            </div>

            {/* Montant, quantité et marge */}
            <div className='shrink-0 text-right'>
                <p className={`text-base font-bold tabular-nums md:text-lg ${isAchat ? 'text-warning' : 'text-success'}`}>
                    {prixTotal.toLocaleString()}
                </p>
                <p className='text-xs font-normal tabular-nums font-bold '>
                    {isAchat ? 'Entrée: +' : 'Sortie: −'}{tx.quantity}
                </p>
                {afficherMarge && (
                    <p className={`text-xs font-semibold tabular-nums ${margeTotale >= 0 ? 'text-success' : 'text-error'}`}>
                       {margeTotale >= 0 ? '+' : '-'}{Math.abs(margeTotale).toLocaleString()}
                    </p>
                )}
            </div>

            {/* Suppression / annulation : toujours affichée, désactivée si impossible.
                Le span porte l'infobulle car un bouton désactivé n'en affiche pas toujours. */}
            {onDelete && (
                <span title={infobulle} className='shrink-0'>
                    <button
                        type='button'
                        aria-label={isAchat ? "Supprimer l'achat" : "Annuler la vente"}
                        disabled={!peutSupprimer}
                        className={`btn btn-ghost btn-sm btn-circle text-error ${!peutSupprimer ? 'opacity-30 cursor-not-allowed' : ''}`}
                        onClick={() => onDelete(tx)}
                    >
                        <Trash2 className='h-4 w-4' />
                    </button>
                </span>
            )}
        </div>
    )
}

export default TransactionComponent