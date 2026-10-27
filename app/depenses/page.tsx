"use client"
import React, { useEffect, useRef, useState } from 'react'
import Wrapper from '../components/Wrapper'
import { useUser } from '@clerk/nextjs'
import type { Depense } from '@prisma/client'
import { createDepense, readDepenses, updateDepense, deleteDepense, getBusinessName } from '../actions'
import { toast } from 'react-toastify'
import { Pencil, Trash, Plus, X, Download, RotateCcw } from 'lucide-react'
import { notifierStock, useStockSync } from '@/lib/stock-sync'

const CATEGORIES = [
  "Loyer", "Salaires", "Transport", "Electricité",
  "Internet", "Fournitures", "Marketing", "Autre"
]

const todayISO = () => new Date().toISOString().split("T")[0]

// "2026-10-13" -> "13/10/2026" (sans passer par Date, donc sans décalage de fuseau)
const formatISO = (iso: string) => {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

type FormState = {
  montant: number
  description: string
  categorie: string
  date: string
}

const emptyForm: FormState = {
  montant: 0,
  description: "",
  categorie: "",
  date: todayISO()
}

const champ = 'flex flex-col gap-1'
const libelle = 'text-sm font-normal opacity-70'

const DepensesPage = () => {
  const { user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress as string

  const [businessName, setBusinessName] = useState<string>("ASSURANCE.COM")
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [formData, setFormData] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [filterCategorie, setFilterCategorie] = useState("")
  const [dateDebut, setDateDebut] = useState(todayISO())
  const [dateFin, setDateFin] = useState(todayISO())

  const pdfContentRef = useRef<HTMLDivElement>(null)
  const [isExporting, setIsExporting] = useState(false)

  const fetchDepenses = async () => {
    try {
      if (email) {
        const data = await readDepenses(email)
        if (data) setDepenses(data)
      }
    } catch (error) {
      console.error(error)
    }
  }

  const loadBusinessName = async () => {
    if (!email) return
    try {
      const nom = await getBusinessName(email)
      if (nom) setBusinessName(nom)
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    if (!email) return
    fetchDepenses()
    loadBusinessName()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email])

  // Rechargement automatique : une dépense ajoutée depuis un autre appareil ou un autre onglet apparaît toute seule
  useStockSync(fetchDepenses)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === "montant" ? Number(value) : value
    }))
  }

  const handleSubmit = async () => {
    if (isSaving) return
    if (!formData.montant || !formData.description.trim() || !formData.categorie || !formData.date) {
      toast.error("Veuillez remplir tous les champs.")
      return
    }
    if (formData.montant <= 0) {
      toast.error("Le montant doit être supérieur à 0.")
      return
    }
    setIsSaving(true)
    try {
      if (editingId) {
        await updateDepense(editingId, formData, email)
        toast.success("Dépense modifiée avec succès")
      } else {
        await createDepense(formData, email)
        toast.success("Dépense ajoutée avec succès")
      }
      setFormData(emptyForm)
      setEditingId(null)
      setShowModal(false)
      // Met à jour cette page, l'accueil (total des dépenses), la centralisation...
      notifierStock()
    } catch (error) {
      console.error(error)
      toast.error("Une erreur s'est produite")
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (depense: Depense) => {
    setFormData({
      montant: depense.montant,
      description: depense.description,
      categorie: depense.categorie,
      date: new Date(depense.date).toISOString().split("T")[0]
    })
    setEditingId(depense.id)
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Confirmer la suppression ?")) return
    try {
      await deleteDepense(id, email)
      toast.success("Dépense supprimée")
      notifierStock()
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors de la suppression")
    }
  }

  const resetFiltres = () => {
    setFilterCategorie("")
    setDateDebut(todayISO())
    setDateFin(todayISO())
  }

  // Bornes en UTC, jour de fin inclus en entier (jusqu'à 23:59:59)
  const debut = dateDebut ? new Date(`${dateDebut}T00:00:00.000Z`) : null
  const fin = dateFin ? new Date(`${dateFin}T23:59:59.999Z`) : null

  const filtered = depenses.filter(d => {
    const date = new Date(d.date)
    const matchCategorie = filterCategorie ? d.categorie === filterCategorie : true
    const matchDebut = debut ? date >= debut : true
    const matchFin = fin ? date <= fin : true
    return matchCategorie && matchDebut && matchFin
  })

  const total = filtered.reduce((sum, d) => sum + d.montant, 0)

  const titrePdfListe = filterCategorie
    ? `LISTE DES DEPENSES/${filterCategorie}`
    : "LISTE DE TOUTES LES DEPENSES"

  const handleExportPDF = async () => {
    if (!pdfContentRef.current) return
    if (dateDebut && dateFin && dateDebut > dateFin) {
      toast.error("La date de début est après la date de fin.")
      return
    }
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

      pdf.save(`depenses_${dateDebut}_au_${dateFin}.pdf`)
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

        {/* En-tête */}
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold leading-tight md:text-3xl'>Dépenses</h1>
            <p className='text-sm font-normal opacity-60'>Tout ce que l&apos;entreprise a dépensé, par catégorie et par période</p>
          </div>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              onClick={handleExportPDF}
              disabled={isExporting}
              className='btn btn-outline btn-sm md:btn-md'
            >
              <Download className='h-4 w-4' />
              {isExporting ? "Génération du PDF..." : "Télécharger le PDF"}
            </button>
            <button
              type='button'
              className='btn btn-primary btn-sm md:btn-md'
              onClick={() => { setFormData({ ...emptyForm, date: todayISO() }); setEditingId(null); setShowModal(true) }}
            >
              <Plus className='h-4 w-4' />
              Ajouter
            </button>
          </div>
        </div>

        {/* Total de la sélection */}
        <section className='rounded-2xl border border-base-300 bg-base-100 p-4 md:p-5'>
          <p className='text-sm font-normal opacity-70'>
            Total des dépenses{filterCategorie ? `, catégorie ${filterCategorie}` : ''}
          </p>
          <p className='text-3xl font-bold tabular-nums text-error md:text-4xl'>
            {total.toLocaleString()}{' '}
            <span className='text-base font-medium opacity-60'>FBU</span>
          </p>
          <p className='text-xs font-normal opacity-60'>
            {filtered.length} dépense{filtered.length > 1 ? 's' : ''} du {formatISO(dateDebut)} au {formatISO(dateFin)}
          </p>
        </section>

        {/* Filtres : sur téléphone, Du, Au et l'icône de réinitialisation sont sur la même ligne */}
        <section className='grid grid-cols-[1fr_1fr_auto] items-end gap-3 rounded-2xl border border-base-300 bg-base-100 p-3 md:grid-cols-[2fr_1fr_1fr_auto] md:p-4'>
          <label className={`${champ} col-span-3 md:col-span-1`}>
            <span className={libelle}>Catégorie</span>
            <select
              className='select select-bordered w-full'
              value={filterCategorie}
              onChange={(e) => setFilterCategorie(e.target.value)}
            >
              <option value="">Toutes les catégories</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>

          <label className={`${champ} min-w-0`}>
            <span className={libelle}>Du</span>
            <input
              type="date"
              className='input input-bordered w-full min-w-0'
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
            />
          </label>

          <label className={`${champ} min-w-0`}>
            <span className={libelle}>Au</span>
            <input
              type="date"
              className='input input-bordered w-full min-w-0'
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
            />
          </label>

          <button
            type='button'
            aria-label="Réinitialiser les filtres"
            title="Réinitialiser"
            className='mb-3 flex items-center justify-center gap-2 text-primary transition-opacity hover:opacity-70 md:mb-0 md:h-12 md:px-3 md:font-semibold'
            onClick={resetFiltres}
          >
            <RotateCcw className='h-5 w-5' />
            <span className='hidden md:inline'>Réinitialiser</span>
          </button>
        </section>

        {/* Liste des dépenses */}
        {filtered.length > 0 ? (
          <div className='divide-y divide-base-300 rounded-2xl border border-base-300 bg-base-100 px-4'>
            {filtered.map((depense) => (
              <div key={depense.id} className='flex items-center gap-3 py-3'>
                <div className='min-w-0 flex-1'>
                  <p className='break-words font-semibold leading-tight'>{depense.description}</p>
                  <p className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal opacity-70'>
                    <span className='badge badge-outline badge-sm'>{depense.categorie}</span>
                    <span>{new Date(depense.date).toLocaleDateString("fr-FR")}</span>
                  </p>
                </div>
                <p className='shrink-0 text-base font-bold tabular-nums text-error md:text-lg'>
                  {depense.montant.toLocaleString()}
                </p>
                <div className='flex shrink-0 items-center'>
                  <button
                    type='button'
                    className='btn btn-ghost btn-sm btn-circle'
                    aria-label="Modifier la dépense"
                    onClick={() => handleEdit(depense)}
                  >
                    <Pencil className='h-4 w-4' />
                  </button>
                  <button
                    type='button'
                    className='btn btn-ghost btn-sm btn-circle text-error'
                    aria-label="Supprimer la dépense"
                    onClick={() => handleDelete(depense.id)}
                  >
                    <Trash className='h-4 w-4' />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className='rounded-2xl border border-dashed border-base-300 px-4 py-10 text-center text-sm font-normal opacity-70'>
            Aucune dépense pour ces filtres. Élargissez les dates ou choisissez « Toutes les catégories ».
          </div>
        )}

        {/* BLOC CACHÉ — contenu exact du PDF exporté */}
        <div
          ref={pdfContentRef}
          style={{ position: 'fixed', top: 0, left: '-9999px', width: '800px' }}
          className='bg-white p-6'
        >
          <h1 className='text-2xl font-black text-left mb-1'>{businessName}</h1>
          <h2 className='text-base font-bold text-left mb-4'>HISTORIQUE DES DEPENSES</h2>

          <div className='flex items-center justify-between mb-3'>
            <h3 className='text-sm font-bold text-left'>
              {titrePdfListe} DU {formatISO(dateDebut)} AU {formatISO(dateFin)}
            </h3>
          </div>

          <table className='table table-sm w-full'>
            <thead>
              <tr className='bg-success text-white'>
                <th className='text-white'>Date</th>
                <th className='text-white'>Description</th>
                <th className='text-white'>Catégorie</th>
                <th className='text-white text-right'>Montant</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map((depense) => (
                  <tr key={depense.id}>
                    <td>{new Date(depense.date).toLocaleDateString('fr-FR')}</td>
                    <td>{depense.description}</td>
                    <td>{depense.categorie}</td>
                    <td className='text-right font-bold'>{depense.montant.toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className='text-center py-6 text-gray-500'>Aucune dépense sur cette période</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className='flex justify-end mt-4 pt-3 border-t-2 border-base-300'>
            <p className='text-sm'>
              TOTAL : <span className='text-primary font-bold'>{total.toLocaleString()}</span>
            </p>
          </div>
        </div>

        {/* Fenêtre : nouvelle dépense */}
        {showModal && (
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
            <div className='w-full max-w-md space-y-4 rounded-3xl bg-base-100 p-6'>
              <div className='flex items-center justify-between'>
                <h2 className='text-xl font-bold'>
                  {editingId ? "Modifier la dépense" : "Nouvelle dépense"}
                </h2>
                <button type='button' aria-label="Fermer" className='btn btn-ghost btn-sm btn-circle' onClick={() => setShowModal(false)}>
                  <X className='h-4 w-4' />
                </button>
              </div>
              <label className={champ}>
                <span className={libelle}>Montant</span>
                <input
                  type="number"
                  inputMode="numeric"
                  name="montant"
                  min={0}
                  placeholder="0"
                  className='input input-bordered w-full'
                  value={formData.montant === 0 ? "" : formData.montant}
                  onChange={handleChange}
                />
              </label>
              <label className={champ}>
                <span className={libelle}>Description</span>
                <input
                  type="text"
                  name="description"
                  className='input input-bordered w-full'
                  value={formData.description}
                  onChange={handleChange}
                />
              </label>
              <label className={champ}>
                <span className={libelle}>Catégorie</span>
                <select
                  name="categorie"
                  className='select select-bordered w-full'
                  value={formData.categorie}
                  onChange={handleChange}
                >
                  <option value="">Sélectionner une catégorie</option>
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>
              <label className={champ}>
                <span className={libelle}>Date</span>
                <input
                  type="date"
                  name="date"
                  className='input input-bordered w-full'
                  value={formData.date}
                  onChange={handleChange}
                />
              </label>
              <div className='flex justify-end gap-3'>
                <button type='button' className='btn btn-ghost' onClick={() => setShowModal(false)}>Annuler</button>
                <button type='button' className='btn btn-primary' onClick={handleSubmit} disabled={isSaving}>
                  {isSaving ? "..." : editingId ? "Modifier" : "Ajouter"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </Wrapper>
  )
}

export default DepensesPage