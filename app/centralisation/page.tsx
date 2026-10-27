"use client";
import React, { useEffect, useState } from 'react'
import Wrapper from '../components/Wrapper'
import { useUser } from '@clerk/nextjs'
import { getCentralisation, getComparaisonCommerciale } from '../actions'
import { BanqueEntry, CaisseEntry } from '@/type'
import { useStockSync } from '@/lib/stock-sync'

const todayISO = () => new Date().toISOString().slice(0, 10)
const firstDayOfYearISO = () => `${new Date().getFullYear()}-01-01`

type CompteData = {
  report: number
  totalDebit: number
  totalCredit: number
  solde: number
  entries: any[]
}

type ComparaisonData = {
  ventes: number
  depenses: number
  dettesDonnees: number
  dettesPaye: number
}

const page = () => {
  const { user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress as string

  const [modePeriode, setModePeriode] = useState<"annee" | "periode">("annee")
  const [annee, setAnnee] = useState<number>(new Date().getFullYear())
  const [dateDebut, setDateDebut] = useState<string>(firstDayOfYearISO())
  const [dateFin, setDateFin] = useState<string>(todayISO())

  const [banque, setBanque] = useState<CompteData>({ report: 0, totalDebit: 0, totalCredit: 0, solde: 0, entries: [] })
  const [caisse, setCaisse] = useState<CompteData>({ report: 0, totalDebit: 0, totalCredit: 0, solde: 0, entries: [] })
  const [soldeGeneral, setSoldeGeneral] = useState(0)
  const [comparaison, setComparaison] = useState<ComparaisonData>({ ventes: 0, depenses: 0, dettesDonnees: 0, dettesPaye: 0 })
  const [loading, setLoading] = useState(false)

  const effectiveDebut = modePeriode === "annee" ? `${annee}-01-01` : dateDebut
  const effectiveFin = modePeriode === "annee" ? `${annee}-12-31` : dateFin

  // Côté commercial : ce que l'activité dit avoir généré comme encaissement net
  // Ventes - Dépenses - Dettes données (pas encore encaissées) + Dettes payées (recouvrement)
  const netCommercial = comparaison.ventes - comparaison.depenses - comparaison.dettesDonnees + comparaison.dettesPaye

  // Côté comptable : ce qui a réellement été encaissé
  // Convention VB6 : Caisse = report + débit - crédit → un DEBIT en caisse est un encaissement
  //                  Banque = report + crédit - débit → un CREDIT en banque est un encaissement
  const totalEncaisse = caisse.totalDebit + banque.totalCredit

  const ecart = netCommercial - totalEncaisse

  const loadData = async () => {
    if (!email) return
    setLoading(true)
    try {
      const [data, comp] = await Promise.all([
        getCentralisation(email, effectiveDebut, effectiveFin),
        getComparaisonCommerciale(email, effectiveDebut, effectiveFin)
      ])
      setBanque(data.banque)
      setCaisse(data.caisse)
      setSoldeGeneral(data.soldeGeneral)
      setComparaison(comp)
    } finally {
      setLoading(false)
    }
  }

  // Filtrage automatique : dès que l'email est dispo, ou que l'année change (mode "annee"),
  // ou que les deux dates de la période sont renseignées (mode "periode")
  useEffect(() => {
    if (!email) return
    if (modePeriode === "periode" && (!dateDebut || !dateFin)) return
    loadData()
  }, [email, modePeriode, annee, dateDebut, dateFin])

  useStockSync(loadData)
  
  const handlePrint = () => {
    window.print()
  }

  return (
    <Wrapper>
      <div className='space-y-4 font-bold'>

        {/* EN-TETE / FILTRES */}
        <div className='border-2 border-base-200 p-4 font-bold rounded-3xl flex flex-wrap items-end gap-4'>
          <h1 className='text-lg font-bold text-error'>
            OPERATIONS BANCAIRES/CAISSE
          </h1>

          <label className='flex items-center gap-2 font-bold whitespace-nowrap shrink-0'>
            <input type="radio" name="modePeriode" className='radio radio-primary'
              checked={modePeriode === "annee"}
              onChange={() => setModePeriode("annee")} />
            ANNEE FISCALE :
            <input
              type="number"
              className='input input-bordered input-sm w-24 font-bold text-error'
              value={annee}
              onChange={(e) => setAnnee(Number(e.target.value))}
              disabled={modePeriode !== "annee"}
            />
          </label>

          <label className='flex items-center gap-2 font-bold whitespace-nowrap shrink-0'>
            <input type="radio" name="modePeriode" className='radio radio-primary'
              checked={modePeriode === "periode"}
              onChange={() => setModePeriode("periode")} />
            PERIODE DU :
            <input
              type="date"
              className='input input-bordered input-sm'
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              disabled={modePeriode !== "periode"}
            />
            AU
            <input
              type="date"
              className='input input-bordered input-sm'
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              disabled={modePeriode !== "periode"}
            />
          </label>

          {loading && (
            <span className='ml-auto loading loading-spinner loading-sm text-primary'></span>
          )}
        </div>

        {/* DEUX TABLEAUX COTE A COTE */}
        <div className='grid md:grid-cols-2 gap-4'>

          {/* BANQUE */}
          <div className='border-2 border-base-200 p-4 rounded-3xl'>
            <div className='flex items-center justify-between mb-3'>
              <h2 className='text-lg font-bold text-error'>BANQUE</h2>
              <div className='text-right'>
                <p className='text-xs font-bold text-gray-600'>REPORT</p>
                <p className='text-lg font-black font-bold text-primary'>{banque.report.toLocaleString()}</p>
              </div>
            </div>
            <div className='overflow-x-auto max-h-[350px] overflow-y-auto'>
              <table className='table table-xs font-bold'>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Bord/Fact</th>
                    <th>Libellé</th>
                    <th className='text-right font-bold'>Crédit</th>
                    <th className='text-right font-bold'>Débit</th>
                  </tr>
                </thead>
                <tbody>
                  {banque.entries.length > 0 ? (
                    banque.entries.map((entry: BanqueEntry) => (
                      <tr key={entry.id}>
                        <td>{new Date(entry.date).toLocaleDateString('fr-FR')}</td>
                        <td>{entry.bordereau}</td>
                        <td>{entry.libelle}</td>
                        <td className='text-right font-bold text-success'>{entry.credit ? entry.credit.toLocaleString() : ''}</td>
                        <td className='text-right font-bold text-error'>{entry.debit ? entry.debit.toLocaleString() : ''}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={5} className='text-center py-6 text-gray-500 font-bold'>Aucune opération</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className='grid grid-cols-3 gap-2 mt-3 text-center'>
              <div>
                <p className='text-xs font-bold text-gray-600'>CREDITS</p>
                <p className='font-black font-bold text-success'>{banque.totalCredit.toLocaleString()}</p>
              </div>
              <div>
                <p className='text-xs font-bold text-gray-600'>DEBITS</p>
                <p className='font-black font-bold text-error'>{banque.totalDebit.toLocaleString()}</p>
              </div>
              <div>
                <p className='text-xs font-bold text-gray-600'>SOLDE</p>
                <p className={`font-black font-bold ${banque.solde < 0 ? 'text-error' : 'text-primary'}`}>{banque.solde.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* CAISSE */}
          <div className='border-2 border-base-200 p-4 rounded-3xl'>
            <div className='flex items-center justify-between mb-3'>
              <h2 className='text-lg font-bold text-error'>CAISSE</h2>
              <div className='text-right'>
                <p className='text-xs font-bold text-gray-600'>REPORT</p>
                <p className='text-lg font-black text-error'>{caisse.report.toLocaleString()}</p>
              </div>
            </div>
            <div className='overflow-x-auto max-h-[350px] overflow-y-auto'>
              <table className='table table-xs'>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Nr ID</th>
                    <th>Libellé</th>
                    <th className='text-right'>Débit</th>
                    <th className='text-right'>Crédit</th>
                  </tr>
                </thead>
                <tbody>
                  {caisse.entries.length > 0 ? (
                    caisse.entries.map((entry: CaisseEntry) => (
                      <tr key={entry.id}>
                        <td>{new Date(entry.date).toLocaleDateString('fr-FR')}</td>
                        <td>{entry.ordo}</td>
                        <td>{entry.libelle}</td>
                        <td className='text-right font-bold text-success'>{entry.debit ? entry.debit.toLocaleString() : ''}</td>
                        <td className='text-right font-bold text-error'>{entry.credit ? entry.credit.toLocaleString() : ''}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={5} className='text-center py-6 text-gray-500'>Aucune opération</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className='grid grid-cols-3 gap-2 mt-3 text-center'>
              <div>
                <p className='text-xs font-bold text-gray-600'>DEBITS</p>
                <p className='font-black text-success'>{caisse.totalDebit.toLocaleString()}</p>
              </div>
              <div>
                <p className='text-xs font-bold text-gray-600'>CREDITS</p>
                <p className='font-black text-error'>{caisse.totalCredit.toLocaleString()}</p>
              </div>
              <div>
                <p className='text-xs font-bold text-gray-600'>SOLDE</p>
                <p className={`font-black ${caisse.solde < 0 ? 'text-error' : 'text-primary'}`}>{caisse.solde.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* COMPARAISON : Commercial (Ventes/Dépenses/Dettes) vs Comptable (Caisse+Banque) */}
        <div className='border-2 border-base-200 p-4 rounded-3xl'>
          <h2 className='text-lg font-bold text-error mb-3'>COMPARAISON COMMERCIAL / COMPTABLE</h2>

          <div className='grid md:grid-cols-2 gap-4'>

            {/* Colonne commerciale */}
            <div className='border-2 border-base-200 rounded-2xl p-3 space-y-2'>
              <p className='text-sm font-bold text-gray-600 uppercase'>Activité commerciale</p>

              <div className='flex justify-between text-sm'>
                <span>Ventes</span>
                <span className='text-success'>{comparaison.ventes.toLocaleString()}</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span>− Dépenses</span>
                <span className='text-error'>{comparaison.depenses.toLocaleString()}</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span>− Dettes données (non encaissées)</span>
                <span className='text-error'>{comparaison.dettesDonnees.toLocaleString()}</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span>+ Dettes payées (recouvrement)</span>
                <span className='text-success'>{comparaison.dettesPaye.toLocaleString()}</span>
              </div>

              <div className='flex justify-between pt-2 border-t-2 border-base-200 font-black'>
                <span>NET COMMERCIAL</span>
                <span className={netCommercial < 0 ? 'text-error' : 'text-success'}>
                  {netCommercial.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Colonne comptable */}
            <div className='border-2 border-base-200 rounded-2xl p-3 space-y-2'>
              <p className='text-sm font-bold text-gray-600 uppercase'>Encaissements comptables</p>

              <div className='flex justify-between text-sm'>
                <span>Débits Caisse (encaissements)</span>
                <span className='text-success'>{caisse.totalDebit.toLocaleString()}</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span>+ Crédits Banque (encaissements)</span>
                <span className='text-success'>{banque.totalCredit.toLocaleString()}</span>
              </div>

              <div className='flex justify-between pt-2 border-t-2 border-base-200 font-black'>
                <span>TOTAL ENCAISSÉ</span>
                <span className='text-primary'>{totalEncaisse.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className='mt-4 flex items-center justify-between border-t-2 border-base-200 pt-3'>
            <p className='font-bold'>ÉCART (Net commercial − Total encaissé)</p>
            <p className={`text-xl font-black ${Math.abs(ecart) < 1 ? 'text-success' : 'text-error'}`}>
              {ecart.toLocaleString()}
            </p>
          </div>
          {Math.abs(ecart) >= 1 && (
            <p className='text-xs text-gray-500 mt-1'>
              Un écart non nul peut venir d'une vente encaissée en espèces mais pas encore versée en Caisse,
              d'une dette payée non enregistrée, ou d'une opération Caisse/Banque sans lien commercial (ex: apport personnel).
            </p>
          )}
        </div>

        {/* SOLDE GENERAL + IMPRESSION */}
        <div className='border-2 border-base-200 p-4 rounded-3xl flex items-center justify-between'>
          <button onClick={handlePrint} className='btn btn-info'>IMPRESSION</button>
          <p className='text-xl font-bold'>
            SOLDE TOTAL:
            <span className={`ml-2 font-black ${soldeGeneral < 0 ? 'text-error' : 'text-success'}`}>
              {soldeGeneral.toLocaleString()}
            </span>
          </p>
        </div>

      </div>
    </Wrapper>
  )
}

export default page