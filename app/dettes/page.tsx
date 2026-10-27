"use client"
import React, { useEffect, useRef, useState } from 'react'
import Wrapper from '../components/Wrapper'
import { useUser } from '@clerk/nextjs'
import { createDette, readDettes, updateDette, deleteDette, addPaiement, deletePaiement, getBusinessName } from '../actions'
import { toast } from 'react-toastify'
import { Pencil, Trash, Plus, X, CreditCard, ChevronDown, ChevronUp, RefreshCw, RotateCcw, Download } from 'lucide-react'
import { notifierStock, useStockSync } from '@/lib/stock-sync'

type Paiement = {
  id: string
  montant: number
  date: Date
  note: string | null
}

type Dette = {
  id: string
  debiteur: string
  montant: number
  montantPaye: number
  description: string
  dateEcheance: Date | null
  statut: string
  paiements: Paiement[]
  createdAt: Date
}

// Date du jour en heure locale ("2026-10-13"), et non en UTC
const todayISO = () => new Date().toLocaleDateString("en-CA")

const getEmptyDette = () => ({
  debiteur: "",
  montant: 0,
  description: "",
  dateEcheance: todayISO()
})

const getEmptyPaiement = () => ({
  montant: 0,
  note: "",
  date: todayISO()
})

const STATUTS = ["en_cours", "partiellement_paye", "solde"]

const LIBELLES_STATUT: Record<string, string> = {
  en_cours: "En cours",
  partiellement_paye: "Partielle",
  solde: "Soldée"
}

const statutBadge = (statut: string) => {
  if (statut === "solde") return <span className='badge badge-success badge-soft font-bold'>Soldée</span>
  if (statut === "partiellement_paye") return <span className='badge badge-warning badge-soft font-bold'>Partielle</span>
  return <span className='badge badge-error badge-soft font-bold'>En cours</span>
}

const champ = 'flex flex-col gap-1'
const libelle = 'text-sm font-normal opacity-70'

const DettesPage = () => {
  const { user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress as string

  const [dettes, setDettes] = useState<Dette[]>([])
  const [nomEntreprise, setNomEntreprise] = useState("")
  const [formData, setFormData] = useState(getEmptyDette)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showDetteModal, setShowDetteModal] = useState(false)
  const [showPaiementModal, setShowPaiementModal] = useState(false)
  const [selectedDetteId, setSelectedDetteId] = useState<string | null>(null)
  const [paiementForm, setPaiementForm] = useState(getEmptyPaiement)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterStatut, setFilterStatut] = useState("")
  const [dateDebut, setDateDebut] = useState(todayISO)
  const [dateFin, setDateFin] = useState(todayISO)
  // Filtre par date actif dès le départ : filtre automatiquement sur la date du jour
  const [dateFilterActive, setDateFilterActive] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const pdfContentRef = useRef<HTMLDivElement>(null)

  const fetchDettes = async () => {
    try {
      if (email) {
        const data = await readDettes(email)
        if (data) setDettes(data as Dette[])
      }
    } catch (error) {
      console.error(error)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchDettes()
    setRefreshing(false)
  }

  useEffect(() => {
    if (!email) return
    fetchDettes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email])

  // Nom de l'entreprise, affiché en tête du PDF
  useEffect(() => {
    const identifiant = user?.primaryEmailAddress?.emailAddress ?? user?.primaryPhoneNumber?.phoneNumber
    if (!identifiant) return
    getBusinessName(identifiant)
      .then((nom) => setNomEntreprise(nom))
      .catch((error) => console.error(error))
  }, [user])

  // Rechargement automatique : une vente avec dette, une annulation de vente, etc.
  // faites ailleurs (autre page, menu, autre onglet) mettent la liste à jour toute seule
  useStockSync(fetchDettes)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmitDette = async () => {
    if (isSaving) return
    if (!formData.debiteur.trim() || !formData.montant || !formData.description.trim()) {
      toast.error("Veuillez remplir tous les champs obligatoires.")
      return
    }
    if (Number(formData.montant) <= 0) {
      toast.error("Le montant doit être supérieur à 0.")
      return
    }
    setIsSaving(true)
    try {
      if (editingId) {
        await updateDette(editingId, { ...formData, montant: Number(formData.montant) }, email)
        toast.success("Dette modifiée avec succès")
      } else {
        await createDette({ ...formData, montant: Number(formData.montant) }, email)
        toast.success("Dette ajoutée avec succès")
      }
      setFormData(getEmptyDette())
      setEditingId(null)
      setShowDetteModal(false)
      // Met à jour cette page, l'accueil (total des dettes), la centralisation...
      notifierStock()
    } catch (error) {
      console.error(error)
      toast.error("Une erreur s'est produite")
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (dette: Dette) => {
    setFormData({
      debiteur: dette.debiteur,
      montant: dette.montant,
      description: dette.description,
      dateEcheance: dette.dateEcheance
        ? new Date(dette.dateEcheance).toISOString().split("T")[0]
        : ""
    })
    setEditingId(dette.id)
    setShowDetteModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Confirmer la suppression ?")) return
    try {
      await deleteDette(id, email)
      toast.success("Dette supprimée")
      notifierStock()
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors de la suppression")
    }
  }

  const ouvrirPaiement = (detteId: string) => {
    setSelectedDetteId(detteId)
    setPaiementForm(getEmptyPaiement())
    setShowPaiementModal(true)
  }

  const handleSubmitPaiement = async () => {
    if (isSaving) return
    if (!paiementForm.montant || !paiementForm.date) {
      toast.error("Veuillez remplir le montant et la date.")
      return
    }
    if (!selectedDetteId) return

    const dette = dettes.find(d => d.id === selectedDetteId)
    if (dette) {
      const restant = dette.montant - dette.montantPaye
      if (Number(paiementForm.montant) > restant) {
        toast.error(`Le paiement dépasse le reste à payer (${restant.toLocaleString()}).`)
        return
      }
    }

    setIsSaving(true)
    try {
      await addPaiement(selectedDetteId, {
        ...paiementForm,
        montant: Number(paiementForm.montant)
      }, email)
      toast.success("Paiement enregistré")
      setPaiementForm(getEmptyPaiement())
      setShowPaiementModal(false)
      setSelectedDetteId(null)
      notifierStock()
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors du paiement")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeletePaiement = async (paiementId: string, detteId: string) => {
    if (!confirm("Supprimer ce paiement ?")) return
    try {
      await deletePaiement(paiementId, detteId, email)
      toast.success("Paiement supprimé")
      notifierStock()
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors de la suppression")
    }
  }

  const resetFiltres = () => {
    setFilterStatut("")
    setDateDebut(todayISO())
    setDateFin(todayISO())
    setDateFilterActive(true)
  }

  const handleDateDebutChange = (value: string) => {
    setDateDebut(value)
    setDateFilterActive(true)
  }

  const handleDateFinChange = (value: string) => {
    setDateFin(value)
    setDateFilterActive(true)
  }

  // Noms uniques des débiteurs ayant au moins une dette non totalement payée
  const debiteursNonPayes = Array.from(
    new Set(
      dettes
        .filter(d => d.statut !== "solde")
        .map(d => d.debiteur)
    )
  ).sort()

  // createdAt contient l'heure : la fin de période doit couvrir toute la journée (heure locale)
  const debut = dateDebut ? new Date(`${dateDebut}T00:00:00`) : null
  const fin = dateFin ? new Date(`${dateFin}T23:59:59.999`) : null

  const filtered = dettes.filter(d => {
    const date = new Date(d.createdAt)

    let matchFilter = true
    if (filterStatut) {
      if (STATUTS.includes(filterStatut)) {
        matchFilter = d.statut === filterStatut
      } else {
        // filterStatut correspond alors à un nom de débiteur
        matchFilter = d.debiteur === filterStatut
      }
    }

    const matchDebut = dateFilterActive && debut ? date >= debut : true
    const matchFin = dateFilterActive && fin ? date <= fin : true
    return matchFilter && matchDebut && matchFin
  })

  const totalDu = filtered.reduce((sum, d) => sum + d.montant, 0)
  const totalPaye = filtered.reduce((sum, d) => sum + d.montantPaye, 0)
  const totalRestant = totalDu - totalPaye

  // Libellé du filtre affiché dans le PDF
  const libelleFiltre = !filterStatut
    ? "Toutes les dettes"
    : STATUTS.includes(filterStatut)
      ? `Dettes : ${LIBELLES_STATUT[filterStatut]}`
      : `Débiteur : ${filterStatut}`

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

      pdf.save(`dettes_${dateDebut}_au_${dateFin}.pdf`)
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
            <h1 className='text-2xl font-bold leading-tight md:text-3xl'>Dettes</h1>
            <p className='text-sm font-normal opacity-60'>Ce que vos clients vous doivent, et ce qu&apos;ils ont déjà payé</p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <button
              type='button'
              className='btn btn-ghost btn-circle btn-sm md:btn-md'
              onClick={handleRefresh}
              disabled={refreshing}
              title="Actualiser"
              aria-label="Actualiser"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type='button'
              onClick={handleExportPDF}
              disabled={isExporting || filtered.length === 0}
              className='btn btn-outline btn-sm md:btn-md'
            >
              <Download className='h-4 w-4' />
              {isExporting ? "Génération du PDF..." : "Télécharger le PDF"}
            </button>
            <button
              type='button'
              className='btn btn-primary btn-sm md:btn-md'
              onClick={() => { setFormData(getEmptyDette()); setEditingId(null); setShowDetteModal(true) }}
            >
              <Plus className='h-4 w-4' />
              Nouvelle dette
            </button>
          </div>
        </div>

        {/* Bilan de la sélection */}
        <section className='grid grid-cols-3 divide-x divide-base-300 rounded-2xl border border-base-300 bg-base-100'>
          <div className='p-3 md:p-5'>
            <p className='text-xs font-normal opacity-70 md:text-sm'>Dettes totales</p>
            <p className='text-lg font-bold tabular-nums md:text-3xl'>{totalDu.toLocaleString()}</p>
          </div>
          <div className='p-3 md:p-5'>
            <p className='text-xs font-normal opacity-70 md:text-sm'>Déjà payé</p>
            <p className='text-lg font-bold tabular-nums text-success md:text-3xl'>{totalPaye.toLocaleString()}</p>
          </div>
          <div className='p-3 md:p-5'>
            <p className='text-xs font-normal opacity-70 md:text-sm'>Reste à payer</p>
            <p className='text-lg font-bold tabular-nums text-error md:text-3xl'>{totalRestant.toLocaleString()}</p>
          </div>
        </section>

        {/* Filtres : sur téléphone, Du, Au et l'icône de réinitialisation sont sur la même ligne */}
        <section className='grid grid-cols-[1fr_1fr_auto] items-end gap-3 rounded-2xl border border-base-300 bg-base-100 p-3 md:grid-cols-[2fr_1fr_1fr_auto] md:p-4'>
          <label className={`${champ} col-span-3 md:col-span-1`}>
            <span className={libelle}>Statut ou débiteur</span>
            <select
              className='select select-bordered w-full'
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value)}
            >
              <option value="">Toutes les dettes</option>
              <option value="en_cours">En cours</option>
              <option value="partiellement_paye">Partiellement payées</option>
              <option value="solde">Soldées</option>
              {debiteursNonPayes.length > 0 && (
                <optgroup label="Débiteurs non payés">
                  {debiteursNonPayes.map((nom) => (
                    <option key={nom} value={nom}>{nom}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <label className={`${champ} min-w-0`}>
            <span className={libelle}>Du</span>
            <input
              type="date"
              className='input input-bordered w-full min-w-0'
              value={dateDebut}
              onChange={(e) => handleDateDebutChange(e.target.value)}
            />
          </label>

          <label className={`${champ} min-w-0`}>
            <span className={libelle}>Au</span>
            <input
              type="date"
              className='input input-bordered w-full min-w-0'
              value={dateFin}
              onChange={(e) => handleDateFinChange(e.target.value)}
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

        {/* Liste des dettes */}
        <section>
          <div className='mb-2 flex items-baseline justify-between gap-3 px-1'>
            <h2 className='font-bold'>Liste des dettes</h2>
            <p className='text-sm font-normal opacity-60'>
              {filtered.length} dette{filtered.length > 1 ? 's' : ''}
            </p>
          </div>

          {filtered.length > 0 ? (
            <div className='divide-y divide-base-300 rounded-2xl border border-base-300 bg-base-100'>
              {filtered.map((dette) => {
                const restant = dette.montant - dette.montantPaye
                const progression = dette.montant > 0
                  ? Math.min((dette.montantPaye / dette.montant) * 100, 100)
                  : 0
                const ouvert = expandedId === dette.id

                return (
                  <article key={dette.id} className='p-4'>
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <h3 className='break-words text-base font-bold leading-tight'>{dette.debiteur}</h3>
                          {statutBadge(dette.statut)}
                        </div>
                        <p className='mt-1 break-words text-sm font-normal opacity-70'>{dette.description}</p>
                        <p className='text-xs font-normal opacity-60'>
                          Du {new Date(dette.createdAt).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                      <div className='shrink-0 text-right'>
                        <p className='text-xs font-normal opacity-60'>Reste à payer</p>
                        <p className={`text-xl font-bold tabular-nums ${restant > 0 ? 'text-error' : 'text-success'}`}>
                          {restant.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className='mt-3'>
                      <progress
                        className='progress progress-success h-2 w-full'
                        value={progression}
                        max={100}
                        aria-label={`${Math.round(progression)} % payé`}
                      />
                      <p className='mt-1 text-xs font-normal tabular-nums opacity-60'>
                        {dette.montantPaye.toLocaleString()} payés sur {dette.montant.toLocaleString()} ({Math.round(progression)} %)
                      </p>
                    </div>

                    <div className='mt-3 flex flex-wrap items-center justify-between gap-2'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <button
                          type='button'
                          className='btn btn-primary btn-sm'
                          disabled={dette.statut === "solde"}
                          onClick={() => ouvrirPaiement(dette.id)}
                        >
                          <CreditCard className='h-4 w-4' />
                          Payer
                        </button>
                        {dette.paiements.length > 0 && (
                          <button
                            type='button'
                            className='btn btn-ghost btn-sm'
                            aria-expanded={ouvert}
                            onClick={() => setExpandedId(ouvert ? null : dette.id)}
                          >
                            {ouvert ? <ChevronUp className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
                            {dette.paiements.length} paiement{dette.paiements.length > 1 ? 's' : ''}
                          </button>
                        )}
                      </div>
                      <div className='flex items-center gap-1'>
                        <button
                          type='button'
                          className='btn btn-ghost btn-sm btn-circle'
                          aria-label="Modifier la dette"
                          onClick={() => handleEdit(dette)}
                        >
                          <Pencil className='h-4 w-4' />
                        </button>
                        <button
                          type='button'
                          className='btn btn-ghost btn-sm btn-circle text-error'
                          aria-label="Supprimer la dette"
                          onClick={() => handleDelete(dette.id)}
                        >
                          <Trash className='h-4 w-4' />
                        </button>
                      </div>
                    </div>

                    {/* Historique des paiements */}
                    {ouvert && dette.paiements.length > 0 && (
                      <ul className='mt-3 divide-y divide-base-300 rounded-xl bg-base-200 px-3'>
                        {dette.paiements.map((p) => (
                          <li key={p.id} className='flex items-center justify-between gap-3 py-2'>
                            <div className='min-w-0'>
                              <p className='font-bold tabular-nums text-success'>{p.montant.toLocaleString()}</p>
                              <p className='text-xs font-normal opacity-60'>
                                {new Date(p.date).toLocaleDateString("fr-FR")}
                                {p.note && `, ${p.note}`}
                              </p>
                            </div>
                            <button
                              type='button'
                              className='btn btn-ghost btn-xs btn-circle text-error'
                              aria-label="Supprimer le paiement"
                              onClick={() => handleDeletePaiement(p.id, dette.id)}
                            >
                              <Trash className='h-3.5 w-3.5' />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                )
              })}
            </div>
          ) : (
            <div className='rounded-2xl border border-dashed border-base-300 px-4 py-10 text-center text-sm font-normal opacity-70'>
              Aucune dette pour ces filtres. Élargissez les dates ou choisissez « Toutes les dettes ».
            </div>
          )}
        </section>

        {/* Fenêtre : nouvelle dette */}
        {showDetteModal && (
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
            <div className='w-full max-w-md space-y-4 rounded-3xl bg-base-100 p-6'>
              <div className='flex items-center justify-between'>
                <h2 className='text-xl font-bold'>{editingId ? "Modifier la dette" : "Nouvelle dette"}</h2>
                <button type='button' aria-label="Fermer" className='btn btn-ghost btn-sm btn-circle' onClick={() => setShowDetteModal(false)}>
                  <X className='h-4 w-4' />
                </button>
              </div>
              <label className={champ}>
                <span className={libelle}>Nom du débiteur *</span>
                <input type="text" name="debiteur" className='input input-bordered w-full'
                  value={formData.debiteur} onChange={handleChange} />
              </label>
              <label className={champ}>
                <span className={libelle}>Montant total (BIF) *</span>
                <input type="number" inputMode="numeric" name="montant" min={0} placeholder="0"
                  className='input input-bordered w-full'
                  value={formData.montant === 0 ? "" : formData.montant}
                  onChange={handleChange} />
              </label>
              <label className={champ}>
                <span className={libelle}>Description *</span>
                <input type="text" name="description" className='input input-bordered w-full'
                  value={formData.description} onChange={handleChange} />
              </label>
              <label className={champ}>
                <span className={libelle}>Date d&apos;échéance (facultatif)</span>
                <input type="date" name="dateEcheance" className='input input-bordered w-full'
                  value={formData.dateEcheance} onChange={handleChange} />
              </label>
              <div className='flex justify-end gap-3'>
                <button type='button' className='btn btn-ghost' onClick={() => setShowDetteModal(false)}>Annuler</button>
                <button type='button' className='btn btn-primary' onClick={handleSubmitDette} disabled={isSaving}>
                  {isSaving ? "..." : editingId ? "Modifier" : "Ajouter"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fenêtre : paiement */}
        {showPaiementModal && (
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
            <div className='w-full max-w-md space-y-4 rounded-3xl bg-base-100 p-6'>
              <div className='flex items-center justify-between'>
                <h2 className='text-xl font-bold'>Enregistrer un paiement</h2>
                <button type='button' aria-label="Fermer" className='btn btn-ghost btn-sm btn-circle' onClick={() => setShowPaiementModal(false)}>
                  <X className='h-4 w-4' />
                </button>
              </div>
              <label className={champ}>
                <span className={libelle}>Montant payé (BIF) *</span>
                <input type="number" inputMode="numeric" min={0} placeholder="0"
                  className='input input-bordered w-full'
                  value={paiementForm.montant === 0 ? "" : paiementForm.montant}
                  onChange={(e) => setPaiementForm({ ...paiementForm, montant: Number(e.target.value) })} />
              </label>
              <label className={champ}>
                <span className={libelle}>Date du paiement</span>
                <input type="date" className='input input-bordered w-full' value={paiementForm.date}
                  onChange={(e) => setPaiementForm({ ...paiementForm, date: e.target.value })} />
              </label>
              <label className={champ}>
                <span className={libelle}>Note (facultatif)</span>
                <input type="text" className='input input-bordered w-full' value={paiementForm.note}
                  onChange={(e) => setPaiementForm({ ...paiementForm, note: e.target.value })} />
              </label>
              <div className='flex justify-end gap-3'>
                <button type='button' className='btn btn-ghost' onClick={() => setShowPaiementModal(false)}>Annuler</button>
                <button type='button' className='btn btn-primary' onClick={handleSubmitPaiement} disabled={isSaving}>
                  {isSaving ? "..." : "Confirmer"}
                </button>
              </div>
            </div>
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
          <h1 className='text-2xl font-black text-left mb-1'>Liste des dettes</h1>
          <div className='flex items-center justify-between mb-4'>
            <p className='text-sm'>
              {libelleFiltre}
              {dateFilterActive && ` — DU ${new Date(`${dateDebut}T00:00:00`).toLocaleDateString('fr-FR')} AU ${new Date(`${dateFin}T00:00:00`).toLocaleDateString('fr-FR')}`}
            </p>
            <div className='text-right'>
              <p className='text-sm'>
                DETTES TOTALES : <span className='font-bold'>{totalDu.toLocaleString()}</span>
              </p>
              <p className='text-sm'>
                DÉJÀ PAYÉ : <span className='text-success font-bold'>{totalPaye.toLocaleString()}</span>
              </p>
              <p className='text-sm'>
                RESTE À PAYER : <span className='text-error font-bold'>{totalRestant.toLocaleString()}</span>
              </p>
            </div>
          </div>

          <table className='table table-sm w-full'>
            <thead>
              <tr className='bg-success text-white'>
                <th className='text-white'>Date</th>
                <th className='text-white'>Débiteur</th>
                <th className='text-white'>Description</th>
                <th className='text-white text-right'>Montant</th>
                <th className='text-white text-right'>Payé</th>
                <th className='text-white text-right'>Reste</th>
                <th className='text-white'>Statut</th>
              </tr>
            </thead>
            {/* Lignes serrées : padding vertical réduit */}
            <tbody className='[&_td]:py-0.5 [&_td]:leading-tight'>
              {filtered.length > 0 ? (
                filtered.map((dette) => (
                  <tr key={dette.id}>
                    <td>{new Date(dette.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td>{dette.debiteur}</td>
                    <td>{dette.description}</td>
                    <td className='text-right'>{dette.montant.toLocaleString()}</td>
                    <td className='text-right'>{dette.montantPaye.toLocaleString()}</td>
                    <td className='text-right font-bold'>{(dette.montant - dette.montantPaye).toLocaleString()}</td>
                    <td>{LIBELLES_STATUT[dette.statut] ?? dette.statut}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className='text-center py-6 text-gray-500'>Aucune dette sur cette période</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className='flex justify-end gap-8 mt-4 pt-3 border-t-2 border-base-300'>
            <p className='text-sm'>
              TOTAL : <span className='font-bold'>{totalDu.toLocaleString()}</span>
            </p>
            <p className='text-sm'>
              PAYÉ : <span className='text-success font-bold'>{totalPaye.toLocaleString()}</span>
            </p>
            <p className='text-sm'>
              RESTE : <span className='text-error font-bold'>{totalRestant.toLocaleString()}</span>
            </p>
          </div>
        </div>

      </div>
    </Wrapper>
  )
}

export default DettesPage