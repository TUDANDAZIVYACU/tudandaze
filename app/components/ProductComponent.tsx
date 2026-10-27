import { Product } from '@/type'
import React from 'react'
import { Plus, Trash2 } from 'lucide-react'

const VINGT_QUATRE_HEURES_MS = 24 * 60 * 60 * 1000

interface ProductComponentProps {
    product?: Product | null
    add?: boolean
    handleAddToCart?: (product: Product) => void
    overrideSubtitle?: string
    showDetails?: boolean
    onDelete?: (product: Product) => void
    dejaVendu?: boolean
}

const ProductComponent: React.FC<ProductComponentProps> = ({ product, add, handleAddToCart, overrideSubtitle, showDetails, onDelete, dejaVendu }) => {
    if (!product) {
        return (
            <div className='flex w-full items-center rounded-2xl border border-dashed border-base-300 p-4 text-sm font-normal opacity-70'>
                Sélectionnez un produit pour voir ses détails
            </div>
        )
    }
    const qty = product.quantity ?? 0
    const prixVenteUnitaire = product.prixVente ?? 0
    const prixVenteTotal = prixVenteUnitaire * qty
    const margeTotal = ((product.prixVente ?? 0) - (product.prixAchat ?? 0)) * qty

    // Le bouton SUPPRIMER n'est affiché que pendant les 24h suivant la création du produit,
    // et seulement si le produit n'a jamais été vendu
    const peutSupprimer =
        !!onDelete &&
        !dejaVendu &&
        Date.now() - new Date(product.createdAt).getTime() <= VINGT_QUATRE_HEURES_MS

    return (
        <div className='flex w-full items-center justify-between gap-4 rounded-2xl border border-base-300 bg-base-100 p-4'>
            <div className='min-w-0 space-y-2'>
                <h2 className='break-words text-lg font-bold leading-tight'>{product.name}</h2>
                {overrideSubtitle && (
                    <div className='badge badge-warning badge-soft'>
                        {overrideSubtitle}
                    </div>
                )}
                <div className='badge badge-warning badge-soft font-bold tabular-nums'>
                    {qty} {product.unit}
                </div>
                {peutSupprimer && (
                    <div>
                        <button
                            type='button'
                            aria-label="supprimer"
                            onClick={() => onDelete?.(product)}
                            className='btn btn-sm btn-error btn-outline gap-1'
                        >
                            <Trash2 className='h-4 w-4' />
                            Supprimer
                        </button>
                    </div>
                )}
                {add && handleAddToCart && (
                    <div>
                        <button
                            type='button'
                            aria-label="ajouter"
                            onClick={() => handleAddToCart(product)}
                            className='btn btn-sm btn-circle btn-primary'
                        >
                            <Plus className='h-4 w-4' />
                        </button>
                    </div>
                )}
            </div>

            {showDetails && (
                <dl className='shrink-0 space-y-1 text-right'>
                    <div>
                        <dt className='text-xs font-normal opacity-60'>Prix de vente</dt>
                        <dd className='font-bold tabular-nums'>{prixVenteUnitaire.toLocaleString()}</dd>
                    </div>
                    <div>
                        <dt className='text-xs font-normal opacity-60'>Valeur en stock</dt>
                        <dd className='font-bold tabular-nums'>{prixVenteTotal.toLocaleString()}</dd>
                    </div>
                    <div>
                        <dt className='text-xs font-normal opacity-60'>Marge:</dt>
                        <dd className={`font-bold tabular-nums ${margeTotal >= 0 ? 'text-success' : 'text-error'}`}>
                            {margeTotal.toLocaleString()}
                        </dd>
                    </div>
                </dl>
            )}
        </div>
    )
}

export default ProductComponent
