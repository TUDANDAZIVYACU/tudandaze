"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Wrapper from '../components/Wrapper'
import { CelluleAbonnement, PaiementsClientModal, type AbonnementInfo } from '../components/abonnement-ui'
import {
  getMonAgentVendeur,
  getClientsAgentVendeur,
  getPaiementsClient,
  basculerAccesClient
} from '../actions-agentvendeur'

type MonAgentVendeur = {
  id: string
  nom: string
  code: string
  role: string
  superAgent: boolean
}

type ClientRow = {
  id: string
  name: string
  email: string | null
  telephone: string | null
  accesActif: boolean
  createdAt: Date
  abonnement: AbonnementInfo
  // Paiements confirmés dont la période payée est encore en cours (0 pour un essai ou un abonnement expiré)
  montantEnCours: number
  // Paiements confirmés faits sur la période choisie (toutes dates si aucune date) et leur nombre
  montantPaye: number
  nombrePaiements: number
}

// Fiche qui attend l'inscription du client : ni email ni téléphone de connexion
const estEnAttente = (c: ClientRow) => !c.email && !c.telephone

const page = () => {
  const [agentvendeur, setAgentVendeur] = useState<MonAgentVendeur | null>(null)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erreurChargement, setErreurChargement] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [codeCopie, setCodeCopie] = useState(false)
  // Filtre par dates des paiements (vide = toutes les dates)
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const derniereRequete = useRef(0)
  // Fenêtre « Paiements » d'un client
  const [clientPaiements, setClientPaiements] = useState<ClientRow | null>(null)

  const estAdmin = agentvendeur?.role === 'ADMIN'
  const datesInvalides = !!dateDebut && !!dateFin && dateDebut > dateFin
  const filtreDatesActif = !!dateDebut || !!dateFin

  const charger = useCallback(async () => {
    // Dates incohérentes : on garde l'affichage actuel et on avertit sous les champs
    if (dateDebut && dateFin && dateDebut > dateFin) {
      setLoading(false)
      return
    }
    // Si l'utilisateur change encore les dates avant la réponse, l'ancienne réponse est ignorée
    const numero = ++derniereRequete.current
    try {
      const [infos, liste] = await Promise.all([
        getMonAgentVendeur(),
        getClientsAgentVendeur(dateDebut || undefined, dateFin || undefined)
      ])
      if (numero !== derniereRequete.current) return
      setAgentVendeur(infos)
      setClients(liste as ClientRow[])
      setErreurChargement(false)
    } catch (error) {
      console.error(error)
      if (numero === derniereRequete.current) setErreurChargement(true)
    } finally {
      if (numero === derniereRequete.current) setLoading(false)
    }
  }, [dateDebut, dateFin])

  useEffect(() => {
    charger()
  }, [charger])

  const copierCode = async () => {
    if (!agentvendeur) return
    try {
      await navigator.clipboard.writeText(agentvendeur.code)
      setCodeCopie(true)
      setTimeout(() => setCodeCopie(false), 2000)
    } catch (error) {
      console.error(error)
      alert(`Code : ${agentvendeur.code}`)
    }
  }

  const basculer = async (client: ClientRow) => {
    if (client.accesActif && !confirm(`Suspendre l'accès de ${client.name} ?`)) return
    try {
      const res = await basculerAccesClient(client.id, !client.accesActif)
      if (res.success) {
        setClients((prev) =>
          prev.map((c) => (c.id === client.id ? { ...c, accesActif: !client.accesActif } : c))
        )
      } else {
        alert(res.message)
      }
    } catch (error) {
      console.error(error)
      alert("Erreur réseau. Réessayez.")
    }
  }

  const clientsFiltres = clients.filter((c) => {
    const texte = recherche.trim().toLowerCase()
    if (!texte) return true
    return [c.name, c.email, c.telephone]
      .filter(Boolean)
      .some((valeur) => (valeur as string).toLowerCase().includes(texte))
  })

  if (loading) {
    return (
      <Wrapper>
        <div className='flex justify-center py-10'>
          <span className='loading loading-spinner loading-md text-primary'></span>
        </div>
      </Wrapper>
    )
  }

  if (erreurChargement || !agentvendeur) {
    return (
      <Wrapper>
        <div className='rounded-2xl bg-base-100 shadow-sm p-6 text-center font-bold'>
          <p>Impossible de charger votre espace agentvendeur.</p>
          <p className='text-sm text-gray-500 normal-case mt-2'>
            Vérifiez votre connexion, ou contactez l&apos;administrateur si le problème persiste.
          </p>
          <button className='btn btn-sm btn-primary mt-4' onClick={() => { setLoading(true); charger() }}>
            RÉESSAYER
          </button>
        </div>
      </Wrapper>
    )
  }

  const enAttente = clients.filter(estEnAttente).length
  // Un client « en attente » n'est pas encore inscrit : il n'a pas d'accès en cours
  const accesActifs = clients.filter((c) => c.accesActif && !estEnAttente(c)).length
  // Sans dates : montant des abonnements payés encore en cours (période payée) ; avec dates : paiements confirmés de la période
  const abonnementsPayes = clients.filter((c) => c.montantEnCours > 0)
  const nombrePaiements = clients.reduce((total, c) => total + c.nombrePaiements, 0)
  const totalAbonnements = filtreDatesActif
    ? clients.reduce((total, c) => total + c.montantPaye, 0)
    : clients.reduce((total, c) => total + c.montantEnCours, 0)

  return (
    <Wrapper>
      <div className='space-y-4 font-bold'>

        <h1 className='flex flex-wrap items-center gap-2 text-lg font-bold text-error'>
          ESPACE {agentvendeur.superAgent ? 'SUPER ' : ''}AGENTVENDEUR — {agentvendeur.nom}
          {agentvendeur.superAgent && <span className='badge badge-primary font-bold'>Stock et IN/OUT</span>}
        </h1>

        {/* FILTRE PAR DATES : période des paiements d'abonnement comptés dans le total */}
        <div className='rounded-2xl bg-base-100 shadow-sm p-3'>
          <div className='flex flex-wrap items-end gap-3'>
            <label className='flex flex-col gap-1'>
              <span className='text-xs uppercase text-gray-600'>Paiements du</span>
              <input
                type='date'
                className='input input-bordered input-sm'
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <span className='text-xs uppercase text-gray-600'>Au</span>
              <input
                type='date'
                className='input input-bordered input-sm'
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
              />
            </label>
            {filtreDatesActif && (
              <button
                type='button'
                className='btn btn-sm btn-ghost'
                onClick={() => { setDateDebut(''); setDateFin('') }}
              >
                TOUTES LES DATES
              </button>
            )}
          </div>
          {datesInvalides && (
            <p className='mt-2 text-xs text-error normal-case'>La date de début doit être avant la date de fin.</p>
          )}
        </div>

        {/* RÉSUMÉ */}
        <div className='grid md:grid-cols-3 gap-3'>
          <div className='rounded-2xl bg-base-100 shadow-sm p-4 text-center'>
            <p className='text-xs uppercase text-gray-600'>Clients</p>
            <p className='text-2xl font-black text-red'>{clients.length}</p>
            {enAttente > 0 && (
              <p className='text-xs text-gray-600 normal-case'>dont {enAttente} en attente d&apos;inscription</p>
            )}
          </div>
          <div className='rounded-2xl bg-base-100 shadow-sm p-4 text-center'>
            <p className='text-xs uppercase text-gray-600'>Accès actifs</p>
            <p className='text-2xl font-black text-success'>{accesActifs}</p>
          </div>
          <div className='rounded-2xl bg-base-100 shadow-sm p-4 text-center'>
            <p className='text-xs uppercase text-gray-600'>
              {filtreDatesActif ? 'Paiements sur la période' : 'Abonnements actifs'}
            </p>
            <p className='text-2xl font-black text-success tabular-nums'>
              {totalAbonnements.toLocaleString('fr-FR')}{' '}
              <span className='text-sm font-bold text-gray-600'>FBU</span>
            </p>
            <p className='text-xs text-gray-600 normal-case'>
              {filtreDatesActif
                ? `${nombrePaiements} paiement${nombrePaiements > 1 ? 's' : ''} confirmé${nombrePaiements > 1 ? 's' : ''}`
                : `${abonnementsPayes.length} abonnement${abonnementsPayes.length > 1 ? 's' : ''} payé${abonnementsPayes.length > 1 ? 's' : ''} en cours`}
            </p>
          </div>
        </div>

        {/* CODE AGENTVENDEUR : à donner aux clients, qui s'enregistrent eux-mêmes */}
        {estAdmin && (
          <div className='rounded-2xl bg-base-100 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3'>
            <div>
              <p className='text-xs uppercase text-gray-600'>Votre code agentvendeur</p>
              <p className='text-2xl font-black text-success tracking-widest'>{agentvendeur.code}</p>
              <p className='text-xs text-gray-600 normal-case'>
                Donnez ce code à vos clients : ils créent leur compte et s&apos;enregistrent eux-mêmes.
              </p>
            </div>
            <button className='btn btn-sm btn-primary' onClick={copierCode}>
              {codeCopie ? 'COPIÉ ✓' : 'COPIER LE CODE'}
            </button>
          </div>
        )}

        {/* MES CLIENTS */}
        <div className='rounded-2xl bg-base-100 shadow-sm p-4'>
          <div className='flex flex-wrap items-center justify-between gap-2 mb-3'>
            <p className='text-sm uppercase text-gray-600'>Mes clients</p>
            <input
              type='text'
              className='input input-bordered input-sm normal-case'
              placeholder='Rechercher...'
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>

          {clients.length === 0 && (
            <p className='text-sm text-gray-500 normal-case'>
              Aucun client pour le moment.{estAdmin ? ' Donnez votre code à vos clients : ils apparaîtront ici dès leur inscription.' : ''}
            </p>
          )}

          {clients.length > 0 && clientsFiltres.length === 0 && (
            <p className='text-sm text-gray-500 normal-case'>Aucun client ne correspond à la recherche.</p>
          )}

          {clientsFiltres.length > 0 && (
            <div className='overflow-x-auto'>
              <table className='table w-full'>
                <thead>
                  <tr className='text-xs uppercase text-gray-600'>
                    <th>Client</th>
                    <th>Contact</th>
                    <th>Abonnement</th>
                    <th>Accès</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {clientsFiltres.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className='text-xs normal-case'>
                        {c.email && <div>{c.email}</div>}
                        {c.telephone && <div>{c.telephone}</div>}
                        {estEnAttente(c) && <div className='text-gray-500'>—</div>}
                      </td>
                      <td>
                        <CelluleAbonnement abonnement={c.abonnement} />
                      </td>
                      <td>
                        {estEnAttente(c) ? (
                          <span className='badge badge-warning'>En attente</span>
                        ) : (
                          <span className={`badge ${c.accesActif ? 'badge-success' : 'badge-error'}`}>
                            {c.accesActif ? 'Actif' : 'Suspendu'}
                          </span>
                        )}
                      </td>
                      <td className='whitespace-nowrap'>
                        {agentvendeur.superAgent && (
                          <>
                            <Link href={`/agentvendeur/variation/${c.id}`} className='btn btn-xs btn-secondary mr-1'>
                              IN/OUT
                            </Link>
                            <Link href={`/agentvendeur/stock/${c.id}`} className='btn btn-xs btn-primary mr-1'>
                              STOCK
                            </Link>
                          </>
                        )}
                        <button className='btn btn-xs btn-secondary mr-1' onClick={() => setClientPaiements(c)}>
                          PAIEMENTS
                        </button>
                        {estAdmin && (
                          <button className='btn btn-xs btn-ghost' onClick={() => basculer(c)}>
                            {c.accesActif ? 'SUSPENDRE' : 'RÉACTIVER'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* FENÊTRE : HISTORIQUE DES PAIEMENTS D'UN CLIENT */}
      {clientPaiements && (
        <PaiementsClientModal
          key={clientPaiements.id}
          clientNom={clientPaiements.name}
          dateDebut={dateDebut}
          dateFin={dateFin}
          charger={() => getPaiementsClient(clientPaiements.id, dateDebut || undefined, dateFin || undefined)}
          onClose={() => setClientPaiements(null)}
        />
      )}
    </Wrapper>
  )
}

export default page
