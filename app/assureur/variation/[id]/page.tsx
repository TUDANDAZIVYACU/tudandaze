"use client";
import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Wrapper from '../../../components/Wrapper'
import { getVariationStockClient } from '../../../actions-assureur'
import { useStockSync } from '@/lib/stock-sync'

type ArticleVariation = {
  id: string
  nom: string
  unite: string
  quantiteDebut: number
  quantiteFin: number
  entrees: number
  sorties: number
  variationQuantite: number
  prixAchat: number
  valeurDebut: number
  valeurFin: number
  variationValeur: number
}

type Approvisionnement = {
  id: string
  date: string
  article: string
  unite: string
  quantite: number
  prixAchat: number
  total: number
  factureUrl: string | null
}

type Variation = {
  client: { id: string; name: string; numeroPolice: string | null }
  dateDebut: string
  dateFin: string
  genereLe: string
  articles: ArticleVariation[]
  approvisionnements: Approvisionnement[]
  totalValeurDebut: number
  totalValeurFin: number
  totalVariationValeur: number
}

// Date du jour au Burundi (AAAA-MM-JJ)
const aujourdhui = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Bujumbura' })
// Premier jour du mois courant
const debutDuMois = () => aujourdhui().slice(0, 8) + '01'

const fmt = (n: number) => Math.round(n).toLocaleString()
const signe = (n: number) => (n > 0 ? '+' : '') + Math.round(n).toLocaleString()
const couleur = (n: number) => (n > 0 ? 'text-success' : n < 0 ? 'text-error' : '')
const dateFr = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR')

const page = () => {
  const params = useParams<{ id: string }>()
  const clientId = params.id

  const [dateDebut, setDateDebut] = useState(debutDuMois())
  const [dateFin, setDateFin] = useState(aujourdhui())
  const [data, setData] = useState<Variation | null>(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [derniereMaj, setDerniereMaj] = useState<Date | null>(null)

  // Identifiant de la dernière requête : une réponse plus ancienne est ignorée
  const derniereRequete = useRef(0)

  // Calcul automatique dès que la période change
  useEffect(() => {
    // Date incomplète pendant la saisie : on attend
    if (!dateDebut || !dateFin) return

    if (dateDebut > dateFin) {
      derniereRequete.current += 1
      setData(null)
      setErreur('La date de début doit être avant la date de fin.')
      setChargement(false)
      return
    }

    const numero = ++derniereRequete.current
    setData(null)
    setErreur('')
    setChargement(true)

    ;(async () => {
      try {
        const res = await getVariationStockClient(clientId, dateDebut, dateFin)
        if (numero !== derniereRequete.current) return
        if (res.success) {
          setData(res as unknown as Variation)
          setDerniereMaj(new Date())
        } else {
          setErreur(res.message)
        }
      } catch (error) {
        console.error(error)
        if (numero !== derniereRequete.current) return
        setErreur("Impossible de charger la variation. Vérifiez votre connexion et réessayez.")
      } finally {
        if (numero === derniereRequete.current) setChargement(false)
      }
    })()
  }, [clientId, dateDebut, dateFin])

  // Rechargement discret : ni spinner, ni effacement des données affichées.
  // En cas d'échec (réseau coupé...), les dernières données restent à l'écran.
  const rafraichir = async () => {
    if (chargement || !dateDebut || !dateFin || dateDebut > dateFin) return
    const numero = derniereRequete.current
    try {
      const res = await getVariationStockClient(clientId, dateDebut, dateFin)
      if (numero !== derniereRequete.current) return
      if (res.success) {
        setData(res as unknown as Variation)
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
            <p className='text-xs uppercase text-gray-600'>Variation de stock</p>
            <p className='text-lg font-black text-primary'>{data?.client.name ?? '...'}</p>
            {data?.client.numeroPolice && (
              <p className='text-xs text-gray-600'>RC : {data.client.numeroPolice}</p>
            )}
          </div>
          <div className='flex flex-wrap items-end gap-2 print:hidden'>
            <div className='flex flex-col gap-1'>
              <label className='text-xs font-bold'>DU</label>
              <input
                type='date'
                className='input input-bordered input-sm'
                value={dateDebut}
                max={dateFin || aujourdhui()}
                onChange={(e) => setDateDebut(e.target.value)}
              />
            </div>
            <div className='flex flex-col gap-1'>
              <label className='text-xs font-bold'>AU</label>
              <input
                type='date'
                className='input input-bordered input-sm'
                value={dateFin}
                min={dateDebut}
                max={aujourdhui()}
                onChange={(e) => setDateFin(e.target.value)}
              />
            </div>
            <button
              className='btn btn-sm btn-outline'
              disabled={!data || chargement}
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

        {data && !chargement && (
          <>
            <p className='text-sm normal-case'>
              Période du <span className='font-black'>{dateFr(data.dateDebut)}</span> au{' '}
              <span className='font-black'>{dateFr(data.dateFin)}</span> (stock initial : début de période ;
              stock final : fin de journée du {dateFr(data.dateFin)})
            </p>

            <div className='grid md:grid-cols-3 gap-3'>
              <div className='border-2 border-base-200 rounded-3xl p-3 text-center'>
                <p className='text-xs uppercase text-gray-600'>Valeur initiale (prix d&apos;achat)</p>
                <p className='text-xl font-black text-primary'>{fmt(data.totalValeurDebut)} FBU</p>
              </div>
              <div className='border-2 border-base-200 rounded-3xl p-3 text-center'>
                <p className='text-xs uppercase text-gray-600'>Valeur finale (prix d&apos;achat)</p>
                <p className='text-xl font-black text-success'>{fmt(data.totalValeurFin)} FBU</p>
              </div>
              <div className='border-2 border-base-200 rounded-3xl p-3 text-center'>
                <p className='text-xs uppercase text-gray-600'>Variation</p>
                <p className={`text-xl font-black ${couleur(data.totalVariationValeur)}`}>
                  {signe(data.totalVariationValeur)} FBU
                </p>
              </div>
            </div>

            {data.articles.length === 0 && (
              <p className='text-sm text-gray-500 normal-case'>Aucun stock sur cette période.</p>
            )}

            {data.articles.length > 0 && (
              <div className='overflow-x-auto'>
                <table className='table w-full'>
                  <thead>
                    <tr className='bg-success text-success-content text-xs uppercase'>
                      <th>Article</th>
                      <th>Unité</th>
                      <th className='text-right'>Qté initiale</th>
                      <th className='text-right'>Entrées</th>
                      <th className='text-right'>Sorties</th>
                      <th className='text-right'>Qté finale</th>
                      <th className='text-right'>Variation qté</th>
                      <th className='text-right'>Valeur initiale</th>
                      <th className='text-right'>Valeur finale</th>
                      <th className='text-right'>Variation valeur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.articles.map((a) => (
                      <tr key={a.id}>
                        <td>{a.nom}</td>
                        <td className='text-xs'>{a.unite}</td>
                        <td className='text-right'>{a.quantiteDebut.toLocaleString()}</td>
                        <td className='text-right text-success'>
                          {a.entrees > 0 ? '+' + a.entrees.toLocaleString() : '0'}
                        </td>
                        <td className='text-right text-error'>
                          {a.sorties > 0 ? '-' + a.sorties.toLocaleString() : '0'}
                        </td>
                        <td className='text-right'>{a.quantiteFin.toLocaleString()}</td>
                        <td className={`text-right ${couleur(a.variationQuantite)}`}>
                          {a.variationQuantite > 0 ? '+' : ''}{a.variationQuantite.toLocaleString()}
                        </td>
                        <td className='text-right'>{fmt(a.valeurDebut)}</td>
                        <td className='text-right'>{fmt(a.valeurFin)}</td>
                        <td className={`text-right ${couleur(a.variationValeur)}`}>{signe(a.variationValeur)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className='font-black'>
                      <td colSpan={7}>TOTAL</td>
                      <td className='text-right'>{fmt(data.totalValeurDebut)}</td>
                      <td className='text-right'>{fmt(data.totalValeurFin)}</td>
                      <td className={`text-right ${couleur(data.totalVariationValeur)}`}>
                        {signe(data.totalVariationValeur)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* APPROVISIONNEMENTS DE LA PÉRIODE, avec lien vers la photo de la facture */}
            {data.approvisionnements.length > 0 && (
              <div className='space-y-2'>
                <p className='text-sm uppercase text-gray-600'>Approvisionnements de la période</p>
                <div className='overflow-x-auto'>
                  <table className='table w-full'>
                    <thead>
                      <tr className='bg-success text-success-content text-xs uppercase'>
                        <th>Date</th>
                        <th>Article</th>
                        <th className='text-right'>Quantité</th>
                        <th className='text-right'>Prix d&apos;achat</th>
                        <th className='text-right'>Total achat</th>
                        <th className='print:hidden'>Facture</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.approvisionnements.map((a) => (
                        <tr key={a.id}>
                          <td>{new Date(a.date).toLocaleDateString('fr-FR')}</td>
                          <td>{a.article}</td>
                          <td className='text-right'>{a.quantite.toLocaleString()} {a.unite}</td>
                          <td className='text-right'>{fmt(a.prixAchat)}</td>
                          <td className='text-right'>{fmt(a.total)}</td>
                          <td className='print:hidden'>
                            {a.factureUrl && a.factureUrl.startsWith('https://') ? (
                              <a
                                href={a.factureUrl}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='link link-primary text-xs'
                              >
                                Voir la facture
                              </a>
                            ) : (
                              <span className='text-xs text-gray-400'>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className='text-xs text-gray-500 normal-case'>
              Document généré le {new Date(data.genereLe).toLocaleString('fr-FR')}. Les valeurs sont calculées au prix du dernier approvisionnement enregistré à chaque date.
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