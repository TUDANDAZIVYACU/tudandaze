"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Wrapper from '../components/Wrapper'
import { CelluleAbonnement, PaiementsClientModal, type AbonnementInfo } from '../components/abonnement-ui'
import {
  getAgentVendeurs,
  creerAgentVendeur,
  basculerAgentVendeurActif,
  getClientsOwner,
  getPaiementsClientOwner,
  rattacherClient,
  basculerAccesClientOwner
} from '../actions-owner'

type AgentVendeurRow = {
  id: string
  code: string
  nom: string
  email: string | null
  telephone: string | null
  actif: boolean
  createdAt: Date
  nombreClients: number
}

type ClientOwnerRow = {
  id: string
  name: string
  email: string | null
  telephone: string | null
  accesActif: boolean
  agentvendeurId: string | null
  agentvendeurNom: string | null
  agentvendeurCode: string | null
  abonnement: AbonnementInfo
  // Paiements confirmés dont la période payée est encore en cours (0 pour un essai ou un abonnement expiré)
  montantEnCours: number
  // Paiements confirmés faits sur la période choisie (toutes dates si aucune date) et leur nombre
  montantPaye: number
  nombrePaiements: number
}

type ResultatAction = { success: true } | { success: false; message: string }

const formAgentVendeurVide = { nom: '', email: '', telephone: '', adminNom: '' }

const page = () => {
  const [onglet, setOnglet] = useState<'agentvendeurs' | 'clients'>('agentvendeurs')
  const [agentvendeurs, setAgentVendeurs] = useState<AgentVendeurRow[]>([])
  const [clients, setClients] = useState<ClientOwnerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erreurChargement, setErreurChargement] = useState(false)
  const [message, setMessage] = useState('')
  const [enCours, setEnCours] = useState(false)

  const [formAgentVendeur, setFormAgentVendeur] = useState(formAgentVendeurVide)
  const [recherche, setRecherche] = useState('')
  // Agents dont la liste de clients est repliée (true = repliée)
  const [clientsReplies, setClientsReplies] = useState<Record<string, boolean>>({})

  // Filtre par dates des paiements (vide = toutes les dates)
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const derniereRequete = useRef(0)
  // Fenêtre « Paiements » d'un client
  const [clientPaiements, setClientPaiements] = useState<ClientOwnerRow | null>(null)

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
      const [listeAgentVendeurs, listeClients] = await Promise.all([
        getAgentVendeurs(),
        getClientsOwner(dateDebut || undefined, dateFin || undefined)
      ])
      if (numero !== derniereRequete.current) return
      setAgentVendeurs(listeAgentVendeurs as AgentVendeurRow[])
      setClients(listeClients as ClientOwnerRow[])
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

  // Lance une action serveur, affiche l'éventuelle erreur et recharge les données en cas de succès
  const lancer = async (action: () => Promise<ResultatAction>): Promise<boolean> => {
    setMessage('')
    setEnCours(true)
    try {
      const res = await action()
      if (!res.success) {
        setMessage(res.message)
        return false
      }
      await charger()
      return true
    } catch (error) {
      console.error(error)
      setMessage('Erreur réseau. Réessayez.')
      return false
    } finally {
      setEnCours(false)
    }
  }

  const creer = async () => {
    const ok = await lancer(() => creerAgentVendeur(formAgentVendeur))
    if (ok) setFormAgentVendeur(formAgentVendeurVide)
  }

  const basculerAgentVendeur = async (a: AgentVendeurRow) => {
    const question = a.actif
      ? `Suspendre ${a.nom} ? Ses utilisateurs et tous ses clients perdront l'accès.`
      : `Réactiver ${a.nom} ?`
    if (!confirm(question)) return
    await lancer(() => basculerAgentVendeurActif(a.id, !a.actif))
  }

  const changerAgentVendeurClient = async (client: ClientOwnerRow, agentvendeurId: string) => {
    await lancer(() => rattacherClient(client.id, agentvendeurId || null))
  }

  const basculerClient = async (client: ClientOwnerRow) => {
    if (client.accesActif && !confirm(`Suspendre l'accès de ${client.name} ?`)) return
    await lancer(() => basculerAccesClientOwner(client.id, !client.accesActif))
  }

  const basculerRepli = (agentvendeurId: string) =>
    setClientsReplies((prev) => ({ ...prev, [agentvendeurId]: !prev[agentvendeurId] }))

  const clientsFiltres = clients.filter((c) => {
    const texte = recherche.trim().toLowerCase()
    if (!texte) return true
    return [c.name, c.email, c.telephone, c.agentvendeurNom]
      .filter(Boolean)
      .some((valeur) => (valeur as string).toLowerCase().includes(texte))
  })

  const clientsSansAgentVendeur = clients.filter((c) => !c.agentvendeurId).length

  if (loading) {
    return (
      <Wrapper>
        <div className='flex justify-center py-10 font-bold'>
          <span className='loading loading-spinner loading-md text-primary'></span>
        </div>
      </Wrapper>
    )
  }

  if (erreurChargement) {
    return (
      <Wrapper>
        <div className='border-2 border-base-200 rounded-3xl p-6 text-center font-bold'>
          <p className='font-bold'>Impossible de charger l&apos;administration.</p>
          <p className='text-sm text-gray-500 normal-case mt-2 font-bold'>
            Vérifiez votre connexion et que votre email figure dans SUPER_ADMIN_EMAILS.
          </p>
          <button className='btn btn-sm btn-primary mt-4 font-bold' onClick={() => { setLoading(true); charger() }}>
            RÉESSAYER
          </button>
        </div>
      </Wrapper>
    )
  }

  // Chiffres du tableau de bord, sur tous les clients de tous les agents vendeurs
  const accesActifs = clients.filter((c) => c.accesActif).length
  // Sans dates : montant des abonnements payés encore en cours (période payée) ; avec dates : paiements confirmés de la période
  const abonnementsPayes = clients.filter((c) => c.montantEnCours > 0)
  const nombrePaiements = clients.reduce((total, c) => total + c.nombrePaiements, 0)
  const totalAbonnements = filtreDatesActif
    ? clients.reduce((total, c) => total + c.montantPaye, 0)
    : clients.reduce((total, c) => total + c.montantEnCours, 0)

  return (
    <Wrapper>
      <div className='space-y-4 font-bold'>

        <h1 className='text-lg font-bold text-red-500'>ADMINISTRATION DE L&apos;APPLICATION</h1>

        {/* FILTRE PAR DATES : période des paiements d'abonnement comptés dans le total */}
        <div className='border-2 border-base-200 rounded-3xl p-3'>
          <div className='flex flex-wrap items-end gap-3'>
            <label className='flex flex-col gap-1'>
              <span className='text-xs uppercase text-gray-700'>Paiements du</span>
              <input
                type='date'
                className='input input-bordered input-sm font-bold'
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <span className='text-xs uppercase text-gray-700'>Au</span>
              <input
                type='date'
                className='input input-bordered input-sm font-bold'
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
              />
            </label>
            {filtreDatesActif && (
              <button
                type='button'
                className='btn btn-sm btn-ghost font-bold'
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

        {/* TABLEAU DE BORD */}
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center font-bold'>
            <p className='text-xs uppercase text-gray-700 font-bold'>Agents vendeurs</p>
            <p className='text-2xl font-black text-red-500'>{agentvendeurs.length}</p>
          </div>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center font-bold'>
            <p className='text-xs uppercase text-gray-700 font-bold'>Clients</p>
            <p className='text-2xl font-black text-success'>{clients.length}</p>
            {clientsSansAgentVendeur > 0 && (
              <p className='text-xs text-blue-600 normal-case'>dont {clientsSansAgentVendeur} sans agent vendeur</p>
            )}
          </div>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center font-bold'>
            <p className='text-xs uppercase text-gray-700 font-bold'>Accès actifs</p>
            <p className='text-2xl font-black text-success'>{accesActifs}</p>
          </div>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center font-bold'>
            <p className='text-xs uppercase text-gray-700 font-bold'>
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

        <div className='tabs tabs-boxed w-fit font-bold'>
          <button
            className={`tab font-bold ${onglet === 'agentvendeurs' ? 'tab-active' : ''}`}
            onClick={() => setOnglet('agentvendeurs')}
          >
            AGENTS VENDEURS
          </button>
          <button
            className={`tab font-bold ${onglet === 'clients' ? 'tab-active' : ''}`}
            onClick={() => setOnglet('clients')}
          >
            TOUS LES CLIENTS
          </button>
        </div>

        {message && (
          <div className='border-2 border-error rounded-3xl p-3 text-sm text-error normal-case font-bold'>
            {message}
          </div>
        )}

        {/* ONGLET AGENTS VENDEURS : chaque agent avec ses clients */}
        {onglet === 'agentvendeurs' && (
          <div className='space-y-4'>

            <div className='border-2 border-base-200 rounded-3xl p-4 space-y-3 font-bold'>
              <p className='text-sm uppercase text-gray-700 font-bold'>Nouvel agent vendeur</p>
              <div className='grid md:grid-cols-2 gap-3'>
                <input
                  type='text'
                  className='input input-bordered font-bold placeholder:font-bold'
                  placeholder="Nom de l'agent vendeur *"
                  value={formAgentVendeur.nom}
                  onChange={(e) => setFormAgentVendeur({ ...formAgentVendeur, nom: e.target.value })}
                />
                <input
                  type='text'
                  className='input input-bordered font-bold placeholder:font-bold'
                  placeholder="Nom de l'administrateur"
                  value={formAgentVendeur.adminNom}
                  onChange={(e) => setFormAgentVendeur({ ...formAgentVendeur, adminNom: e.target.value })}
                />
                <input
                  type='email'
                  className='input input-bordered normal-case font-bold placeholder:font-bold'
                  placeholder="Email de l'administrateur"
                  value={formAgentVendeur.email}
                  onChange={(e) => setFormAgentVendeur({ ...formAgentVendeur, email: e.target.value })}
                />
                <input
                  type='tel'
                  className='input input-bordered font-bold placeholder:font-bold'
                  placeholder="Téléphone de l'administrateur"
                  value={formAgentVendeur.telephone}
                  onChange={(e) => setFormAgentVendeur({ ...formAgentVendeur, telephone: e.target.value })}
                />
              </div>
              <p className='text-xs text-gray-700 normal-case font-bold'>
                Renseignez au moins l&apos;email ou le téléphone : l&apos;administrateur s&apos;en servira pour se connecter.
              </p>
              <button className='btn btn-sm btn-primary font-bold' disabled={enCours} onClick={creer}>
                {enCours ? <span className='loading loading-spinner loading-sm'></span> : 'CRÉER L\'AGENT VENDEUR'}
              </button>
            </div>

            {agentvendeurs.length === 0 && (
              <p className='text-sm text-gray-600 normal-case font-bold'>Aucun agent vendeur pour le moment.</p>
            )}

            {agentvendeurs.map((a) => {
              const clientsDeLAgent = clients.filter((c) => c.agentvendeurId === a.id)
              const replie = !!clientsReplies[a.id]
              return (
                <div key={a.id} className='border-2 border-base-200 rounded-3xl p-4 space-y-3 font-bold'>
                  <div>
                    <p className='text-lg font-black text-success'>{a.nom}</p>
                    {/* Même ligne : code + clients à gauche, Actif + SUSPENDRE à droite */}
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <p className='text-xs text-red-500 font-bold'>
                        Code {a.code} · {a.nombreClients} client{a.nombreClients > 1 ? 's' : ''}
                      </p>
                      <div className='flex items-center gap-2'>
                        <span className={`badge font-bold ${a.actif ? 'badge-success' : 'badge-error'}`}>
                          {a.actif ? 'Actif' : 'Suspendu'}
                        </span>
                        <button className='btn btn-xs btn-ghost font-bold' disabled={enCours} onClick={() => basculerAgentVendeur(a)}>
                          {a.actif ? 'SUSPENDRE' : 'RÉACTIVER'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* CLIENTS DE CET AGENT VENDEUR */}
                  <div className='rounded-2xl bg-base-200 p-3 space-y-2'>
                    <div className='flex items-center justify-between gap-2'>
                      <p className='text-xs uppercase text-gray-700 font-bold'>
                        Clients ({clientsDeLAgent.length})
                      </p>
                      {clientsDeLAgent.length > 0 && (
                        <button className='btn btn-xs btn-ghost font-bold' onClick={() => basculerRepli(a.id)}>
                          {replie ? 'AFFICHER' : 'MASQUER'}
                        </button>
                      )}
                    </div>

                    {clientsDeLAgent.length === 0 && (
                      <p className='text-xs text-gray-600 normal-case font-bold'>Aucun client pour cet agent vendeur.</p>
                    )}

                    {clientsDeLAgent.length > 0 && !replie && (
                      <div className='overflow-x-auto'>
                        <table className='table table-sm w-full font-bold'>
                          <thead>
                            <tr className='text-xs uppercase text-gray-700 font-bold'>
                              <th className='font-bold'>Client</th>
                              <th className='font-bold'>Contact</th>
                              <th className='font-bold'>Abonnement</th>
                              <th className='font-bold'>Accès</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {clientsDeLAgent.map((c) => (
                              <tr key={c.id} className='font-bold'>
                                <td>{c.name}</td>
                                <td className='text-xs normal-case'>
                                  {c.email && <div>{c.email}</div>}
                                  {c.telephone && <div>{c.telephone}</div>}
                                </td>
                                <td>
                                  <CelluleAbonnement abonnement={c.abonnement} />
                                </td>
                                <td>
                                  <span className={`badge font-bold ${c.accesActif ? 'badge-success' : 'badge-error'}`}>
                                    {c.accesActif ? 'Actif' : 'Suspendu'}
                                  </span>
                                </td>
                                <td className='whitespace-nowrap'>
                                  <button className='btn btn-xs btn-secondary mr-1 font-bold' onClick={() => setClientPaiements(c)}>
                                    PAIEMENTS
                                  </button>
                                  <button className='btn btn-xs btn-ghost font-bold' disabled={enCours} onClick={() => basculerClient(c)}>
                                    {c.accesActif ? 'SUSPENDRE' : 'RÉACTIVER'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ONGLET TOUS LES CLIENTS : rattachement à un agent vendeur */}
        {onglet === 'clients' && (
          <div className='border-2 border-base-200 rounded-3xl p-4 space-y-3 font-bold'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <p className='text-sm uppercase text-gray-700 font-bold'>Tous les clients</p>
              <input
                type='text'
                className='input input-bordered input-sm normal-case font-bold placeholder:font-bold'
                placeholder='Rechercher...'
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
              />
            </div>

            {clientsFiltres.length === 0 && (
              <p className='text-sm text-gray-700 normal-case font-bold'>Aucun client à afficher.</p>
            )}

            {clientsFiltres.length > 0 && (
              <div className='overflow-x-auto'>
                <table className='table w-full font-bold'>
                  <thead>
                    <tr className='text-xs uppercase text-gray-700 font-bold'>
                      <th className='font-bold'>Client</th>
                      <th className='font-bold'>Contact</th>
                      <th className='font-bold'>Agent vendeur</th>
                      <th className='font-bold'>Abonnement</th>
                      <th className='font-bold'>Accès</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientsFiltres.map((c) => (
                      <tr key={c.id} className='font-bold'>
                        <td>{c.name}</td>
                        <td className='text-xs normal-case'>
                          {c.email && <div>{c.email}</div>}
                          {c.telephone && <div>{c.telephone}</div>}
                        </td>
                        <td>
                          <select
                            className='select select-bordered select-sm font-bold'
                            value={c.agentvendeurId ?? ''}
                            disabled={enCours}
                            onChange={(e) => changerAgentVendeurClient(c, e.target.value)}
                          >
                            <option className='font-bold' value=''>— Aucun —</option>
                            {agentvendeurs.map((a) => (
                              <option className='font-bold' key={a.id} value={a.id}>{a.nom}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <CelluleAbonnement abonnement={c.abonnement} />
                        </td>
                        <td className='whitespace-nowrap'>
                          <span className={`badge mr-2 font-bold ${c.accesActif ? 'badge-success' : 'badge-error'}`}>
                            {c.accesActif ? 'Actif' : 'Suspendu'}
                          </span>
                          <button className='btn btn-xs btn-ghost font-bold' disabled={enCours} onClick={() => basculerClient(c)}>
                            {c.accesActif ? 'SUSPENDRE' : 'RÉACTIVER'}
                          </button>
                        </td>
                        <td className='whitespace-nowrap'>
                          <button className='btn btn-xs btn-secondary font-bold' onClick={() => setClientPaiements(c)}>
                            PAIEMENTS
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FENÊTRE : HISTORIQUE DES PAIEMENTS D'UN CLIENT */}
      {clientPaiements && (
        <PaiementsClientModal
          key={clientPaiements.id}
          clientNom={clientPaiements.name}
          dateDebut={dateDebut}
          dateFin={dateFin}
          charger={() => getPaiementsClientOwner(clientPaiements.id, dateDebut || undefined, dateFin || undefined)}
          onClose={() => setClientPaiements(null)}
        />
      )}
    </Wrapper>
  )
}

export default page
