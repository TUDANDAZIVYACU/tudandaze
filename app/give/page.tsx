"use client";
import { OrderItem, Product, VenteForPrint } from '@/type'
import { useUser } from '@clerk/nextjs'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { deductStockWithTransaction, readProductsWithRealQuantity, getVenteForPrint } from '../actions'
import Wrapper from '../components/Wrapper'
import EmptyState from '../components/EmptyState'
import { Trash, Plus, Minus, Printer, Search, X, ShoppingCart } from 'lucide-react'
import { toast } from 'react-toastify'
import { notifierStock, useStockSync } from '@/lib/stock-sync'

// Recherche sans tenir compte des accents ni des majuscules
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const MAX_RESULTATS = 24

const page = () => {
    const { user } = useUser()
    const email = user?.primaryEmailAddress?.emailAddress as string
    const [products, setProducts] = useState<Product[]>([])
    const [order, setOrder] = useState<OrderItem[]>([])
    const [searchQuery, setSearchQuery] = useState<string>("")
    const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({})
    const [montantPaye, setMontantPaye] = useState<number>(0)
    // Quand "Montant exact" est actif, le montant payé suit toujours le total du panier
    const [payeExact, setPayeExact] = useState<boolean>(false)
    const [clientNom, setClientNom] = useState<string>("")

    const [avecFacture, setAvecFacture] = useState<boolean>(false)
    const [tauxTva, setTauxTva] = useState<number>(18)
    const [derniereFacture, setDerniereFacture] = useState<VenteForPrint | null>(null)
    const [enCours, setEnCours] = useState<boolean>(false)

    const searchRef = useRef<HTMLInputElement>(null)
    const resumeRef = useRef<HTMLDivElement>(null)

    const fetchProducts = async () => {
        try {
            if (email) {
                const data = await readProductsWithRealQuantity(email)
                if (data) setProducts(data)
            }
        } catch (error) {
            console.error(error)
        }
    }

    useEffect(() => {
        if (!user) return
        if (!user.primaryEmailAddress?.emailAddress) return
        fetchProducts()
    }, [user])

    // Rechargement automatique après un approvisionnement, une création de produit, une annulation...
    useStockSync(fetchProducts)

    // Sur ordinateur, le curseur reste dans la recherche (sur téléphone, on évite d'ouvrir le clavier tout seul)
    const focusRecherche = () => {
        if (typeof window !== 'undefined' && window.innerWidth >= 768) {
            searchRef.current?.focus()
        }
    }
    useEffect(() => {
        focusRecherche()
    }, [])

    // Stock réellement disponible (mis à jour à chaque rechargement des produits)
    const dispoDe = (item: OrderItem) =>
        products.find(p => p.id === item.productId)?.quantity ?? item.availableQuantity

    const quantiteAuPanier = useMemo(() => {
        const map: Record<string, number> = {}
        order.forEach(item => { map[item.productId] = item.quantity })
        return map
    }, [order])

    const resultats = useMemo(() => {
        const q = norm(searchQuery.trim())
        return products
            .filter(p => (p.quantity ?? 0) > 0)
            .filter(p => !q || norm(p.name).includes(q))
            .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
    }, [products, searchQuery])

    const resultatsAffiches = resultats.slice(0, MAX_RESULTATS)

    const ajouterAuPanier = (product: Product) => {
        const stock = product.quantity ?? 0
        const existant = order.find(item => item.productId === product.id)

        if (existant) {
            if (existant.quantity + 1 > stock) {
                toast.warn(`Stock maximum atteint pour "${product.name}" (${stock} ${product.unit}).`)
                return
            }
            setOrder(prev => prev.map(item =>
                item.productId === product.id
                    ? { ...item, quantity: item.quantity + 1, availableQuantity: stock }
                    : item
            ))
        } else {
            setOrder(prev => [
                ...prev,
                {
                    productId: product.id,
                    quantity: 1,
                    unit: product.unit,
                    name: product.name,
                    availableQuantity: stock,
                    prixVente: product.prixVente || product.price || 0,
                    prixAchat: product.prixAchat || 0,
                }
            ])
        }
    }

    // Entrée dans la recherche : ajoute le premier résultat
    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && resultatsAffiches.length > 0) {
            e.preventDefault()
            ajouterAuPanier(resultatsAffiches[0])
            setSearchQuery("")
            focusRecherche()
        }
    }

    const changerQuantite = (productId: string, quantity: number) => {
        setOrder(prev => prev.map(item =>
            item.productId === productId ? { ...item, quantity } : item
        ))
    }

    const incrementer = (item: OrderItem) => {
        const stock = dispoDe(item)
        if (item.quantity + 1 > stock) {
            toast.warn(`Stock maximum atteint pour "${item.name}" (${stock} ${item.unit}).`)
            return
        }
        changerQuantite(item.productId, item.quantity + 1)
    }

    const decrementer = (item: OrderItem) => {
        if (item.quantity - 1 < 1) return
        changerQuantite(item.productId, item.quantity - 1)
    }

    const retirerDuPanier = (productId: string) => {
        setOrder(prev => prev.filter(item => item.productId !== productId))
        setQtyDrafts(prev => {
            if (!(productId in prev)) return prev
            const next = { ...prev }
            delete next[productId]
            return next
        })
    }

    const viderPanier = () => {
        if (order.length === 0) return
        if (!confirm("Vider tout le panier ?")) return
        setOrder([])
        setQtyDrafts({})
    }

    const saisirQuantite = (item: OrderItem, raw: string) => {
        setQtyDrafts(prev => ({ ...prev, [item.productId]: raw }))
        if (raw === "") return
        const valeur = Number(raw)
        if (isNaN(valeur) || valeur < 1) return
        const stock = dispoDe(item)
        if (valeur > stock) {
            toast.error(`Stock insuffisant : il ne reste que ${stock} ${item.unit} pour "${item.name}".`)
            setQtyDrafts(prev => ({ ...prev, [item.productId]: String(stock) }))
            changerQuantite(item.productId, stock)
            return
        }
        changerQuantite(item.productId, valeur)
    }

    const finirSaisieQuantite = (productId: string) => {
        setQtyDrafts(prev => {
            if (!(productId in prev)) return prev
            const next = { ...prev }
            delete next[productId]
            return next
        })
    }

    const totalHT = order.reduce((acc, item) => acc + (item.prixVente || 0) * item.quantity, 0)
    const tva = avecFacture ? totalHT * (tauxTva / 100) : 0
    const totalTTC = totalHT + tva
    const paye = payeExact ? totalTTC : montantPaye
    const difference = paye - totalTTC // >= 0 : à rendre ; < 0 : dette
    const enDette = order.length > 0 && difference < 0
    const nombreArticles = order.reduce((acc, item) => acc + item.quantity, 0)

    const handleSubmit = async () => {
        if (enCours) return
        if (!email) { toast.error("Utilisateur non connecté"); return }
        if (order.length === 0) { toast.error("Veuillez ajouter des produits."); return }
        if (order.some(item => !item.quantity || item.quantity < 1)) {
            toast.error("Veuillez renseigner une quantité pour chaque produit du panier.")
            return
        }
        const depasse = order.find(item => item.quantity > dispoDe(item))
        if (depasse) {
            toast.error(`Stock insuffisant pour "${depasse.name}" (disponible : ${dispoDe(depasse)}).`)
            return
        }
        if (avecFacture && !clientNom.trim()) {
            toast.error("Le nom du client est obligatoire pour une vente avec facture.")
            return
        }

        setEnCours(true)
        try {
            const response = await deductStockWithTransaction(
                order, email, paye, clientNom, avecFacture, tauxTva
            )

            if (response?.success) {
                if (response.solde !== undefined && response.solde < 0) {
                    toast.warn(`Vente enregistrée avec une dette de ${Math.abs(response.solde).toLocaleString()} pour ${clientNom.trim() || "Client"}.`)
                } else {
                    toast.success(avecFacture ? `Facture ${response.numero} enregistrée avec succès !` : "Vente confirmée avec succès !")
                }

                if (avecFacture && response.venteId) {
                    const facture = await getVenteForPrint(response.venteId, email)
                    if (facture) setDerniereFacture(facture as unknown as VenteForPrint)
                } else {
                    setDerniereFacture(null)
                }

                setOrder([])
                setQtyDrafts({})
                setMontantPaye(0)
                setPayeExact(false)
                setClientNom("")
                setAvecFacture(false)
                setTauxTva(18)
                setSearchQuery("")

                // Informe toute l'application (cette page, observation, transactions, dettes, centralisation, menu d'approvisionnement...)
                notifierStock()
                focusRecherche()
            } else {
                toast.error(`${response?.message}`)
            }
        } catch (error) {
            console.error(error)
            toast.error("Erreur réseau. Réessayez.")
        } finally {
            setEnCours(false)
        }
    }

    const handlePrintFacture = () => {
        window.print()
    }

    const allerAuResume = () => {
        resumeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    return (
        <Wrapper>
            <div className='grid gap-4 pb-28 md:grid-cols-12 md:pb-0 print:hidden'>

                {/* ───────── GAUCHE : recherche et produits ───────── */}
                <section className='md:col-span-5'>
                    <h1 className='text-2xl font-bold leading-tight md:text-3xl'>Vente</h1>
                    <p className='mb-3 text-sm font-normal opacity-60'>
                        <span className='hidden md:inline'>Entrée ajoute le premier résultat. </span>
                        Un appui sur un produit l&apos;ajoute au panier (chaque appui = +1).
                    </p>

                    <div className='relative'>
                        <Search className='pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 opacity-60' />
                        <input
                            ref={searchRef}
                            type="text"
                            inputMode="search"
                            aria-label="Rechercher un produit"
                            placeholder='Rechercher un produit...'
                            className='input input-bordered h-12 w-full pl-10 pr-10 text-base'
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                aria-label="Effacer la recherche"
                                className='btn btn-ghost btn-xs btn-circle absolute right-2 top-1/2 -translate-y-1/2'
                                onClick={() => { setSearchQuery(""); focusRecherche() }}
                            >
                                <X className='h-4 w-4' />
                            </button>
                        )}
                    </div>

                    <div className='mt-3'>
                        {resultatsAffiches.length > 0 ? (
                            <>
                                <div className='grid grid-cols-2 gap-2 md:grid-cols-1 xl:grid-cols-2'>
                                    {resultatsAffiches.map((product) => {
                                        const stock = product.quantity ?? 0
                                        const prix = product.prixVente || product.price || 0
                                        const dansPanier = quantiteAuPanier[product.id] ?? 0
                                        return (
                                            <button
                                                key={product.id}
                                                type="button"
                                                onClick={() => ajouterAuPanier(product)}
                                                className={`relative rounded-2xl border p-3 text-left transition active:scale-[0.98] ${
                                                    dansPanier > 0
                                                        ? 'border-primary bg-primary/10'
                                                        : 'border-base-300 bg-base-100 hover:border-primary'
                                                }`}
                                            >
                                                {dansPanier > 0 && (
                                                    <span className='badge badge-primary absolute -right-2 -top-2 font-bold'>
                                                        ×{dansPanier}
                                                    </span>
                                                )}
                                                <p className='break-words pr-1 font-bold leading-tight'>{product.name}</p>
                                                <p className='mt-1 text-lg font-bold tabular-nums text-primary'>{prix.toLocaleString()}</p>
                                                <span className={`badge badge-sm mt-1 font-semibold tabular-nums ${stock <= 12 ? 'badge-warning' : 'badge-ghost'}`}>
                                                    Stock : {stock} {product.unit}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                                {resultats.length > MAX_RESULTATS && (
                                    <p className='mt-2 text-center text-xs font-normal opacity-60'>
                                        {resultats.length - MAX_RESULTATS} autres produits : affinez la recherche pour les voir.
                                    </p>
                                )}
                            </>
                        ) : (
                            <EmptyState message='Aucun produit disponible' IconComponent='PackageSearch' />
                        )}
                    </div>
                </section>

                {/* ───────── DROITE : panier et paiement ───────── */}
                <section className='md:col-span-7'>
                    <div className='rounded-3xl border border-base-300 bg-base-100 p-5 md:p-6'>

                        {derniereFacture && (
                            <div className='mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-success bg-success/10 p-3'>
                                <span className='font-bold text-success'>Facture {derniereFacture.numero} prête.</span>
                                <button onClick={handlePrintFacture} className='btn btn-success btn-sm gap-2'>
                                    <Printer className='h-4 w-4' /> Imprimer la facture
                                </button>
                                <button
                                    type="button"
                                    className='btn btn-ghost btn-xs ml-auto'
                                    onClick={() => setDerniereFacture(null)}
                                >
                                    Fermer
                                </button>
                            </div>
                        )}

                        <div className='mb-3 flex items-center justify-between'>
                            <h2 className='flex items-center gap-2 text-lg font-bold'>
                                <ShoppingCart className='h-5 w-5' />
                                Panier
                                {order.length > 0 && (
                                    <span className='badge badge-primary font-bold'>{order.length}</span>
                                )}
                            </h2>
                            {order.length > 0 && (
                                <button type="button" className='btn btn-ghost btn-xs text-error' onClick={viderPanier}>
                                    Vider le panier
                                </button>
                            )}
                        </div>

                        {order.length > 0 ? (
                            <>
                                {/* Lignes du panier */}
                                <div className='divide-y divide-base-300'>
                                    {order.map((item) => {
                                        const stock = dispoDe(item)
                                        const depasse = item.quantity > stock
                                        return (
                                            <div key={item.productId} className='py-3'>
                                                <div className='flex items-start justify-between gap-2'>
                                                    <div className='min-w-0'>
                                                        <p className='break-words font-bold leading-tight'>{item.name}</p>
                                                        <p className='text-xs font-normal tabular-nums opacity-60'>
                                                            {(item.prixVente || 0).toLocaleString()} × {item.quantity} {item.unit}, dispo : {stock}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        aria-label="Retirer du panier"
                                                        className='btn btn-sm btn-ghost btn-circle text-error'
                                                        onClick={() => retirerDuPanier(item.productId)}
                                                    >
                                                        <Trash className='h-4 w-4' />
                                                    </button>
                                                </div>

                                                <div className='mt-2 flex items-center justify-between gap-2'>
                                                    <div className='flex items-center gap-1'>
                                                        <button
                                                            type="button"
                                                            aria-label="Moins"
                                                            className='btn btn-sm btn-circle btn-outline'
                                                            disabled={item.quantity - 1 < 1}
                                                            onClick={() => decrementer(item)}
                                                        >
                                                            <Minus className='h-4 w-4' />
                                                        </button>
                                                        <input
                                                            aria-label="Quantité"
                                                            type="number"
                                                            inputMode="decimal"
                                                            step="any"
                                                            min="1"
                                                            max={stock}
                                                            className='input input-bordered input-sm w-20 text-center font-bold'
                                                            value={item.productId in qtyDrafts ? qtyDrafts[item.productId] : String(item.quantity)}
                                                            onFocus={(e) => e.target.select()}
                                                            onChange={(e) => saisirQuantite(item, e.target.value)}
                                                            onBlur={() => finirSaisieQuantite(item.productId)}
                                                        />
                                                        <button
                                                            type="button"
                                                            aria-label="Plus"
                                                            className='btn btn-sm btn-circle btn-primary'
                                                            onClick={() => incrementer(item)}
                                                        >
                                                            <Plus className='h-4 w-4' />
                                                        </button>
                                                    </div>
                                                    <p className='text-lg font-bold tabular-nums'>
                                                        {((item.prixVente || 0) * item.quantity).toLocaleString()}
                                                    </p>
                                                </div>

                                                {depasse && (
                                                    <p className='mt-1 text-xs font-semibold text-error'>
                                                        Le stock a changé : il ne reste que {stock} {item.unit}.
                                                    </p>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Récapitulatif et paiement */}
                                <div ref={resumeRef} className='mt-4 scroll-mt-4 space-y-4 border-t-2 border-dashed border-base-content/30 pt-4'>

                                    {/* Avec / sans facture */}
                                    <div className='join w-full'>
                                        <button
                                            type="button"
                                            className={`btn join-item flex-1 ${!avecFacture ? 'btn-primary' : 'btn-outline'}`}
                                            onClick={() => setAvecFacture(false)}
                                        >
                                            Sans facture
                                        </button>
                                        <button
                                            type="button"
                                            className={`btn join-item flex-1 ${avecFacture ? 'btn-primary' : 'btn-outline'}`}
                                            onClick={() => setAvecFacture(true)}
                                        >
                                            Avec facture
                                        </button>
                                    </div>

                                    {avecFacture && (
                                        <div className='space-y-3 rounded-2xl border border-primary p-3'>
                                            <label className='flex flex-col gap-1'>
                                                <span className='text-sm font-normal opacity-70'>Nom du client *</span>
                                                <input
                                                    type="text"
                                                    className='input input-bordered w-full'
                                                    value={clientNom}
                                                    onChange={(e) => setClientNom(e.target.value)}
                                                />
                                            </label>
                                            <div className='flex items-center justify-between gap-3'>
                                                <label className='flex items-center gap-2'>
                                                    <span className='font-semibold'>TVA</span>
                                                    <input
                                                        aria-label="Taux de TVA"
                                                        type="number"
                                                        inputMode="decimal"
                                                        min="0"
                                                        max="100"
                                                        step="0.5"
                                                        value={tauxTva}
                                                        onFocus={(e) => e.target.select()}
                                                        onChange={(e) => {
                                                            const value = Number(e.target.value)
                                                            setTauxTva(isNaN(value) || value < 0 ? 0 : value)
                                                        }}
                                                        className='input input-bordered input-sm w-16 text-center font-bold'
                                                    />
                                                    <span className='font-semibold'>%</span>
                                                </label>
                                                <span className='font-bold tabular-nums text-warning'>{tva.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Totaux */}
                                    <div className='space-y-1'>
                                        <div className='flex items-center justify-between'>
                                            <span className='text-sm font-normal opacity-70'>
                                                {nombreArticles} article{nombreArticles > 1 ? 's' : ''}, montant HT
                                            </span>
                                            <span className='font-bold tabular-nums'>{totalHT.toLocaleString()}</span>
                                        </div>
                                        <div className='flex items-baseline justify-between'>
                                            <span className='font-semibold'>Montant à payer</span>
                                            <span className='text-3xl font-bold tabular-nums text-primary'>
                                                {totalTTC.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Paiement */}
                                    <div className='space-y-2 rounded-2xl border border-base-300 p-3'>
                                        <label htmlFor='montantPaye' className='text-sm font-normal opacity-70'>Montant payé par le client</label>
                                        <div className='flex gap-2'>
                                            <input
                                                id='montantPaye'
                                                type="number"
                                                inputMode="numeric"
                                                min="0"
                                                placeholder="0"
                                                value={paye === 0 ? "" : paye}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => {
                                                    const value = Number(e.target.value)
                                                    setPayeExact(false)
                                                    setMontantPaye(isNaN(value) || value < 0 ? 0 : value)
                                                }}
                                                className='input input-bordered h-12 flex-1 text-lg font-bold'
                                            />
                                            <button
                                                type="button"
                                                className={`btn h-12 ${payeExact ? 'btn-success' : 'btn-outline btn-success'}`}
                                                onClick={() => setPayeExact(true)}
                                            >
                                                Montant exact
                                            </button>
                                        </div>

                                        {/* Résultat : à rendre ou dette */}
                                        {difference >= 0 ? (
                                            <div className='flex items-center justify-between rounded-xl bg-success/15 px-3 py-2'>
                                                <span className='font-semibold text-success'>À rendre au client</span>
                                                <span className='text-xl font-bold tabular-nums text-success'>{difference.toLocaleString()}</span>
                                            </div>
                                        ) : (
                                            <div className='rounded-xl bg-error/15 px-3 py-2'>
                                                <div className='flex items-center justify-between'>
                                                    <span className='font-semibold text-error'>
                                                        {paye === 0 ? 'Aucun paiement : dette' : 'Reste dû : dette'}
                                                    </span>
                                                    <span className='text-xl font-bold tabular-nums text-error'>{Math.abs(difference).toLocaleString()}</span>
                                                </div>
                                                <p className='mt-1 text-xs font-normal text-error'>
                                                    Si le client a payé comptant, appuyez sur « Montant exact ».
                                                </p>
                                            </div>
                                        )}

                                        {/* Nom du client pour la dette (vente sans facture) */}
                                        {!avecFacture && enDette && (
                                            <label htmlFor='clientNom' className='flex flex-col gap-1'>
                                                <span className='text-sm font-normal opacity-70'>Nom du client (pour la dette)</span>
                                                <input
                                                    id='clientNom'
                                                    type="text"
                                                    placeholder='Nom du client'
                                                    value={clientNom}
                                                    className='input input-bordered w-full'
                                                    onChange={(e) => setClientNom(e.target.value)}
                                                />
                                            </label>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleSubmit}
                                        disabled={enCours}
                                        className={`btn h-14 w-full text-base ${enDette ? 'btn-warning' : 'btn-primary'}`}
                                    >
                                        {enCours ? (
                                            <span className='loading loading-spinner loading-sm'></span>
                                        ) : avecFacture ? (
                                            "Confirmer et générer la facture"
                                        ) : enDette ? (
                                            `Confirmer (dette de ${Math.abs(difference).toLocaleString()})`
                                        ) : (
                                            "Confirmer la vente"
                                        )}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <EmptyState message='Aucun produit dans le panier' IconComponent='HandHeart' />
                        )}
                    </div>
                </section>
            </div>

            {/* Barre fixe en bas sur téléphone : total + accès rapide au paiement */}
            {order.length > 0 && (
                <div
                    className='fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-base-300 bg-base-100 px-4 pt-3 md:hidden print:hidden'
                    style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
                >
                    <div className='min-w-0 flex-1'>
                        <p className='text-xs font-normal opacity-60'>{nombreArticles} article{nombreArticles > 1 ? 's' : ''}</p>
                        <p className='text-xl font-bold leading-tight tabular-nums text-primary'>{totalTTC.toLocaleString()}</p>
                    </div>
                    <button type="button" className='btn btn-primary' onClick={allerAuResume}>
                        Finaliser
                    </button>
                </div>
            )}

            {/* ZONE D'IMPRESSION */}
            {derniereFacture && (
                <div className='hidden print:block p-8 font-sans text-black'>
                    <div className='flex justify-between items-start border-b-2 border-black pb-4 mb-4'>
                        <div>
                            <h1 className='text-2xl font-bold'>{derniereFacture.businessName}</h1>
                            <p className='text-sm'>Bujumbura, Burundi</p>
                            <p className='text-sm'>Assujetti à la TVA</p>
                        </div>
                        <div className='text-right'>
                            <h2 className='text-xl font-bold'>FACTURE</h2>
                            <p className='text-sm'>N° {derniereFacture.numero}</p>
                            <p className='text-sm'>
                                Date : {new Date(derniereFacture.createdAt).toLocaleDateString('fr-FR')}
                            </p>
                        </div>
                    </div>

                    <div className='mb-6'>
                        <p className='font-bold'>Facturé à :</p>
                        <p>{derniereFacture.clientNom}</p>
                    </div>

                    <table className='w-full border-collapse mb-6'>
                        <thead>
                            <tr className='border-b-2 border-black'>
                                <th className='text-left py-2'>Désignation</th>
                                <th className='text-right py-2'>Qté</th>
                                <th className='text-right py-2'>P.U.</th>
                                <th className='text-right py-2'>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {derniereFacture.items.map((item) => (
                                <tr key={item.id} className='border-b border-gray-300'>
                                    <td className='py-2'>{item.productName}</td>
                                    <td className='text-right py-2'>{item.quantity} {item.unit}</td>
                                    <td className='text-right py-2'>{item.prixVente.toLocaleString()}</td>
                                    <td className='text-right py-2'>{(item.prixVente * item.quantity).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className='flex justify-end'>
                        <div className='w-64 space-y-1'>
                            <div className='flex justify-between'>
                                <span>Montant HT :</span>
                                <span>{derniereFacture.montantHT.toLocaleString()} FBU</span>
                            </div>
                            <div className='flex justify-between'>
                                <span>
                                    TVA assujettie ({derniereFacture.montantHT > 0 ? ((derniereFacture.montantTVA / derniereFacture.montantHT) * 100).toFixed(1) : 0}%) :
                                </span>
                                <span>{derniereFacture.montantTVA.toLocaleString()} FBU</span>
                            </div>
                            <div className='flex justify-between font-bold text-lg border-t-2 border-black pt-2'>
                                <span>Montant à payer (TTC) :</span>
                                <span>{derniereFacture.montantTotal.toLocaleString()} FBU</span>
                            </div>
                            <div className='flex justify-between'>
                                <span>Payé :</span>
                                <span>{derniereFacture.montantPaye.toLocaleString()} FBU</span>
                            </div>
                            {derniereFacture.solde < 0 && (
                                <div className='flex justify-between text-red-600 font-bold'>
                                    <span>Solde dû :</span>
                                    <span>{Math.abs(derniereFacture.solde).toLocaleString()} FBU</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <p className='mt-12 text-center text-sm'>Merci pour votre confiance.</p>
                </div>
            )}
        </Wrapper>
    )
}

export default page
