"use client";
import { Product } from '@/type'
import { useUser } from '@clerk/nextjs'
import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { readProductsWithRealQuantity, replenishStockWithTransaction } from '../actions'
import ProductComponent from './ProductComponent'
import { toast } from 'react-toastify'
import { compresserImage, estPhoto, typeMimePhoto, TAILLE_MAX_PHOTO } from '@/lib/photo'
import { envoyerPhoto } from '@/lib/upload-photo'
import { notifierStock, useStockSync } from '@/lib/stock-sync'

// Date du jour en heure locale ("2026-10-13"), et non en UTC
const todayISO = () => new Date().toLocaleDateString("en-CA")

const Stock = () => {

    const { user } = useUser()
    const email = user?.primaryEmailAddress?.emailAddress as string
    const router = useRouter()
    const [products, setProducts] = useState<Product[]>([])
    const [selectedProductId, setSelectedProductId] = useState<string>("")
    const [quantity, setQuantity] = useState<number>(0)
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [prixAchat, setPrixAchat] = useState<number>(0)
    const [prixVente, setPrixVente] = useState<number>(0)
    const [dateApprovis, setDateApprovis] = useState<string>(todayISO)
    const [factureFichier, setFactureFichier] = useState<File | null>(null)
    const [facturePreview, setFacturePreview] = useState<string>("")
    const [apercuImpossible, setApercuImpossible] = useState(false)
    const [enCours, setEnCours] = useState(false)
    const inputFactureRef = useRef<HTMLInputElement>(null)

    const margeUnitaire = prixVente - prixAchat
    const totalAchat = prixAchat * quantity
    const totalVente = prixVente * quantity
    const totalMarge = totalVente - totalAchat

    // Stock actuel du produit sélectionné, et aperçu du nouveau stock après ajout
    const stockActuel = selectedProduct?.quantity ?? 0
    const nouveauStock = stockActuel + (quantity > 0 ? quantity : 0)

    const fetchProducts = async () => {
        try {
            if (email) {
                // On utilise la quantité réelle (calculée à partir des transactions), pas la quantité de base
                const data = await readProductsWithRealQuantity(email)
                if (data) setProducts(data)
            }
        } catch (error) {
            console.error(error)
        }
    }

    useEffect(() => {
        if (email) fetchProducts()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [email])

    // Rechargement après une création de produit, une vente, une annulation...
    // Pas de rechargement toutes les 30 s ici (null) : cette fenêtre est présente sur toutes les pages
    // et ferait travailler le serveur pour rien quand elle est fermée.
    useStockSync(fetchProducts, null)

    // Garde le produit sélectionné à jour (stock actuel) quand la liste est rechargée
    useEffect(() => {
        if (!selectedProductId) return
        const produit = products.find((p) => p.id === selectedProductId)
        if (produit) setSelectedProduct(produit)
    }, [products, selectedProductId])

    const handleProductChange = (productId: string) => {
        const product = products.find((p) => p.id === productId)
        setSelectedProduct(product || null)
        setSelectedProductId(productId)
        if (product) {
            setPrixAchat(product.prixAchat || 0)
            setPrixVente(product.prixVente || product.price || 0)
        }
    }

    const viderFacture = () => {
        if (facturePreview) URL.revokeObjectURL(facturePreview)
        setFactureFichier(null)
        setFacturePreview("")
        setApercuImpossible(false)
        if (inputFactureRef.current) inputFactureRef.current.value = ""
    }

    const choisirFacture = (e: React.ChangeEvent<HTMLInputElement>) => {
        const fichier = e.target.files?.[0] ?? null
        if (facturePreview) URL.revokeObjectURL(facturePreview)
        setApercuImpossible(false)

        if (!fichier) {
            setFactureFichier(null)
            setFacturePreview("")
            return
        }
        if (!estPhoto(fichier)) {
            toast.error("Veuillez choisir une photo (JPEG, PNG, HEIC, WebP...).")
            viderFacture()
            return
        }
        if (fichier.size > TAILLE_MAX_PHOTO) {
            toast.error("La photo est trop lourde (15 Mo maximum).")
            viderFacture()
            return
        }
        setFactureFichier(fichier)
        setFacturePreview(URL.createObjectURL(fichier))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (enCours) return
        if (!email) {
            toast.error("Utilisateur non identifié. Réessayez dans un instant.")
            return
        }
        if (!selectedProductId || quantity <= 0) {
            toast.error("Veuillez sélectionner un produit et entrer une quantité valide.")
            return
        }
        if (prixAchat <= 0 || prixVente <= 0) {
            toast.error("Veuillez entrer le prix d'achat et de vente.")
            return
        }
        if (!dateApprovis) {
            toast.error("Veuillez entrer la date d'approvisionnement.")
            return
        }

        setEnCours(true)
        try {
            // Photo de la facture (facultative) : envoyée avant l'enregistrement
            let factureUrl: string | undefined
            if (factureFichier) {
                try {
                    const fichier = await compresserImage(factureFichier)
                    const nomSur = fichier.name.replace(/[^a-zA-Z0-9._-]/g, "_")
                    const blob = await envoyerPhoto(
                        `factures/${Date.now()}-${nomSur}`,
                        fichier,
                        typeMimePhoto(fichier)
                    )
                    factureUrl = blob.url
                } catch (error: any) {
                    console.error(error)
                    toast.error(`Impossible d'envoyer la photo de la facture (${error?.message || "erreur inconnue"}). Réessayez ou retirez la photo.`)
                    return
                }
            }

            await replenishStockWithTransaction(
                selectedProductId,
                quantity,
                email,
                prixAchat,
                prixVente,
                dateApprovis,
                factureUrl
            )
            toast.success("Stock réapprovisionné avec succès.")

            // Informe toute l'application (cette fenêtre, observation, créer produit, vente, transactions...)
            notifierStock()

            setSelectedProductId('')
            setQuantity(0)
            setSelectedProduct(null)
            setPrixAchat(0)
            setPrixVente(0)
            setDateApprovis(todayISO())
            viderFacture()
            const modal = (document.getElementById("my_modal_stock") as HTMLDialogElement)
            if (modal) modal.close()

            // On reste sur la page actuelle (plus de redirection vers l'accueil) : on rafraîchit aussi les composants serveur
            router.refresh()
        } catch (error: any) {
            console.error(error)
            toast.error(error?.message || "Erreur lors de l'approvisionnement.")
        } finally {
            setEnCours(false)
        }
    }

    return (
        <div>
            <dialog id="my_modal_stock" className="modal">
                <div className="modal-box max-w-lg">
                    <form method="dialog">
                        <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                    </form>
                    <h3 className="font-bold text-lg">Gestion du stock</h3>
                    <p className="py-2 text-sm text-gray-500">Ajoutez des quantités aux produits.</p>

                    <form className='space-y-3' onSubmit={handleSubmit}>

                        {/* Produit */}
                        <div>
                            <label className='block text-xs font-semibold mb-1'>Produit</label>
                            <select
                                value={selectedProductId}
                                className='select select-bordered w-full'
                                required
                                onChange={(e) => handleProductChange(e.target.value)}
                            >
                                <option value="">-- Choisir un produit --</option>
                                {products.map((product) => (
                                    <option key={product.id} value={product.id}>
                                        {product.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {selectedProduct && (
                            <ProductComponent
                                product={{ ...selectedProduct, quantity: nouveauStock }}
                            />
                        )}

                        {/* Comparaison : anciens prix du produit vs nouveaux prix saisis */}
                        {selectedProduct && (prixAchat !== selectedProduct.prixAchat || prixVente !== (selectedProduct.prixVente || selectedProduct.price)) && (
                            <div className='bg-warning/10 border-2 border-warning rounded-2xl p-3'>
                                <p className='text-xs font-bold uppercase text-warning mb-2'>
                                    ⚠️ Les prix et la marge du produit seront mis à jour
                                </p>
                                <div className='grid grid-cols-2 gap-2 text-center text-sm'>
                                    <div>
                                        <p className='text-xs text-gray-500'>Ancien prix d'achat</p>
                                        <p className='font-bold'>{(selectedProduct.prixAchat ?? 0).toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className='text-xs text-gray-500'>Nouveau prix d'achat</p>
                                        <p className='font-bold text-warning'>{prixAchat.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className='text-xs text-gray-500'>Ancien prix de vente</p>
                                        <p className='font-bold'>{(selectedProduct.prixVente ?? selectedProduct.price ?? 0).toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className='text-xs text-gray-500'>Nouveau prix de vente</p>
                                        <p className='font-bold text-warning'>{prixVente.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className='text-xs text-gray-500'>Ancienne marge unitaire</p>
                                        <p className='font-bold'>
                                            {((selectedProduct.prixVente ?? selectedProduct.price ?? 0) - (selectedProduct.prixAchat ?? 0)).toLocaleString()}
                                        </p>
                                    </div>
                                    <div>
                                        <p className='text-xs text-gray-500'>Nouvelle marge unitaire</p>
                                        <p className={`font-bold ${margeUnitaire >= 0 ? 'text-success' : 'text-error'}`}>
                                            {margeUnitaire.toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Date approvisionnement */}
                        <div>
                            <label className='block text-xs font-semibold mb-1'>
                                Date d'approvisionnement
                            </label>
                            <input
                                type="date"
                                value={dateApprovis}
                                required
                                onChange={(e) => setDateApprovis(e.target.value)}
                                className='input input-bordered w-full'
                            />
                        </div>

                        {/* Quantité */}
                        <div>
                            <label className='block text-xs font-semibold mb-1'>Quantité à ajouter</label>
                            <input
                                type="number"
                                placeholder='0'
                                value={quantity === 0 ? "" : quantity}
                                required
                                min={1}
                                onChange={(e) => setQuantity(Number(e.target.value))}
                                className='input input-bordered w-full'
                            />
                        </div>

                        {/* Prix achat / vente / Marge unitaire */}
                        <div className='grid grid-cols-3 gap-3'>
                            <div>
                                <label className='block text-xs font-semibold mb-1'>
                                    Prix achat unitaire 
                                </label>
                                <input
                                    type="number"
                                    placeholder='0'
                                    value={prixAchat === 0 ? "" : prixAchat}
                                    min={0}
                                    onChange={(e) => setPrixAchat(Number(e.target.value))}
                                    className='input input-bordered w-full'
                                />
                            </div>
                            <div>
                                <label className='block text-xs font-semibold mb-1'>
                                    Prix vente unitaire 
                                </label>
                                <input
                                    type="number"
                                    placeholder='0'
                                    value={prixVente === 0 ? "" : prixVente}
                                    min={0}
                                    onChange={(e) => setPrixVente(Number(e.target.value))}
                                    className='input input-bordered w-full'
                                />
                            </div>
                            <div>
                                <label className='block text-xs font-semibold mb-1'>
                                    Marge unitaire
                                </label>
                                <div className={`input input-bordered w-full flex items-center font-bold ${margeUnitaire >= 0 ? '!text-success' : '!text-error'}`}>
                                    {margeUnitaire.toLocaleString()}
                                </div>
                            </div>
                        </div>

                        {/* Totaux - toujours visibles */}
                        <div className='grid grid-cols-3 gap-3'>
                                <div>
                                    <label className='block text-xs font-semibold mb-1'>Total achat</label>
                                    <div className='input input-bordered w-full flex items-center font-bold text-lg'>
                                        {totalAchat.toLocaleString()} 
                                    </div>
                                </div>
                                <div>
                                    <label className='block text-xs font-semibold mb-1'>Total vente</label>
                                    <div className='input input-bordered w-full flex items-center font-bold text-lg'>
                                        {totalVente.toLocaleString()} 
                                    </div>
                                </div>
                                <div>
                                    <label className='block text-xs font-semibold mb-1'>Marge totale</label>
                                    <div className={`input input-bordered w-full flex items-center font-black text-lg ${totalMarge >= 0 ? '!text-success' : '!text-error'}`}>
                                        {totalMarge.toLocaleString()} 
                                    </div>
                                </div>
                            </div>

                        {/* Photo de la facture (facultative) : tout type de photo */}
                        <div>
                            <label className='block text-xs font-semibold mb-1'>
                                Photo de la facture (facultatif)
                            </label>
                            <input
                                ref={inputFactureRef}
                                type="file"
                                accept="image/*,.heic,.heif"
                                onChange={choisirFacture}
                                className='file-input file-input-bordered w-full'
                            />
                            {factureFichier && (
                                <div className='mt-2 flex items-start gap-3'>
                                    {apercuImpossible ? (
                                        <p className='text-xs font-bold text-gray-600 break-all'>
                                            Photo sélectionnée : {factureFichier.name} (aperçu indisponible pour ce format, elle sera bien enregistrée)
                                        </p>
                                    ) : (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={facturePreview}
                                            alt="Aperçu de la facture"
                                            onError={() => setApercuImpossible(true)}
                                            className='h-28 w-auto rounded-xl border-2 border-base-200 object-contain'
                                        />
                                    )}
                                    <button
                                        type="button"
                                        className='btn btn-xs btn-ghost text-error'
                                        onClick={viderFacture}
                                    >
                                        RETIRER LA PHOTO
                                    </button>
                                </div>
                            )}
                        </div>

                        <button type="submit" disabled={enCours} className='btn btn-primary w-full'>
                            {enCours ? <span className='loading loading-spinner loading-sm'></span> : 'Ajouter au stock'}
                        </button>

                    </form>
                </div>
            </dialog>
        </div>
    )
}

export default Stock
