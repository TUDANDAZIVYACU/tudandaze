"use client";
import { Transaction } from '@/type'
import { useUser } from '@clerk/nextjs'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Wrapper from '../components/Wrapper'
import { getTransactions, getBusinessName } from '../actions'
import { deleteTransaction, annulerVente } from '../actions-transactions'
import EmptyState from '../components/EmptyState'
import TransactionComponent from '../components/TransactionComponent'
import { Download, RotateCcw } from 'lucide-react'
import { toast } from 'react-toastify'
import { notifierStock, useStockSync } from '@/lib/stock-sync'

const ITEMS_PER_PAGE = 5000

// Produit proposé dans le menu de filtre (construit à partir des transactions)
type ProduitFiltre = { id: string; name: string }

// Retourne la date locale au format YYYY-MM-DD (pour les <input type="date"> et les comparaisons)
const toLocalDateStr = (d: Date | string) => {
    const date = new Date(d)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

const todayStr = () => toLocalDateStr(new Date())

// "lundi 19 octobre 2026"
const dateLongue = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    })

// Trouve, pour une vente donnée, l'achat (IN) du même produit le plus proche AVANT cette vente.
// Retourne le prix d'achat unitaire de cet achat, ou 0 si aucun achat antérieur n'existe.
const getPrecedingPurchaseUnitPrice = (saleTx: Transaction, allTransactions: Transaction[]) => {
    const saleDate = new Date(saleTx.createdAt).getTime()

    const priorPurchases = allTransactions
        .filter((t) =>
            t.type === "IN" &&
            t.productId === saleTx.productId &&
            new Date(t.createdAt).getTime() <= saleDate
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return priorPurchases.length > 0 ? (priorPurchases[0].prixAchat || 0) : 0
}

const page = () => {

    const { user } = useUser()
    const email = user?.primaryEmailAddress?.emailAddress as string
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [nomEntreprise, setNomEntreprise] = useState<string>("")
    const [selectedProductId, setSelectedProductId] = useState<string>("")
    const [dateFrom, setDateFrom] = useState<string>(todayStr())
    const [dateTo, setDateTo] = useState<string>(todayStr())
    const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([])
    const [currentPage, setCurrentPage] = useState<number>(1)
    const [isExporting, setIsExporting] = useState(false)
    const pdfContentRef = useRef<HTMLDivElement>(null)

    const fetchData = async () => {
        try {
            if (email) {
                const txs = await getTransactions(email)
                if (txs) {
                    setTransactions(txs)
                }
            }
        } catch (error) {
            console.error(error)
        }
    }

    useEffect(() => {
        if (email)
            fetchData()
    }, [email])

    // Nom de l'entreprise, affiché en tête du PDF
    useEffect(() => {
        const identifiant = user?.primaryEmailAddress?.emailAddress ?? user?.primaryPhoneNumber?.phoneNumber
        if (!identifiant) return
        getBusinessName(identifiant)
            .then((nom) => setNomEntreprise(nom))
            .catch((error) => console.error(error))
    }, [user])

    // Rechargement automatique après une vente, un approvisionnement, une annulation...
    // faits sur une autre page, un autre onglet ou un autre appareil (toutes les 30 s)
    useStockSync(fetchData)

    // Tous les produits qui ont au moins une transaction (aucune limite), triés par ordre alphabétique
    const produitsFiltre = useMemo<ProduitFiltre[]>(() => {
        const map = new Map<string, string>()
        transactions.forEach((tx) => {
            if (tx.productId && !map.has(tx.productId)) {
                map.set(tx.productId, tx.productName || "")
            }
        })
        return Array.from(map, ([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
    }, [transactions])

    useEffect(() => {
        let filtered = transactions;

        if (selectedProductId) {
            filtered = filtered.filter((tx) => tx.productId === selectedProductId)
        }

        if (dateFrom) {
            filtered = filtered.filter((tx) => toLocalDateStr(tx.createdAt) >= dateFrom)
        }

        if (dateTo) {
            filtered = filtered.filter((tx) => toLocalDateStr(tx.createdAt) <= dateTo)
        }

        setFilteredTransactions(filtered)
        setCurrentPage(1)
    }, [selectedProductId, dateFrom, dateTo, transactions])

    // Achat : suppression de l'achat. Vente : annulation de la vente entière.
    const handleDeleteTransaction = async (tx: Transaction) => {
        if (!email) return
        const estVente = tx.type !== "IN"

        if (estVente && !tx.venteId) {
            toast.error("Cette vente est antérieure à la fonction d'annulation : elle ne peut pas être annulée.")
            return
        }

        let message: string
        if (estVente) {
            const lignes = transactions.filter((t) => t.venteId && t.venteId === tx.venteId).length
            message = `Annuler toute cette vente (${lignes} article${lignes > 1 ? 's' : ''}) ? Le stock sera restitué, et la facture ainsi que la dette éventuelle seront supprimées.`
        } else {
            message = `Supprimer cet achat de ${tx.quantity} ${tx.productName} ? Le stock sera diminué de ${tx.quantity}.`
        }
        if (!confirm(message)) return

        try {
            const res = estVente && tx.venteId
                ? await annulerVente(tx.venteId, email)
                : await deleteTransaction(tx.id, email)
            if (res.success) {
                toast.success(estVente ? "Vente annulée avec succès" : "Opération supprimée avec succès")
                // Rafraîchit cette page et toutes les pages concernées (accueil, stock, dettes...)
                notifierStock()
            } else {
                toast.error(res.message)
            }
        } catch (error) {
            console.error(error)
            toast.error("Erreur réseau. Réessayez.")
        }
    }

    const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const currentTransactions = filteredTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE)

    // Regroupe les opérations affichées par jour (elles arrivent déjà de la plus récente à la plus ancienne)
    const groupes: { jour: string; liste: Transaction[] }[] = []
    currentTransactions.forEach((tx) => {
        const jour = toLocalDateStr(tx.createdAt)
        const dernier = groupes[groupes.length - 1]
        if (dernier && dernier.jour === jour) {
            dernier.liste.push(tx)
        } else {
            groupes.push({ jour, liste: [tx] })
        }
    })

    // Calcul des totaux Achats / Ventes sur les transactions filtrées
    const totalAchats = filteredTransactions
        .filter((tx) => tx.type === "IN")
        .reduce((sum, tx) => {
            const prixUnitaire = tx.prixAchat || 0
            return sum + prixUnitaire * tx.quantity
        }, 0)

    const totalVentes = filteredTransactions
        .filter((tx) => tx.type !== "IN")
        .reduce((sum, tx) => {
            const prixUnitaire = tx.prixVente || tx.price || 0
            return sum + prixUnitaire * tx.quantity
        }, 0)

    // Profit total = somme sur les ventes de (Prix de vente unitaire - Prix d'achat unitaire de l'achat précédent) * quantité
    // NB: on recherche l'achat précédent dans TOUTES les transactions (pas seulement celles filtrées),
    // car cet achat peut être antérieur à la plage de dates affichée.
    const totalProfit = filteredTransactions
        .filter((tx) => tx.type !== "IN")
        .reduce((sum, tx) => {
            const prixVenteUnitaire = tx.prixVente || tx.price || 0
            const prixAchatUnitaire = getPrecedingPurchaseUnitPrice(tx, transactions)
            return sum + (prixVenteUnitaire - prixAchatUnitaire) * tx.quantity
        }, 0)

    const nomProduitFiltre = selectedProductId
        ? (produitsFiltre.find((p) => p.id === selectedProductId)?.name ?? "")
        : "Tous les produits"

    const handleExportPDF = async () => {
        if (!pdfContentRef.current) return
        setIsExporting(true)
        try {
            const html2canvas = (await import('html2canvas-pro')).default
            const { default: jsPDF } = await import('jspdf')

            const container = pdfContentRef.current

            const containerRect = container.getBoundingClientRect()
            const rowEls = Array.from(container.querySelectorAll('table tbody tr')) as HTMLElement[]
            const rowBoundaries = rowEls.map((row) => {
                const rect = row.getBoundingClientRect()
                return {
                    top: rect.top - containerRect.top,
                    bottom: rect.bottom - containerRect.top
                }
            })

            const scale = 2
            const canvas = await html2canvas(container, {
                scale,
                useCORS: true,
                backgroundColor: '#ffffff'
            })
            const imgData = canvas.toDataURL('image/png')

            const pdf = new jsPDF('p', 'mm', 'a4')
            const pageWidth = pdf.internal.pageSize.getWidth()
            const pageHeight = pdf.internal.pageSize.getHeight()
            const imgWidth = pageWidth
            const imgHeight = (canvas.height * imgWidth) / canvas.width

            const pxPerMm = canvas.width / imgWidth
            const mmPerPx = 1 / pxPerMm
            const pageHeightPx = pageHeight * pxPerMm

            const rowBoundariesPx = rowBoundaries.map(r => ({ top: r.top * scale, bottom: r.bottom * scale }))

            let currentStart = 0
            let first = true

            while (currentStart < canvas.height - 1) {
                let cutEnd = Math.min(currentStart + pageHeightPx, canvas.height)
                let cutEarly = false

                if (cutEnd < canvas.height) {
                    const straddlingRow = rowBoundariesPx.find(
                        (r) => r.top < cutEnd && r.bottom > cutEnd
                    )
                    if (straddlingRow && straddlingRow.top > currentStart) {
                        cutEnd = straddlingRow.top
                        cutEarly = true
                    }
                }

                if (!first) pdf.addPage()
                first = false

                const positionMm = -(currentStart * mmPerPx)
                pdf.addImage(imgData, 'PNG', 0, positionMm, imgWidth, imgHeight)

                // Masque la partie de la ligne coupée en bas de page
                if (cutEarly) {
                    const cutMm = (cutEnd - currentStart) * mmPerPx
                    pdf.setFillColor(255, 255, 255)
                    pdf.rect(0, cutMm, pageWidth, pageHeight - cutMm, 'F')
                }

                currentStart = cutEnd
            }

            pdf.save(`historique_${dateFrom}_au_${dateTo}.pdf`)
            toast.success("PDF généré avec succès")
        } catch (error) {
            console.error(error)
            toast.error("Erreur lors de la génération du PDF")
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <Wrapper>
            <div className='space-y-4'>

                {/* En-tête : titre et export */}
                <div className='flex flex-wrap items-center justify-between gap-3'>
                    <div>
                        <h1 className='text-2xl font-bold leading-tight md:text-3xl'>Historique</h1>
                        <p className='text-sm font-normal opacity-60'>Tous les achats et toutes les ventes, jour par jour</p>
                    </div>
                    <button
                        type='button'
                        onClick={handleExportPDF}
                        disabled={isExporting || filteredTransactions.length === 0}
                        className='btn btn-outline btn-sm md:btn-md'
                    >
                        <Download className='h-4 w-4' />
                        {isExporting ? "Génération du PDF..." : "Télécharger le PDF"}
                    </button>
                </div>

                {/* Filtres : sur téléphone, Du, Au et l'icône de réinitialisation sont sur la même ligne */}
                <section className='grid grid-cols-[1fr_1fr_auto] items-end gap-3 rounded-2xl border border-base-300 bg-base-100 p-3 md:grid-cols-[2fr_1fr_1fr_auto] md:p-4'>
                    <label className='col-span-3 flex flex-col gap-1 md:col-span-1'>
                        <span className='text-sm font-normal opacity-70'>Produit</span>
                        <select aria-label="Filtrer par produit"
                            className='select select-bordered w-full'
                            value={selectedProductId}
                            onChange={(e) => setSelectedProductId(e.target.value)}
                        >
                            <option value="">Tous les produits</option>
                            {produitsFiltre.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className='flex min-w-0 flex-col gap-1'>
                        <span className='text-sm font-normal opacity-70'>Du</span>
                        <input aria-label="Date de début"
                            type="date"
                            className='input input-bordered w-full min-w-0'
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                        />
                    </label>

                    <label className='flex min-w-0 flex-col gap-1'>
                        <span className='text-sm font-normal opacity-70'>Au</span>
                        <input aria-label="Date de fin"
                            type="date"
                            className='input input-bordered w-full min-w-0'
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                        />
                    </label>

                    <button aria-label="Réinitialiser les filtres"
                        title="Réinitialiser"
                        type='button'
                        className='mb-3 flex items-center justify-center gap-2 text-primary transition-opacity hover:opacity-70 md:mb-0 md:h-12 md:px-3 md:font-semibold'
                        onClick={() => {
                            setSelectedProductId("")
                            setDateFrom(todayStr())
                            setDateTo(todayStr())
                        }}
                    >
                        <RotateCcw className='h-5 w-5' />
                        <span className='hidden md:inline'>Réinitialiser</span>
                    </button>
                </section>

                {/* Bilan de la période affichée */}
                <section>
                    <div className='grid grid-cols-3 divide-x divide-base-300 rounded-2xl border border-base-300 bg-base-100'>
                        <div className='p-3 md:p-5'>
                            <p className='text-xs font-normal opacity-70 md:text-sm'>Achats</p>
                            <p className='text-lg font-bold tabular-nums text-warning md:text-3xl'>{totalAchats.toLocaleString()}</p>
                        </div>
                        <div className='p-3 md:p-5'>
                            <p className='text-xs font-normal opacity-70 md:text-sm'>Ventes</p>
                            <p className='text-lg font-bold tabular-nums text-success md:text-3xl'>{totalVentes.toLocaleString()}</p>
                        </div>
                        <div className='p-3 md:p-5'>
                            <p className='text-xs font-normal opacity-70 md:text-sm'>Profit</p>
                            <p className={`text-lg font-bold tabular-nums md:text-3xl ${totalProfit >= 0 ? 'text-success' : 'text-error'}`}>
                                {totalProfit.toLocaleString()}
                            </p>
                        </div>
                    </div>
                    <p className='mt-2 text-xs font-normal opacity-60'>
                        Profit : pour chaque vente, prix de vente moins prix d&apos;achat du dernier approvisionnement.
                    </p>
                </section>

                {/* Opérations, regroupées par jour */}
                {transactions.length == 0 ? (
                    <EmptyState
                        message='Aucune Transaction pour le moment'
                        IconComponent='CaptionsOff'
                    />
                ) : filteredTransactions.length === 0 ? (
                    <EmptyState
                        message='Aucune opération pour ces filtres : élargissez les dates ou choisissez tous les produits'
                        IconComponent='PackageSearch'
                    />
                ) : (
                    <div className='space-y-5'>
                        {groupes.map((groupe) => (
                            <section key={groupe.jour}>
                                <div className='mb-2 flex items-baseline justify-between gap-3 px-1'>
                                    <h2 className='font-bold first-letter:uppercase'>{dateLongue(groupe.jour)}</h2>
                                    <p className='text-sm font-normal opacity-60'>
                                        {groupe.liste.length} opération{groupe.liste.length > 1 ? 's' : ''}
                                    </p>
                                </div>
                                <div className='divide-y divide-base-300 rounded-2xl border border-base-300 bg-base-100 px-4'>
                                    {groupe.liste.map((tx) => (
                                        <TransactionComponent
                                            key={tx.id}
                                            tx={tx}
                                            productCostPrice={tx.type !== "IN" ? getPrecedingPurchaseUnitPrice(tx, transactions) : 0}
                                            onDelete={handleDeleteTransaction}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )}

                {/* BLOC CACHÉ — contenu exact du PDF exporté */}
                <div
                    ref={pdfContentRef}
                    style={{ position: 'fixed', top: 0, left: '-9999px', width: '800px' }}
                    className='bg-white p-6'
                >
                    {nomEntreprise && (
                        <h2 className='text-2xl font-black text-left mb-1'>{nomEntreprise}</h2>
                    )}
                    <h1 className='text-2xl font-black text-left mb-1'>Historique des approvisionnements et ventes</h1>
                    <div className='flex items-center justify-between mb-4'>
                        <p className='text-sm'>
                            {nomProduitFiltre} — DU {new Date(dateFrom).toLocaleDateString('fr-FR')} AU {new Date(dateTo).toLocaleDateString('fr-FR')}
                        </p>
                        <div className='text-right'>
                            <p className='text-sm'>
                                ACHATS : <span className='text-success font-bold'>{totalAchats.toLocaleString()}</span>
                            </p>
                            <p className='text-sm'>
                                VENTES : <span className='text-error font-bold'>{totalVentes.toLocaleString()}</span>
                            </p>
                            <p className='text-sm'>
                                PROFIT : <span className={`font-bold ${totalProfit >= 0 ? 'text-success' : 'text-error'}`}>
                                    {totalProfit.toLocaleString()}
                                </span>
                            </p>
                        </div>
                    </div>

                    <table className='table table-sm w-full'>
                        <thead>
                            <tr className='bg-success text-white'>
                                <th className='text-white'>Date</th>
                                <th className='text-white'>Produit</th>
                                <th className='text-white'>Type</th>
                                <th className='text-white text-right'>Qté</th>
                                <th className='text-white text-right'>P.U</th>
                                <th className='text-white text-right'>Total</th>
                            </tr>
                        </thead>
                        {/* Lignes serrées : padding vertical réduit */}
                        <tbody className='[&_td]:py-0.5 [&_td]:leading-tight'>
                            {filteredTransactions.length > 0 ? (
                                filteredTransactions.map((tx) => {
                                    const isAchat = tx.type === "IN"
                                    const prixUnitaire = isAchat
                                        ? (tx.prixAchat || 0)
                                        : (tx.prixVente || tx.price || 0)
                                    const total = prixUnitaire * tx.quantity
                                    return (
                                        <tr key={tx.id}>
                                            <td>{new Date(tx.createdAt).toLocaleDateString('fr-FR')}</td>
                                            <td>{tx.productName}</td>
                                            <td>{isAchat ? "Achat" : "Vente"}</td>
                                            <td className='text-right'>{tx.quantity}</td>
                                            <td className='text-right'>{prixUnitaire.toLocaleString()}</td>
                                            <td className='text-right font-bold'>{total.toLocaleString()}</td>
                                        </tr>
                                    )
                                })
                            ) : (
                                <tr>
                                    <td colSpan={6} className='text-center py-6 text-gray-500'>Aucune transaction sur cette période</td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    <div className='flex justify-end gap-8 mt-4 pt-3 border-t-2 border-base-300'>
                        <p className='text-sm'>
                            TOTAL ACHATS : <span className='text-success font-bold'>{totalAchats.toLocaleString()}</span>
                        </p>
                        <p className='text-sm'>
                            TOTAL VENTES : <span className='text-error font-bold'>{totalVentes.toLocaleString()}</span>
                        </p>
                        <p className='text-sm'>
                            PROFIT : <span className='text-primary font-bold'>{totalProfit.toLocaleString()}</span>
                        </p>
                    </div>
                </div>

            </div>
        </Wrapper>
    )
}

export default page