"use client";
import React, { useEffect, useState } from 'react'
import Wrapper from '../components/Wrapper'
import { useUser } from '@clerk/nextjs'
import { getBilanPeriode } from '../actions'
import { useStockSync } from '@/lib/stock-sync'

const todayISO = () => new Date().toISOString().slice(0, 10)

type BilanData = {
  valeurStockDebut: number
  valeurStockFin: number
  valeurAchats: number
  valeurVentes: number
  totalDepenses: number
  dettesDonnees: number
  dettesPaye: number
  caisseDebit: number
  caisseCredit: number
  banqueDebit: number
  banqueCredit: number
  caisseReport: number
  banqueReport: number
}

const emptyBilan: BilanData = {
  valeurStockDebut: 0,
  valeurStockFin: 0,
  valeurAchats: 0,
  valeurVentes: 0,
  totalDepenses: 0,
  dettesDonnees: 0,
  dettesPaye: 0,
  caisseDebit: 0,
  caisseCredit: 0,
  banqueDebit: 0,
  banqueCredit: 0,
  caisseReport: 0,
  banqueReport: 0
}

const page = () => {
  const { user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress as string

  const [dateDebut, setDateDebut] = useState<string>(todayISO())
  const [dateFin, setDateFin] = useState<string>(todayISO())
  const [bilan, setBilan] = useState<BilanData>(emptyBilan)
  const [loading, setLoading] = useState(false)

  const variationStock = bilan.valeurStockFin - bilan.valeurStockDebut

  // Montant à verser = Ventes + Dettes payées - Dépenses - Dettes accordées
  const montantAVerser = bilan.valeurVentes + bilan.dettesPaye - bilan.totalDepenses - bilan.dettesDonnees

  const loadBilan = async () => {
    if (!email || !dateDebut || !dateFin) return
    setLoading(true)
    try {
      const data = await getBilanPeriode(email, dateDebut, dateFin)
      if (data) setBilan(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!email) return
    loadBilan()
  }, [email, dateDebut, dateFin])

  // Rechargement automatique après une vente, une dépense, une dette, un approvisionnement...
  // faits ici, sur une autre page ou sur un autre appareil (toutes les 30 s)
  useStockSync(loadBilan)

  return (
    <Wrapper>
      <div className='space-y-2 font-bold [&_*]:!font-bold'>

        {/* FILTRES */}
        <div className='border-2 border-base-200 pt-2 pb-4 px-4 rounded-3xl flex flex-wrap items-end gap-2 -mt-4'>
          <h1 className='text-lg font-bold text-red-500 whitespace-nowrap'>VERSEMENTS DE LA PERIODE DU</h1>

          <div>
            <label className='text-xs font-bold'>Date début</label>
            <input
              type="date"
              className='input input-bordered w-full'
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
            />
          </div>
          <div>
            <label className='text-xs font-bold'>Date fin</label>
            <input
              type="date"
              className='input input-bordered w-full'
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
            />
          </div>

          {loading && (
            <span className='ml-auto loading loading-spinner loading-sm text-primary'></span>
          )}
        </div>

        {/* VALEUR DU STOCK : DEBUT / FIN / VARIATION */}
        <div className='grid md:grid-cols-3 gap-2'>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center'>
            <p className='text-xs uppercase text-gray-600'>Stock au {new Date(dateDebut).toLocaleDateString('fr-FR')}</p>
            <p className='text-xl font-black text-green-800'>{bilan.valeurStockDebut.toLocaleString()}</p>
          </div>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center'>
            <p className='text-xs uppercase text-gray-700'>Stock au {new Date(dateFin).toLocaleDateString('fr-FR')}</p>
            <p className='text-xl font-black text-green-800'>{bilan.valeurStockFin.toLocaleString()}</p>
          </div>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center'>
            <p className='text-xs uppercase text-gray-700'>Variation du stock</p>
            <p className={`text-xl font-black ${variationStock < 0 ? 'text-error' : 'text-green-800'}`}>
              {variationStock >= 0 ? '+' : ''}{variationStock.toLocaleString()}
            </p>
          </div>
        </div>

        {/* ACHATS / VENTES / DEPENSES */}
        <div className='grid md:grid-cols-3 gap-2'>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center'>
            <p className='text-xs uppercase text-gray-700'>Valeur des achats</p>
            <p className='text-xl font-black text-green-800'>{bilan.valeurAchats.toLocaleString()}</p>
          </div>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center'>
            <p className='text-xs uppercase text-gray-700'>Valeur des ventes</p>
            <p className='text-xl font-black text-green-800'>{bilan.valeurVentes.toLocaleString()}</p>
          </div>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center'>
            <p className='text-xs uppercase text-gray-700'>Dépenses</p>
            <p className='text-xl font-black text-green-800'>{bilan.totalDepenses.toLocaleString()}</p>
          </div>
        </div>

        {/* DETTES */}
        <div className='grid md:grid-cols-2 gap-2'>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center'>
            <p className='text-xs uppercase text-gray-700'>Dettes accordées</p>
            <p className='text-xl font-black text-green-800'>{bilan.dettesDonnees.toLocaleString()}</p>
          </div>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center'>
            <p className='text-xs uppercase text-gray-700'>Dettes payées</p>
            <p className='text-xl font-black text-green-800'>{bilan.dettesPaye.toLocaleString()}</p>
          </div>
        </div>

        {/* MONTANT A VERSER */}
        <div className='border-2 border-base-200 rounded-3xl p-4 text-center'>
          <p className='text-xs uppercase text-gray-700'>Recettes</p>
          <p className='text-2xl font-black text-green-800'>
            {montantAVerser.toLocaleString()}
          </p>
        </div>

      </div>
    </Wrapper>
  )
}

export default page