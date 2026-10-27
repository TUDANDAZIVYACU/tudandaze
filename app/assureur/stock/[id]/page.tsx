"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Wrapper from '../../../components/Wrapper'
import { getStockClientALaDate } from '../../../actions-assureur'
import { useStockSync } from '@/lib/stock-sync'

type Article = {
  id: string
  nom: string
  unite: string
  quantite: number
  prixAchat: number
  prixVente: number
  valeurAchat: number
  valeurVente: number
}

type StockClient = {
  client: {
    id: string
    name: string
    email: string | null
    telephone: string | null
    numeroPolice: string | null
    accesActif: boolean
  }
  date: string
  genereLe: string
  articles: Article[]
  totalQuantite: number
  totalValeurAchat: number
  totalValeurVente: number
}

// Date du jour au Burundi (AAAA-MM-JJ)
const aujourdhui = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Bujumbura' })

const fmt = (n: number) => Math.round(n).toLocaleString()

const page = () => {
  const params = useParams<{ id: string }>()
  const clientId = params.id

  const [dateStock, setDateStock] = useState(aujourdhui())
  const [stock, setStock] = useState<StockClient | null>(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [derniereMaj, setDerniereMaj] = useState<Date | null>(null)

  // Identifiant de la dernière consultation : une réponse plus ancienne est ignorée
  const derniereRequete = useRef(0)

  const consulter = useCallback(async (date: string) => {
    const numero = ++derniereRequete.current
    setStock(null)
    setErreur('')
    setChargement(true)
    try {
      const res = await getStockClientALaDate(clientId, date)
      if (numero !== derniereRequete.current) return
      if (res.success) {
        setStock(res as unknown as StockClient)
        setDerniereMaj(new Date())
      } else {
        setErreur(res.message)
      }
    } catch (error) {
      console.error(error)
      if (numero !== derniereRequete.current) return
      setErreur("Impossible de charger le stock. Vérifiez votre connexion et réessayez.")
    } finally {
      if (numero === derniereRequete.current) setChargement(false)
    }
  }, [clientId])

  useEffect(() => {
    consulter(dateStock)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulter])

  const changerDate = (date: string) => {
    setDateStock(date)
    if (date) consulter(date)
  }

  // Rechargement discret : ni spinner, ni effacement des données affichées.
  // En cas d'échec (réseau coupé...), les dernières données restent à l'écran.
  const rafraichir = async () => {
    if (chargement || !dateStock) return
    const numero = derniereRequete.current
    try {
      const res = await getStockClientALaDate(clientId, dateStock)
      if (numero !== derniereRequete.current) return
      if (res.success) {
        setStock(res as unknown as StockClient)
        setErreur('')
        setDerniereMaj(new Date())
      }
    } catch (error) {
      console.error(error)
    }
  }

  // Toutes les 30 secondes (onglet visible) et au retour sur l'onglet
  useStockSync(rafraichir, 30000)

  return (
    <Wrapper>
      <div className='space-y-4 font-bold'>
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <div>
            <p className='text-xs uppercase text-gray-600'>État du stock</p>
            <p className='text-lg font-black text-primary'>{stock?.client.name ?? '...'}</p>
            {stock?.client.numeroPolice && (
              <p className='text-xs text-gray-600'>RC : {stock.client.numeroPolice}</p>
            )}
          </div>
          <div className='flex items-end gap-2 print:hidden'>
            <div className='flex flex-col gap-1'>
              <label className='text-xs font-bold'>DATE</label>
              <input
                type='date'
                className='input input-bordered input-sm'
                value={dateStock}
                max={aujourdhui()}
                onChange={(e) => changerDate(e.target.value)}
              />
            </div>
            <button
              className='btn btn-sm btn-outline'
              disabled={!stock}
              suppressHydrationWarning
              onClick={() => window.print()}
            >
              IMPRIMER
            </button>
            <Link href='/assureur' className='btn btn-sm btn-ghost'>
              RETOUR
            </Link>
          </div>
        </div>

        {chargement && (
          <div className='flex justify-center py-6'>
            <span className='loading loading-spinner loading-md text-primary'></span>
          </div>
        )}

        {erreur && <p className='text-sm text-error normal-case'>{erreur}</p>}

        {stock && !chargement && (
          <>
            <p className='text-sm normal-case'>
              Stock au <span className='font-black'>{new Date(stock.date + 'T00:00:00').toLocaleDateString('fr-FR')}</span> (fin de journée)
            </p>

            <div className='grid md:grid-cols-3 gap-3'>
              <div className='border-2 border-base-200 rounded-3xl p-3 text-center'>
                <p className='text-xs uppercase text-gray-600'>Valeur à assurer (prix d&apos;achat)</p>
                <p className='text-xl font-black text-success'>{fmt(stock.totalValeurAchat)} FBU</p>
              </div>
              <div className='border-2 border-base-200 rounded-3xl p-3 text-center'>
                <p className='text-xs uppercase text-gray-600'>Valeur au prix de vente</p>
                <p className='text-xl font-black text-blue-600'>{fmt(stock.totalValeurVente)} FBU</p>
              </div>
              <div className='border-2 border-base-200 rounded-3xl p-3 text-center'>
                <p className='text-xs uppercase text-gray-600'>Articles en stock</p>
                <p className='text-xl font-black text-primary'>{stock.articles.length}</p>
              </div>
            </div>

            {stock.articles.length === 0 && (
              <p className='text-sm text-gray-500 normal-case'>Aucun stock à cette date.</p>
            )}

            {stock.articles.length > 0 && (
              <div className='overflow-x-auto'>
                <table className='table w-full'>
                  <thead>
                    <tr className='bg-success text-success-content text-xs uppercase'>
                      <th>Article</th>
                      <th>Unité</th>
                      <th className='text-right'>Quantité</th>
                      <th className='text-right'>Prix d&apos;achat</th>
                      <th className='text-right'>Valeur d&apos;achat</th>
                      <th className='text-right'>Prix de vente</th>
                      <th className='text-right'>Valeur de vente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stock.articles.map((a) => (
                      <tr key={a.id}>
                        <td>{a.nom}</td>
                        <td className='text-xs'>{a.unite}</td>
                        <td className='text-right'>{a.quantite.toLocaleString()}</td>
                        <td className='text-right'>{fmt(a.prixAchat)}</td>
                        <td className='text-right'>{fmt(a.valeurAchat)}</td>
                        <td className='text-right'>{fmt(a.prixVente)}</td>
                        <td className='text-right'>{fmt(a.valeurVente)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className='font-black'>
                      <td colSpan={2}>TOTAL</td>
                      <td className='text-right'>{stock.totalQuantite.toLocaleString()}</td>
                      <td></td>
                      <td className='text-right'>{fmt(stock.totalValeurAchat)}</td>
                      <td></td>
                      <td className='text-right'>{fmt(stock.totalValeurVente)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <p className='text-xs text-gray-500 normal-case'>
              Document généré le {new Date(stock.genereLe).toLocaleString('fr-FR')}. Les prix sont ceux du dernier approvisionnement enregistré à cette date.
            </p>

            {derniereMaj && (
              <p className='text-xs text-gray-400 normal-case print:hidden'>
                Actualisé automatiquement à {derniereMaj.toLocaleTimeString('fr-FR')}
              </p>
            )}
          </>
        )}
      </div>
    </Wrapper>
  )
}

export default page