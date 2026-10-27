"use client";
import React, { useEffect, useRef, useState } from 'react'
import Wrapper from '../components/Wrapper'
import { useUser } from '@clerk/nextjs'
import {
  createBanqueEntry,
  updateBanqueEntry,
  deleteBanqueEntry,
  getBanqueEntries,
  getReportAvantBanque,
  getNextOrdoBanque,
  getBanquesEtComptes,
  getBanqueEntryByOrdo,
  getCategories,
  createCategorie,
  deleteCategorie,
  getBusinessName
} from '../actions'
import { BanqueEntry, BanqueFormType } from '@/type'
import { toast } from 'react-toastify'
import { Trash2 } from 'lucide-react'

const todayISO = () => new Date().toISOString().slice(0, 10)
const NOUVELLE_CATEGORIE = "__new__"

const page = () => {
  const { user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress as string

  const [businessName, setBusinessName] = useState<string>("TUDANDAZE.COM")

  const [ordo, setOrdo] = useState<number>(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isManualOrdo, setIsManualOrdo] = useState(false)

  const [formData, setFormData] = useState<BanqueFormType>({
    date: todayISO(),
    bordereau: "",
    libelle: "",
    banque: "",
    compte: "",
    categorie: "",
    type: "CREDIT",
    montant: 0
  })

  const [dateDebut, setDateDebut] = useState<string>(todayISO())
  const [dateFin, setDateFin] = useState<string>(todayISO())
  const [modeFiltre, setModeFiltre] = useState<"toutes" | "banque" | "compte">("toutes")
  const [banqueFiltre, setBanqueFiltre] = useState<string>("")
  const [compteFiltre, setCompteFiltre] = useState<string>("")

  const [entries, setEntries] = useState<BanqueEntry[]>([])
  const [report, setReport] = useState<number>(0)
  const [banques, setBanques] = useState<string[]>([])
  const [comptes, setComptes] = useState<string[]>([])

  const [categoriesCredit, setCategoriesCredit] = useState<string[]>([])
  const [categoriesDebit, setCategoriesDebit] = useState<string[]>([])
  const [nouvelleCategorie, setNouvelleCategorie] = useState("")
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Fenêtre de gestion (suppression) des catégories
  const manageDialogRef = useRef<HTMLDialogElement>(null)
  const [deletingCat, setDeletingCat] = useState<string | null>(null)

  const pdfContentRef = useRef<HTMLDivElement>(null)
  const [isExporting, setIsExporting] = useState(false)

  const categoriesDisponibles = formData.type === "CREDIT" ? categoriesCredit : categoriesDebit
  const anneeFiscale = new Date(formData.date).getFullYear()

  const totalCredit = entries.reduce((acc, e) => acc + (e.credit ?? 0), 0)
  const totalDebit = entries.reduce((acc, e) => acc + (e.debit ?? 0), 0)
  const solde = report + totalCredit - totalDebit

  const montantSaisi = Number(formData.montant) || 0
  const soldePrevisionnel = formData.type === "CREDIT"
    ? solde + montantSaisi
    : solde - montantSaisi

  const titrePdfListe = modeFiltre === "toutes"
    ? "LISTE DE TOUS LES COMPTES"
    : modeFiltre === "banque"
      ? `LISTE DES OPERATIONS/${banqueFiltre || ""}`
      : `LISTE DES OPERATIONS/COMPTE ${compteFiltre || ""}`

  const loadBusinessName = async () => {
    if (!email) return
    const nom = await getBusinessName(email)
    setBusinessName(nom)
  }

  const loadNextOrdo = async () => {
    if (!email) return
    const next = await getNextOrdoBanque(email)
    setOrdo(next)
  }

  const loadListes = async () => {
    if (!email) return
    const { banques, comptes } = await getBanquesEtComptes(email)
    setBanques(banques)
    setComptes(comptes)
  }

  const loadCategories = async () => {
    if (!email) return
    try {
      const [credit, debit] = await Promise.all([
        getCategories(email, "BANQUE", "CREDIT"),
        getCategories(email, "BANQUE", "DEBIT")
      ])
      setCategoriesCredit(credit)
      setCategoriesDebit(debit)
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors du chargement des catégories")
    }
  }

  const loadEntries = async () => {
    if (!email) return
    try {
      const banque = modeFiltre === "banque" && banqueFiltre ? banqueFiltre : undefined
      const compte = modeFiltre === "compte" && compteFiltre ? compteFiltre : undefined
      const [data, rep] = await Promise.all([
        getBanqueEntries(email, dateDebut, dateFin, banque, compte),
        getReportAvantBanque(email, dateDebut)
      ])
      setEntries(data)
      setReport(rep)
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors du chargement des opérations")
    }
  }

  useEffect(() => {
    if (!email) return
    loadBusinessName()
    loadNextOrdo()
    loadListes()
    loadCategories()
  }, [email])

  useEffect(() => {
    if (!email) return
    if (modeFiltre === "banque" && !banqueFiltre) return
    if (modeFiltre === "compte" && !compteFiltre) return
    loadEntries()
  }, [email, dateDebut, dateFin, modeFiltre, banqueFiltre, compteFiltre])

  useEffect(() => {
    if (!email || !isManualOrdo) return
    const timer = setTimeout(async () => {
      const entry = await getBanqueEntryByOrdo(email, ordo)
      if (entry) {
        setSelectedId(entry.id)
        setFormData({
          date: new Date(entry.date).toISOString().slice(0, 10),
          bordereau: entry.bordereau,
          libelle: entry.libelle,
          banque: entry.banque,
          compte: entry.compte,
          categorie: entry.categorie,
          type: entry.type,
          montant: entry.type === "CREDIT" ? entry.credit : entry.debit
        })
      } else {
        setSelectedId(null)
        setFormData({
          date: todayISO(), bordereau: "", libelle: "", banque: "", compte: "",
          categorie: "", type: "CREDIT", montant: 0
        })
      }
      setIsManualOrdo(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [ordo, isManualOrdo, email])

  const resetForm = () => {
    setSelectedId(null)
    setFormData({
      date: todayISO(), bordereau: "", libelle: "", banque: "", compte: "",
      categorie: "", type: "CREDIT", montant: 0
    })
    loadNextOrdo()
  }

  const handleTypeChange = (type: "CREDIT" | "DEBIT") => {
    setFormData({ ...formData, type, categorie: "" })
  }

  const handleCategorieChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    if (value === NOUVELLE_CATEGORIE) {
      setNouvelleCategorie("")
      dialogRef.current?.showModal()
      return
    }
    setFormData({ ...formData, categorie: value })
  }

  const handleAjouterCategorie = async () => {
    if (!nouvelleCategorie.trim()) {
      toast.error("Saisissez le nom de la catégorie SVP")
      return
    }
    try {
      const nom = await createCategorie(email, nouvelleCategorie, "BANQUE", formData.type)
      toast.success("Catégorie ajoutée")
      await loadCategories()
      setFormData({ ...formData, categorie: nom })
      dialogRef.current?.close()
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors de l'ajout de la catégorie")
    }
  }

  const handleDeleteCategorie = async (nom: string) => {
    const confirmed = confirm(`Supprimer définitivement la catégorie "${nom}" ?`)
    if (!confirmed) return
    setDeletingCat(nom)
    try {
      await deleteCategorie(email, nom, "BANQUE", formData.type)
      toast.success("Catégorie supprimée")
      if (formData.categorie === nom) {
        setFormData({ ...formData, categorie: "" })
      }
      await loadCategories()
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors de la suppression de la catégorie")
    } finally {
      setDeletingCat(null)
    }
  }

  const handleSave = async () => {
    if (!formData.bordereau) {
      toast.error("Saisissez le nr de bordereau SVP")
      return
    }
    if (!formData.libelle) {
      toast.error("Saisissez le libellé de l'opération SVP")
      return
    }
    if (!formData.montant || Number(formData.montant) <= 0) {
      toast.error("Saisissez le montant SVP")
      return
    }
    if (!formData.banque) {
      toast.error("Précisez le nom de la banque SVP")
      return
    }
    if (!formData.compte) {
      toast.error("Précisez le nr de compte SVP")
      return
    }
    if (!formData.categorie) {
      toast.error("Précisez la catégorie SVP")
      return
    }
    try {
      await createBanqueEntry(formData, email)
      toast.success("Enregistrement terminé")
      resetForm()
      loadListes()
      loadEntries()
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors de l'enregistrement")
    }
  }

  const handleUpdate = async () => {
    if (!selectedId) {
      toast.error("Sélectionnez une opération dans la liste SVP")
      return
    }
    try {
      await updateBanqueEntry(selectedId, formData, email)
      toast.success("Modification terminée")
      resetForm()
      loadEntries()
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors de la modification")
    }
  }

  const handleDelete = async () => {
    if (!selectedId) {
      toast.error("Sélectionnez une opération dans la liste SVP")
      return
    }
    const confirmDelete = confirm("Voulez-vous vraiment supprimer cette opération ?")
    if (!confirmDelete) return
    try {
      await deleteBanqueEntry(selectedId, email)
      toast.success("Suppression réussie")
      resetForm()
      loadEntries()
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors de la suppression")
    }
  }

  const handleSelectRow = (entry: BanqueEntry) => {
    setSelectedId(entry.id)
    setOrdo(entry.ordo)
    setFormData({
      date: new Date(entry.date).toISOString().slice(0, 10),
      bordereau: entry.bordereau,
      libelle: entry.libelle,
      banque: entry.banque,
      compte: entry.compte,
      categorie: entry.categorie,
      type: entry.type,
      montant: entry.type === "CREDIT" ? entry.credit : entry.debit
    })
  }

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

        if (cutEnd < canvas.height) {
          const straddlingRow = rowBoundariesPx.find(
            (r) => r.top < cutEnd && r.bottom > cutEnd
          )
          if (straddlingRow && straddlingRow.top > currentStart) {
            cutEnd = straddlingRow.top
          }
        }

        if (!first) pdf.addPage()
        first = false

        const positionMm = -(currentStart * mmPerPx)
        pdf.addImage(imgData, 'PNG', 0, positionMm, imgWidth, imgHeight)

        currentStart = cutEnd
      }

      pdf.save(`livre_banque_${dateDebut}_au_${dateFin}.pdf`)
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
      <div className='space-y-4 [&_*]:font-bold!'>

        {/* SAISIE */}
        <div className='border-2 border-base-200 p-4 rounded-3xl space-y-3'>
          <div className='flex flex-wrap items-start gap-4'>
            <div>
              <label className='block text-xs font-bold mb-1'>Nr ID</label>
              <input
                type="number"
                value={ordo}
                onChange={(e) => {
                  setIsManualOrdo(true)
                  setOrdo(Number(e.target.value) || 0)
                }}
                className='input input-bordered w-16 font-bold text-center'
              />
            </div>
            <div className='ml-auto text-right'>
              <p className='text-xs font-bold text-gray-600'>ANNEE FISCALE</p>
              <p className='text-xl font-black text-primary'>{anneeFiscale}</p>
            </div>
          </div>

          <h2 className='text-lg font-bold text-success'>HISTORIQUE DE LA VARIATION DU LIVRE DE BANQUE</h2>

          <div className='flex flex-wrap items-center gap-4'>
            <label className='flex items-center gap-2 font-bold text-error'>
              <input type="radio" name="type" className='radio radio-error'
                checked={formData.type === "CREDIT"}
                onChange={() => handleTypeChange("CREDIT")} />
              CREDIT
            </label>
            <label className='flex items-center gap-2 font-bold text-error'>
              <input type="radio" name="type" className='radio radio-error'
                checked={formData.type === "DEBIT"}
                onChange={() => handleTypeChange("DEBIT")} />
              DEBIT
            </label>
          </div>

          <div className='grid md:grid-cols-3 gap-3'>
            <div>
              <label className='text-xs font-bold'>Bordereau / Chèque / OV</label>
              <input type="text" placeholder="Nr Bordereau / Chèque / OV" className='input input-bordered w-full'
                value={formData.bordereau}
                onChange={(e) => setFormData({ ...formData, bordereau: e.target.value })} />
            </div>
            <div>
              <label className='text-xs font-bold'>Montant</label>
              <input type="number" placeholder="0" className='input input-bordered w-full'
                value={formData.montant === 0 ? "" : formData.montant}
                onChange={(e) => setFormData({ ...formData, montant: Number(e.target.value) })} />
              {montantSaisi > 0 && (
                <p className='text-xs font-bold mt-1'>
                  Nouveau solde prévu :{" "}
                  <span className={soldePrevisionnel < 0 ? 'text-error' : 'text-success'}>
                    {soldePrevisionnel.toLocaleString()}
                  </span>
                </p>
              )}
            </div>
            <div>
              <label className='text-xs font-bold'>Date</label>
              <input type="date" className='input input-bordered w-full'
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
            </div>
          </div>

          <div className='grid md:grid-cols-3 gap-3'>
            <div>
              <label className='text-xs font-bold'>Banque</label>
              <input type="text" list="banques-list" className='input input-bordered w-full'
                placeholder="Nom de la banque"
                value={formData.banque}
                onChange={(e) => setFormData({ ...formData, banque: e.target.value })} />
              <datalist id="banques-list">
                {banques.map((b) => <option key={b} value={b} />)}
              </datalist>
            </div>
            <div>
              <label className='text-xs font-bold'>Compte</label>
              <input type="text" list="comptes-list" className='input input-bordered w-full'
                placeholder="Nr de compte"
                value={formData.compte}
                onChange={(e) => setFormData({ ...formData, compte: e.target.value })} />
              <datalist id="comptes-list">
                {comptes.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className='text-xs font-bold'>Catégorie</label>
              <div className='flex gap-2 items-center'>
                <select className='select select-bordered w-full'
                  value={formData.categorie}
                  onChange={handleCategorieChange}
                >
                  <option value="">Sélectionner la catégorie</option>
                  {categoriesDisponibles.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value={NOUVELLE_CATEGORIE}>+ Ajouter une catégorie</option>
                </select>
                <button
                    type="button"
                    className='btn btn-ghost btn-sm shrink-0'
                    onClick={() => manageDialogRef.current?.showModal()}
                    title="Supprimer une catégorie"
                  >
                  <Trash2 className='w-4 h-4' />
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className='text-xs font-bold'>Libellé</label>
            <input type="text" placeholder="Libellé de l'opération"
              className='input input-bordered w-full'
              value={formData.libelle}
              onChange={(e) => setFormData({ ...formData, libelle: e.target.value })} />
          </div>

          <div className='flex flex-wrap gap-2'>
            <button onClick={handleSave} className='btn btn-success flex-1'>ENREGISTRER</button>
            <button onClick={handleUpdate} className='btn btn-warning flex-1'>MODIFIER</button>
            <button onClick={handleDelete} className='btn btn-error flex-1 text-white'>SUPPRESSION</button>
            {selectedId && (
              <button onClick={resetForm} className='btn btn-ghost'>Nouveau</button>
            )}
          </div>
        </div>

        {/* FILTRES */}
        <div className='border-2 border-base-200 p-4 rounded-3xl flex flex-wrap items-end gap-4'>
          <h2 className='text-lg font-bold w-full text-success'>OPERATIONS FAITES</h2>
          <div>
            <label className='text-xs font-bold'>Du</label>
            <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className='input input-bordered' />
          </div>
          <div>
            <label className='text-xs font-bold'>Au</label>
            <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className='input input-bordered' />
          </div>

          <label className='flex items-center gap-2 font-bold'>
            <input type="radio" name="filtre" className='radio radio-primary'
              checked={modeFiltre === "toutes"}
              onChange={() => setModeFiltre("toutes")} />
            TOUS LES COMPTES
          </label>
          <label className='flex items-center gap-2 font-bold'>
            <input type="radio" name="filtre" className='radio radio-primary'
              checked={modeFiltre === "banque"}
              onChange={() => setModeFiltre("banque")} />
            PAR BANQUE
          </label>
          <label className='flex items-center gap-2 font-bold'>
            <input type="radio" name="filtre" className='radio radio-primary'
              checked={modeFiltre === "compte"}
              onChange={() => setModeFiltre("compte")} />
            PAR COMPTE
          </label>

          {modeFiltre === "banque" && (
            <select className='select select-bordered select-sm w-40' value={banqueFiltre} onChange={(e) => setBanqueFiltre(e.target.value)}>
              <option value="">Choisir une banque</option>
              {banques.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          {modeFiltre === "compte" && (
            <select className='select select-bordered select-sm w-40' value={compteFiltre} onChange={(e) => setCompteFiltre(e.target.value)}>
              <option value="">Choisir un compte</option>
              {comptes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {/* LISTE (affichage écran) */}
        <div className='border-2 border-base-200 p-4 rounded-3xl'>
          <div className='flex items-center justify-between mb-3'>
            <h2 className='text-xl font-bold'>LISTE DES OPERATIONS</h2>
            <div className='text-right'>
              <p className='text-xs font-bold text-gray-600'>REPORT</p>
              <p className='text-xl font-black text-primary'>{report.toLocaleString()}</p>
            </div>
          </div>

          <div className='overflow-x-auto max-h-[400px] overflow-y-auto'>
            <table className='table table-sm'>
              <thead>
                <tr className='bg-success text-white'>
                  <th className='text-white'>Date</th>
                  <th className='text-white'>Bord/Chèq</th>
                  <th className='text-white'>Libellé</th>
                  <th className='text-white text-right'>Crédit</th>
                  <th className='text-white text-right'>Débit</th>
                </tr>
              </thead>
              <tbody>
                {entries.length > 0 ? (
                  entries.map((entry) => (
                    <tr key={entry.id}
                      onClick={() => handleSelectRow(entry)}
                      className={`cursor-pointer hover ${selectedId === entry.id ? 'bg-base-200' : ''}`}
                    >
                      <td>{new Date(entry.date).toLocaleDateString('fr-FR')}</td>
                      <td>{entry.bordereau}</td>
                      <td>{entry.libelle}</td>
                      <td className='text-right font-bold text-success'>{entry.credit ? entry.credit.toLocaleString() : ''}</td>
                      <td className='text-right font-bold text-error'>{entry.debit ? entry.debit.toLocaleString() : ''}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className='text-center py-6 text-gray-500'>Aucune opération sur cette période</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* BLOC CACHÉ — contenu exact du PDF exporté */}
        <div
          ref={pdfContentRef}
          style={{ position: 'fixed', top: 0, left: '-9999px', width: '800px' }}
          className='bg-white p-6'
        >
          <h1 className='text-2xl font-black text-left mb-1'>{businessName}</h1>
          <h2 className='text-base font-bold text-left mb-4'>HISTORIQUE DE LA VARIATION DU LIVRE DE BANQUE</h2>

          <div className='flex items-center justify-between mb-3'>
            <h3 className='text-sm font-bold text-left'>
              {titrePdfListe} DU {new Date(dateDebut).toLocaleDateString('fr-FR')} AU {new Date(dateFin).toLocaleDateString('fr-FR')}
            </h3>
            <p className='text-sm'>
              REPORT : <span className='text-error'>{report.toLocaleString()}</span>
            </p>
          </div>

          <table className='table table-sm w-full'>
            <thead>
              <tr className='bg-success text-white'>
                <th className='text-white'>Date</th>
                <th className='text-white'>Bord/Chèq</th>
                <th className='text-white'>Libellé</th>
                <th className='text-white text-right'>Crédit</th>
                <th className='text-white text-right'>Débit</th>
              </tr>
            </thead>
            <tbody>
              {entries.length > 0 ? (
                entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.date).toLocaleDateString('fr-FR')}</td>
                    <td>{entry.bordereau}</td>
                    <td>{entry.libelle}</td>
                    <td className='text-right font-bold text-success'>{entry.credit ? entry.credit.toLocaleString() : ''}</td>
                    <td className='text-right font-bold text-error'>{entry.debit ? entry.debit.toLocaleString() : ''}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className='text-center py-6 text-gray-500'>Aucune opération sur cette période</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className='flex justify-end gap-8 mt-4 pt-3 border-t-2 border-base-300'>
            <p className='text-sm'>
              TOTAL CREDIT : <span className='text-success'>{totalCredit.toLocaleString()}</span>
            </p>
            <p className='text-sm'>
              TOTAL DEBIT : <span className='text-error'>{totalDebit.toLocaleString()}</span>
            </p>
            <p className='text-sm'>
              SOLDE : <span className='text-primary'>{solde.toLocaleString()}</span>
            </p>
          </div>
        </div>

        {/* TOTAUX */}
        <div className='grid grid-cols-2 gap-4'>
          <div className='border-2 border-base-200 p-4 rounded-3xl text-center'>
            <p className='font-bold text-gray-600'>CREDITS</p>
            <p className='text-2xl font-black text-success'>{totalCredit.toLocaleString()}</p>
          </div>
          <div className='border-2 border-base-200 p-4 rounded-3xl text-center'>
            <p className='font-bold text-gray-600'>DEBITS</p>
            <p className='text-2xl font-black text-error'>{totalDebit.toLocaleString()}</p>
          </div>
        </div>

        <div className='border-2 border-base-200 p-4 rounded-3xl flex items-center justify-between'>
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className='btn btn-info'
          >
            {isExporting ? "GÉNÉRATION..." : "TÉLÉCHARGER PDF"}
          </button>
          <p className='text-xl font-bold'>
            SOLDE AU {new Date(dateFin).toLocaleDateString('fr-FR')} :
            <span className='ml-2 text-error font-black'>{solde.toLocaleString()}</span>
          </p>
        </div>

        {/* MODALE : Ajouter une catégorie */}
        <dialog ref={dialogRef} className='modal'>
          <div className='modal-box'>
            <h3 className='font-bold text-lg'>Nouvelle catégorie ({formData.type === "CREDIT" ? "Crédit" : "Débit"})</h3>
            <input
              type="text"
              placeholder="Nom de la catégorie"
              className='input input-bordered w-full mt-4'
              value={nouvelleCategorie}
              onChange={(e) => setNouvelleCategorie(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAjouterCategorie() }}
              autoFocus
            />
            <div className='modal-action'>
              <button className='btn btn-ghost' onClick={() => dialogRef.current?.close()}>Annuler</button>
              <button className='btn btn-success' onClick={handleAjouterCategorie}>Ajouter</button>
            </div>
          </div>
          <form method="dialog" className='modal-backdrop'>
            <button>close</button>
          </form>
        </dialog>

        {/* MODALE : Gérer (supprimer) les catégories */}
        <dialog ref={manageDialogRef} className='modal'>
          <div className='modal-box'>
            <h3 className='font-bold text-lg mb-4'>Gérer les catégories ({formData.type === "CREDIT" ? "Crédit" : "Débit"})</h3>
            <div className='space-y-2 max-h-80 overflow-y-auto'>
              {categoriesDisponibles.length > 0 ? (
                categoriesDisponibles.map((cat) => (
                  <div key={cat} className='flex items-center justify-between bg-base-200 rounded-xl px-4 py-2'>
                    <span className='font-bold'>{cat}</span>
                    <button
                      className='btn btn-xs btn-error'
                      disabled={deletingCat === cat}
                      onClick={() => handleDeleteCategorie(cat)}
                    >
                      {deletingCat === cat ? '...' : <Trash2 className='w-3 h-3' />}
                    </button>
                  </div>
                ))
              ) : (
                <p className='text-center text-gray-500 py-4'>Aucune catégorie pour ce type</p>
              )}
            </div>
            <div className='modal-action'>
              <button className='btn btn-ghost' onClick={() => manageDialogRef.current?.close()}>Fermer</button>
            </div>
          </div>
          <form method="dialog" className='modal-backdrop'>
            <button>close</button>
          </form>
        </dialog>

      </div>
    </Wrapper>
  )
}

export default page
