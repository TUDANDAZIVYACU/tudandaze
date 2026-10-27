"use client";
import React, { useEffect, useRef, useState } from 'react'
import Wrapper from '../components/Wrapper'
import { useUser } from '@clerk/nextjs'
import { FormDataType, Product } from '@/type'
import { createProduct, deleteProduct, readProductsWithRealQuantity, checkProductNameExists, getBusinessName } from '../actions'
import { getProduitsVendus } from '../actions-transactions'
import { toast } from 'react-toastify'
import ProductComponent from '../components/ProductComponent'
import EmptyState from '../components/EmptyState'
import { compresserImage, estPhoto, typeMimePhoto, TAILLE_MAX_PHOTO } from '@/lib/photo'
import { envoyerPhoto } from '@/lib/upload-photo'
import { Download } from 'lucide-react'
import { notifierStock, useStockSync } from '@/lib/stock-sync'

// Date du jour en heure locale ("2026-10-13"), et non en UTC
const todayISO = () => new Date().toLocaleDateString("en-CA")

const CreerProduitPage = () => {
  const { user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress as string

  const [products, setProducts] = useState<Product[]>([])
  const [produitsVendus, setProduitsVendus] = useState<Set<string>>(new Set())
  const [nomEntreprise, setNomEntreprise] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const pdfContentRef = useRef<HTMLDivElement>(null)
  const [pieceFichier, setPieceFichier] = useState<File | null>(null)
  const [piecePreview, setPiecePreview] = useState<string>("")
  const [apercuImpossible, setApercuImpossible] = useState(false)
  const pieceInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState<FormDataType>({
    name: "",
    prixAchat: 0,
    prixVente: 0,
    price: 0,
    unit: "",
    imageUrl: "",
    dateCreation: todayISO()
  })

  // Produit déjà existant (même nom) : recalculé à chaque saisie, donc le blocage disparaît dès que le nom change
  const nomSaisi = formData.name?.trim().toLowerCase()
  const duplicateProduct: Product | null = nomSaisi
    ? products.find(p => p.name.trim().toLowerCase() === nomSaisi) ?? null
    : null

  const prixAchatTotal = Number(formData.prixAchat) * Number(formData.price || 1)
  const prixVenteTotal = Number(formData.prixVente) * Number(formData.price || 1)
  const margeTotal = prixVenteTotal - prixAchatTotal

  // Valeur totale du stock (prixVente × quantité réelle de chaque produit)
  const valeurTotaleStock = products.reduce((acc, p) => acc + (p.prixVente ?? 0) * (p.quantity ?? 0), 0)

  // Marge totale = somme des (prix de vente - prix d'achat) × quantité en stock, pour tous les produits
  const margeTotaleStock = products.reduce((acc, p) => acc + ((p.prixVente ?? 0) - (p.prixAchat ?? 0)) * (p.quantity ?? 0), 0)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    // Dès que le prix d'achat, le prix de vente ou la quantité est renseigné,
    // on prévient si le produit existe déjà (par nom)
    const champsDeclencheurs = ["prixAchat", "prixVente", "price"]
    if (champsDeclencheurs.includes(name) && value && duplicateProduct) {
      toast.warn(`Le produit "${duplicateProduct.name}" existe déjà (stock actuel : ${duplicateProduct.quantity ?? 0}). Utilisez plutôt "APROVISIONNEMENT" pour l'ajouter au stock existant.`)
    }
  }

  // Produits + liste des produits déjà vendus, chargés ensemble pour que le bouton SUPPRIMER n'apparaisse pas à tort
  const fetchProducts = async (userEmail: string) => {
    try {
      const [data, vendus] = await Promise.all([
        readProductsWithRealQuantity(userEmail),
        getProduitsVendus(userEmail)
      ])
      if (data) setProducts(data)
      setProduitsVendus(new Set(vendus))
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    const userEmail = user?.primaryEmailAddress?.emailAddress
    if (!userEmail) return
    fetchProducts(userEmail)
  }, [user])

  // Nom de l'entreprise, affiché en tête du PDF
  useEffect(() => {
    const identifiant = user?.primaryEmailAddress?.emailAddress ?? user?.primaryPhoneNumber?.phoneNumber
    if (!identifiant) return
    getBusinessName(identifiant)
      .then((nom) => setNomEntreprise(nom))
      .catch((error) => console.error(error))
  }, [user])

  // Rechargement automatique après un approvisionnement, une vente, une annulation...
  // faits depuis le menu, une autre page, un autre onglet ou un autre appareil (toutes les 30 s)
  useStockSync(() => {
    const userEmail = user?.primaryEmailAddress?.emailAddress
    if (userEmail) fetchProducts(userEmail)
  })

  const viderPiece = () => {
    if (piecePreview) URL.revokeObjectURL(piecePreview)
    setPieceFichier(null)
    setPiecePreview("")
    setApercuImpossible(false)
    if (pieceInputRef.current) pieceInputRef.current.value = ""
  }

  const choisirPiece = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0] ?? null
    if (piecePreview) URL.revokeObjectURL(piecePreview)
    setApercuImpossible(false)

    if (!fichier) {
      setPieceFichier(null)
      setPiecePreview("")
      return
    }
    if (!estPhoto(fichier)) {
      toast.error("Veuillez choisir une photo (JPEG, PNG, HEIC, WebP...).")
      viderPiece()
      return
    }
    if (fichier.size > TAILLE_MAX_PHOTO) {
      toast.error("La photo est trop lourde (15 Mo maximum).")
      viderPiece()
      return
    }
    setPieceFichier(fichier)
    setPiecePreview(URL.createObjectURL(fichier))
  }

  const handleSubmit = async () => {
    if (!email) {
      toast.error("Utilisateur non identifié. Réessayez dans un instant.")
      return
    }

    const champsManquants: string[] = []
    if (!formData.name || !formData.name.trim()) champsManquants.push("Nom du produit")
    if (!formData.prixAchat || Number(formData.prixAchat) <= 0) champsManquants.push("Prix d'achat")
    if (!formData.prixVente || Number(formData.prixVente) <= 0) champsManquants.push("Prix de vente")
    if (formData.price === undefined || formData.price === null || Number(formData.price) <= 0) champsManquants.push("Quantité initiale")
    if (!formData.unit) champsManquants.push("Unité")
    if (!formData.dateCreation) champsManquants.push("Date de création")

    if (champsManquants.length > 0) {
      toast.error(`Champs manquants ou invalides (doivent être supérieurs à 0) : ${champsManquants.join(", ")}`)
      return
    }

    // Garde-fou final : on revérifie juste avant l'envoi, au cas où
    if (duplicateProduct) {
      toast.error(`Le produit "${duplicateProduct.name}" existe déjà. Utilisez "APROVISIONNEMENT" pour ajouter du stock.`)
      return
    }

    setIsSubmitting(true)
    try {
      // Vérifie qu'aucun produit du même nom n'existe déjà
      const alreadyExists = await checkProductNameExists(formData.name, email)
      if (alreadyExists) {
        toast.error(`Un produit nommé "${formData.name}" existe déjà dans le stock.`)
        return
      }

      // Photo de la pièce justifiant le stock initial (facultative) : envoyée juste avant la création
      let pieceUrl: string | undefined
      if (pieceFichier) {
        try {
          const fichier = await compresserImage(pieceFichier)
          const nomSur = fichier.name.replace(/[^a-zA-Z0-9._-]/g, "_")
          const blob = await envoyerPhoto(
            `pieces-stock/${Date.now()}-${nomSur}`,
            fichier,
            typeMimePhoto(fichier)
          )
          pieceUrl = blob.url
        } catch (error: any) {
          console.error(error)
          toast.error(`Impossible d'envoyer la photo de la pièce (${error?.message || "erreur inconnue"}). Réessayez ou retirez la photo.`)
          return
        }
      }

      await createProduct({
        ...formData,
        prixAchat: Number(formData.prixAchat),
        prixVente: Number(formData.prixVente),
        pieceUrl,
      }, email)

      toast.success("Produit créé avec succès")

      // Informe toute l'application (cette page, observation, transactions, menu d'approvisionnement...)
      notifierStock()

      setFormData({ name: "", prixAchat: 0, prixVente: 0, price: 0, unit: "", imageUrl: "", dateCreation: todayISO() })
      viderPiece()
    } catch (error: any) {
      console.log(error)
      // Affiche le vrai message (ex: coupure de connexion à la base de données)
      // plutôt qu'un message générique, pour savoir exactement quoi corriger.
      toast.error(error?.message || "Il y a une erreur")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteProduct = async (product: Product) => {
    const confirmDelete = confirm("Voulez-vous vraiment supprimer ce produit ?")
    if (!confirmDelete) return
    try {
      await deleteProduct(product.id, email)
      toast.success("Produit supprimé avec succès")

      // Informe toute l'application qu'un produit a été supprimé
      notifierStock()
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message || "Erreur lors de la suppression")
    }
  }

  const filteredProducts = products
    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(p => searchQuery.trim() !== "" || (p.quantity ?? 0) > 0)
    .slice(0, 1000)

  const inStockProducts = products.filter(p => (p.quantity ?? 0) > 0)

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

      pdf.save(`liste_produits_stock_${todayISO()}.pdf`)
      toast.success("PDF généré avec succès")
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors de la génération du PDF")
    } finally {
      setIsExporting(false)
    }
  }

  const champ = 'flex flex-col gap-1'
  const libelle = 'text-sm font-normal opacity-70'

  return (
    <Wrapper>
      <div className='space-y-4'>

        {/* En-tête */}
        <div>
          <h1 className='text-2xl font-bold leading-tight md:text-3xl'>Produits</h1>
          <p className='text-sm font-normal opacity-60'>Créez un produit, puis suivez ce qu&apos;il y a en stock</p>
        </div>

        <div className='grid gap-4 lg:grid-cols-12'>

          {/* GAUCHE : formulaire */}
          <section className='rounded-3xl border border-base-300 bg-base-100 p-5 md:p-6 lg:col-span-5'>
            <h2 className='text-lg font-bold'>Nouveau produit</h2>

            <div className='mt-4 space-y-4'>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] lg:grid-cols-1 xl:grid-cols-[1fr_auto]'>
                <label className={champ}>
                  <span className={libelle}>Nom du produit *</span>
                  <input type="text" name="name" placeholder="Ex. Coca-Cola 33 cl"
                    className='input input-bordered w-full' value={formData.name} onChange={handleChange} />
                </label>
                <label className={champ}>
                  <span className={libelle}>Date</span>
                  <input type="date" name="dateCreation"
                    className='input input-bordered w-full'
                    value={formData.dateCreation}
                    onChange={handleChange} />
                </label>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <label className={champ}>
                  <span className={libelle}>Prix d&apos;achat</span>
                  <input type="number" inputMode="numeric" name="prixAchat" placeholder="0"
                    className='input input-bordered w-full'
                    value={formData.prixAchat === 0 ? "" : formData.prixAchat}
                    onChange={handleChange} />
                </label>
                <label className={champ}>
                  <span className={libelle}>Prix de vente</span>
                  <input type="number" inputMode="numeric" name="prixVente" placeholder="0"
                    className='input input-bordered w-full'
                    value={formData.prixVente === 0 ? "" : formData.prixVente}
                    onChange={handleChange} />
                </label>
                <label className={champ}>
                  <span className={libelle}>Quantité initiale</span>
                  <input type="number" inputMode="decimal" name="price" placeholder="0"
                    className='input input-bordered w-full'
                    value={formData.price === 0 ? "" : formData.price}
                    onChange={handleChange} />
                </label>
                <label className={champ}>
                  <span className={libelle}>Unité</span>
                  <select aria-label="Unité"
                    className='select select-bordered w-full'
                    value={formData.unit}
                    onChange={handleChange}
                    name='unit'
                  >
                    <option value="">Choisir</option>
                    <option value="Pcs">Pièces</option>
                    <option value="G">Gramme</option>
                    <option value="Kg">Kilogramme</option>
                    <option value="Bout">Bouteille</option>
                    <option value="L">Litre</option>
                    <option value="M">Mètre</option>
                    <option value="Cm">Centimètre</option>
                    <option value="H">Heure</option>
                  </select>
                </label>
              </div>

              {/* Totaux du stock initial */}
              <div className='grid grid-cols-3 divide-x divide-base-300 rounded-2xl border border-base-300'>
                <div className='p-3'>
                  <p className='text-xs font-normal opacity-70'>Achat total</p>
                  <p className='font-bold tabular-nums text-warning'>{prixAchatTotal.toLocaleString()}</p>
                </div>
                <div className='p-3'>
                  <p className='text-xs font-normal opacity-70'>Vente totale</p>
                  <p className='font-bold tabular-nums'>{prixVenteTotal.toLocaleString()}</p>
                </div>
                <div className='p-3'>
                  <p className='text-xs font-normal opacity-70'>Marge</p>
                  <p className={`font-bold tabular-nums ${margeTotal >= 0 ? 'text-success' : 'text-error'}`}>
                    {margeTotal.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Photo d'une pièce justifiant le stock initial (facultative) : tout type de photo */}
              <div className={champ}>
                <span className={libelle}>Pièce justifiant le stock initial (photo, facultatif)</span>
                <input
                  ref={pieceInputRef}
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={choisirPiece}
                  className='file-input file-input-bordered w-full'
                />
                {pieceFichier && (
                  <div className='mt-2 flex items-start gap-3'>
                    {apercuImpossible ? (
                      <p className='break-all text-xs font-normal opacity-70'>
                        Photo sélectionnée : {pieceFichier.name} (aperçu indisponible pour ce format, elle sera bien enregistrée)
                      </p>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={piecePreview}
                        alt="Aperçu de la pièce justificative"
                        onError={() => setApercuImpossible(true)}
                        className='h-24 w-auto rounded-xl border border-base-300 object-contain'
                      />
                    )}
                    <button
                      type="button"
                      className='btn btn-xs btn-ghost text-error'
                      onClick={viderPiece}
                    >
                      Retirer la photo
                    </button>
                  </div>
                )}
              </div>

              {duplicateProduct && (
                <div className='rounded-2xl border border-warning bg-warning/10 p-3 text-sm font-semibold'>
                  &quot;{duplicateProduct.name}&quot; existe déjà (stock actuel : {duplicateProduct.quantity ?? 0}).
                  Utilisez plutôt « Approvisionnement » pour ajouter du stock à ce produit.
                </div>
              )}

              <button onClick={handleSubmit} disabled={isSubmitting || !!duplicateProduct} className='btn btn-primary h-12 w-full text-base'>
                {isSubmitting ? "Création en cours..." : "Créer le produit"}
              </button>
            </div>
          </section>

          {/* DROITE : produits en stock */}
          <section className='rounded-3xl border border-base-300 bg-base-100 p-5 md:p-6 lg:col-span-7'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <h2 className='text-lg font-bold'>Produits en stock</h2>
                <p className='text-sm font-normal opacity-60'>
                  {inStockProducts.length} produit{inStockProducts.length > 1 ? 's' : ''}
                </p>
              </div>
              <button
                type='button'
                onClick={handleExportPDF}
                disabled={isExporting || inStockProducts.length === 0}
                className='btn btn-outline btn-sm'
              >
                <Download className='h-4 w-4' />
                {isExporting ? "Génération du PDF..." : "Télécharger le PDF"}
              </button>
            </div>

            <div className='mt-4 grid grid-cols-2 divide-x divide-base-300 rounded-2xl border border-base-300'>
              <div className='p-3 md:p-4'>
                <p className='text-xs font-normal opacity-70 md:text-sm'>Valeur du stock</p>
                <p className='text-lg font-bold tabular-nums text-success md:text-2xl'>{valeurTotaleStock.toLocaleString()}</p>
              </div>
              <div className='p-3 md:p-4'>
                <p className='text-xs font-normal opacity-70 md:text-sm'>Marge totale</p>
                <p className={`text-lg font-bold tabular-nums md:text-2xl ${margeTotaleStock >= 0 ? 'text-success' : 'text-error'}`}>
                  {margeTotaleStock.toLocaleString()}
                </p>
              </div>
            </div>

            <input type="text" placeholder='Rechercher un produit...'
              aria-label='Rechercher un produit'
              className='input input-bordered mt-4 w-full'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div className='mt-4 space-y-3'>
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => (
                  <ProductComponent
                    key={product.id}
                    add={false}
                    product={product}
                    handleAddToCart={() => {}}
                    showDetails={true}
                    onDelete={handleDeleteProduct}
                    dejaVendu={produitsVendus.has(product.id)}
                  />
                ))
              ) : (
                <EmptyState message='Aucun produit disponible' IconComponent='PackageSearch' />
              )}
            </div>
          </section>
        </div>

        {/* BLOC CACHÉ — contenu exact du PDF exporté */}
        <div
          ref={pdfContentRef}
          style={{ position: 'fixed', top: 0, left: '-9999px', width: '800px' }}
          className='bg-white p-6'
        >
          {nomEntreprise && (
            <h2 className='text-2xl font-black text-left mb-1'>{nomEntreprise}</h2>
          )}
          <h1 className='text-2xl font-black text-left mb-1'>Liste des produits du stock</h1>
          <div className='flex items-center justify-between mb-4'>
            <p className='text-sm'>Date d'export : {new Date().toLocaleDateString('fr-FR')}</p>
            <div className='text-right'>
              <p className='text-sm'>
                VALEUR DU STOCK : <span className='text-success font-bold'>{valeurTotaleStock.toLocaleString()}</span>
              </p>
              <p className='text-sm'>
                MARGE TOTALE : <span className={`font-bold ${margeTotaleStock >= 0 ? 'text-success' : 'text-error'}`}>
                  {margeTotaleStock.toLocaleString()}
                </span>
              </p>
            </div>
          </div>

          <table className='table table-sm w-full'>
            <thead>
              <tr className='bg-success text-white'>
                <th className='text-white'>Produit</th>
                <th className='text-white text-right'>Qté</th>
                <th className='text-white text-right'>P.A Unit</th>
                <th className='text-white text-right'>P.V Unit</th>
                <th className='text-white text-right'>P.V Total</th>
                <th className='text-white text-right'>Marge Tot</th>
              </tr>
            </thead>
            {/* Lignes serrées : padding vertical réduit */}
            <tbody className='[&_td]:py-0.5 [&_td]:leading-tight'>
              {inStockProducts.length > 0 ? (
                inStockProducts.map((product) => {
                  const pvUnit = product.prixVente ?? product.price ?? 0
                  const paUnit = product.prixAchat ?? 0
                  const qte = product.quantity ?? 0
                  return (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td className='text-right'>{qte} {product.unit}</td>
                      <td className='text-right'>{paUnit.toLocaleString()}</td>
                      <td className='text-right'>{pvUnit.toLocaleString()}</td>
                      <td className='text-right font-bold'>{(pvUnit * qte).toLocaleString()}</td>
                      <td className='text-right font-bold'>{((pvUnit - paUnit) * qte).toLocaleString()}</td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className='text-center py-6 text-gray-500'>Aucun produit en stock</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className='flex justify-end gap-8 mt-4 pt-3 border-t-2 border-base-300'>
            <p className='text-sm'>
              VALEUR DU STOCK : <span className='text-success font-bold'>{valeurTotaleStock.toLocaleString()}</span>
            </p>
            <p className='text-sm'>
              MARGE TOTALE : <span className='text-primary font-bold'>{margeTotaleStock.toLocaleString()}</span>
            </p>
          </div>
        </div>

      </div>
    </Wrapper>
  )
}

export default CreerProduitPage