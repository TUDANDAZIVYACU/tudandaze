"use client";
import React, { useCallback, useEffect, useState } from 'react'
import Wrapper from '../components/Wrapper'
import {
  getAssureurs,
  creerAssureur,
  basculerAssureurActif,
  ajouterUtilisateurAssureur,
  supprimerUtilisateurAssureur,
  getClientsOwner,
  rattacherClient,
  basculerAccesClientOwner
} from '../actions-owner'

type UtilisateurRow = {
  id: string
  email: string | null
  telephone: string | null
  nom: string | null
  role: string
  connecte: boolean
}

type AssureurRow = {
  id: string
  code: string
  nom: string
  email: string | null
  telephone: string | null
  actif: boolean
  createdAt: Date
  nombreClients: number
  utilisateurs: UtilisateurRow[]
}

type ClientOwnerRow = {
  id: string
  name: string
  email: string | null
  telephone: string | null
  numeroPolice: string | null
  accesActif: boolean
  assureurId: string | null
  assureurNom: string | null
  assureurCode: string | null
}

type ResultatAction = { success: true } | { success: false; message: string }

const formAssureurVide = { nom: '', email: '', telephone: '', adminNom: '' }
const formUtilisateurVide = { email: '', telephone: '', nom: '', role: 'LECTEUR' }

const page = () => {
  const [onglet, setOnglet] = useState<'assureurs' | 'clients'>('assureurs')
  const [assureurs, setAssureurs] = useState<AssureurRow[]>([])
  const [clients, setClients] = useState<ClientOwnerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erreurChargement, setErreurChargement] = useState(false)
  const [message, setMessage] = useState('')
  const [enCours, setEnCours] = useState(false)

  const [formAssureur, setFormAssureur] = useState(formAssureurVide)
  const [assureurOuvertId, setAssureurOuvertId] = useState<string | null>(null)
  const [formUtilisateur, setFormUtilisateur] = useState(formUtilisateurVide)
  const [recherche, setRecherche] = useState('')

  const charger = useCallback(async () => {
    try {
      const [listeAssureurs, listeClients] = await Promise.all([getAssureurs(), getClientsOwner()])
      setAssureurs(listeAssureurs as AssureurRow[])
      setClients(listeClients as ClientOwnerRow[])
      setErreurChargement(false)
    } catch (error) {
      console.error(error)
      setErreurChargement(true)
    } finally {
      setLoading(false)
    }
  }, [])

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
    const ok = await lancer(() => creerAssureur(formAssureur))
    if (ok) setFormAssureur(formAssureurVide)
  }

  const ajouterUtilisateur = async (assureurId: string) => {
    const ok = await lancer(() => ajouterUtilisateurAssureur(assureurId, formUtilisateur))
    if (ok) {
      setFormUtilisateur(formUtilisateurVide)
      setAssureurOuvertId(null)
    }
  }

  const basculerAssureur = async (a: AssureurRow) => {
    const question = a.actif
      ? `Suspendre ${a.nom} ? Ses utilisateurs et tous ses clients perdront l'accès.`
      : `Réactiver ${a.nom} ?`
    if (!confirm(question)) return
    await lancer(() => basculerAssureurActif(a.id, !a.actif))
  }

  const retirerUtilisateur = async (u: UtilisateurRow) => {
    if (!confirm(`Retirer ${u.email ?? u.telephone} ?`)) return
    await lancer(() => supprimerUtilisateurAssureur(u.id))
  }

  const changerAssureurClient = async (client: ClientOwnerRow, assureurId: string) => {
    await lancer(() => rattacherClient(client.id, assureurId || null))
  }

  const basculerClient = async (client: ClientOwnerRow) => {
    if (client.accesActif && !confirm(`Suspendre l'accès de ${client.name} ?`)) return
    await lancer(() => basculerAccesClientOwner(client.id, !client.accesActif))
  }

  const clientsFiltres = clients.filter((c) => {
    const texte = recherche.trim().toLowerCase()
    if (!texte) return true
    return [c.name, c.email, c.telephone, c.numeroPolice, c.assureurNom]
      .filter(Boolean)
      .some((valeur) => (valeur as string).toLowerCase().includes(texte))
  })

  const clientsSansAssureur = clients.filter((c) => !c.assureurId).length

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

  return (
    <Wrapper>
      <div className='space-y-4 font-bold'>

        <h1 className='text-lg font-bold text-red-500'>ADMINISTRATION DE L&apos;APPLICATION</h1>

        <div className='grid md:grid-cols-3 gap-3'>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center font-bold'>
            <p className='text-xs uppercase text-gray-700 font-bold'>Assureurs</p>
            <p className='text-2xl font-black text-red-500'>{assureurs.length}</p>
          </div>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center font-bold'>
            <p className='text-xs uppercase text-gray-700 font-bold'>Clients</p>
            <p className='text-2xl font-black text-success'>{clients.length}</p>
          </div>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center font-bold'>
            <p className='text-xs uppercase text-gray-700 font-bold'>Clients sans assureur</p>
            <p className='text-2xl font-black text-blue-600'>{clientsSansAssureur}</p>
          </div>
        </div>

        <div className='tabs tabs-boxed w-fit font-bold'>
          <button
            className={`tab font-bold ${onglet === 'assureurs' ? 'tab-active' : ''}`}
            onClick={() => setOnglet('assureurs')}
          >
            ASSUREURS
          </button>
          <button
            className={`tab font-bold ${onglet === 'clients' ? 'tab-active' : ''}`}
            onClick={() => setOnglet('clients')}
          >
            CLIENTS
          </button>
        </div>

        {message && (
          <div className='border-2 border-error rounded-3xl p-3 text-sm text-error normal-case font-bold'>
            {message}
          </div>
        )}

        {/* ONGLET ASSUREURS */}
        {onglet === 'assureurs' && (
          <div className='space-y-4'>

            <div className='border-2 border-base-200 rounded-3xl p-4 space-y-3 font-bold'>
              <p className='text-sm uppercase text-gray-700 font-bold'>Nouvel assureur</p>
              <div className='grid md:grid-cols-2 gap-3'>
                <input
                  type='text'
                  className='input input-bordered font-bold placeholder:font-bold'
                  placeholder="Nom de l'assureur *"
                  value={formAssureur.nom}
                  onChange={(e) => setFormAssureur({ ...formAssureur, nom: e.target.value })}
                />
                <input
                  type='text'
                  className='input input-bordered font-bold placeholder:font-bold'
                  placeholder="Nom de l'administrateur"
                  value={formAssureur.adminNom}
                  onChange={(e) => setFormAssureur({ ...formAssureur, adminNom: e.target.value })}
                />
                <input
                  type='email'
                  className='input input-bordered normal-case font-bold placeholder:font-bold'
                  placeholder="Email de l'administrateur"
                  value={formAssureur.email}
                  onChange={(e) => setFormAssureur({ ...formAssureur, email: e.target.value })}
                />
                <input
                  type='tel'
                  className='input input-bordered font-bold placeholder:font-bold'
                  placeholder="Téléphone de l'administrateur"
                  value={formAssureur.telephone}
                  onChange={(e) => setFormAssureur({ ...formAssureur, telephone: e.target.value })}
                />
              </div>
              <p className='text-xs text-gray-700 normal-case font-bold'>
                Renseignez au moins l&apos;email ou le téléphone : l&apos;administrateur s&apos;en servira pour se connecter.
              </p>
              <button className='btn btn-sm btn-primary font-bold' disabled={enCours} onClick={creer}>
                {enCours ? <span className='loading loading-spinner loading-sm'></span> : 'CRÉER L\'ASSUREUR'}
              </button>
            </div>

            {assureurs.length === 0 && (
              <p className='text-sm text-gray-600 normal-case font-bold'>Aucun assureur pour le moment.</p>
            )}

            {assureurs.map((a) => (
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
                      <button className='btn btn-xs btn-ghost font-bold' disabled={enCours} onClick={() => basculerAssureur(a)}>
                        {a.actif ? 'SUSPENDRE' : 'RÉACTIVER'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className='overflow-x-auto'>
                  <table className='table table-sm w-full font-bold'>
                    <thead>
                      <tr className='text-xs uppercase text-gray-700 font-bold'>
                        <th className='font-bold'>Utilisateur</th>
                        <th className='font-bold'>Contact</th>
                        <th className='font-bold'>Rôle</th>
                        <th className='font-bold'>Connecté</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.utilisateurs.map((u) => (
                        <tr key={u.id} className='font-bold'>
                          <td>{u.nom ?? '—'}</td>
                          <td className='text-xs normal-case'>
                            {u.email && <div>{u.email}</div>}
                            {u.telephone && <div>{u.telephone}</div>}
                          </td>
                          <td className='text-xs'>{u.role}</td>
                          <td>{u.connecte ? 'Oui' : 'Pas encore'}</td>
                          <td>
                            <button className='btn btn-xs btn-ghost font-bold' disabled={enCours} onClick={() => retirerUtilisateur(u)}>
                              RETIRER
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {assureurOuvertId !== a.id && (
                  <button
                    className='btn btn-xs btn-outline font-bold'
                    onClick={() => { setAssureurOuvertId(a.id); setFormUtilisateur(formUtilisateurVide) }}
                  >
                    + AJOUTER UN UTILISATEUR
                  </button>
                )}

                {assureurOuvertId === a.id && (
                  <div className='border-2 border-base-200 rounded-3xl p-3 space-y-3 font-bold'>
                    <div className='grid md:grid-cols-2 gap-3'>
                      <input
                        type='text'
                        className='input input-bordered input-sm font-bold placeholder:font-bold'
                        placeholder='Nom'
                        value={formUtilisateur.nom}
                        onChange={(e) => setFormUtilisateur({ ...formUtilisateur, nom: e.target.value })}
                      />
                      <select
                        className='select select-bordered select-sm font-bold'
                        value={formUtilisateur.role}
                        onChange={(e) => setFormUtilisateur({ ...formUtilisateur, role: e.target.value })}
                      >
                        <option className='font-bold' value='LECTEUR'>LECTEUR (consultation du stock)</option>
                        <option className='font-bold' value='ADMIN'>ADMIN (gère aussi ses clients)</option>
                      </select>
                      <input
                        type='email'
                        className='input input-bordered input-sm normal-case font-bold placeholder:font-bold'
                        placeholder='Email'
                        value={formUtilisateur.email}
                        onChange={(e) => setFormUtilisateur({ ...formUtilisateur, email: e.target.value })}
                      />
                      <input
                        type='tel'
                        className='input input-bordered input-sm font-bold placeholder:font-bold'
                        placeholder='Téléphone'
                        value={formUtilisateur.telephone}
                        onChange={(e) => setFormUtilisateur({ ...formUtilisateur, telephone: e.target.value })}
                      />
                    </div>
                    <div className='flex gap-2'>
                      <button className='btn btn-xs btn-primary font-bold' disabled={enCours} onClick={() => ajouterUtilisateur(a.id)}>
                        AJOUTER
                      </button>
                      <button className='btn btn-xs btn-ghost font-bold' onClick={() => setAssureurOuvertId(null)}>
                        ANNULER
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ONGLET CLIENTS */}
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
                      <th className='font-bold'>N° police</th>
                      <th className='font-bold'>Assureur</th>
                      <th className='font-bold'>Accès</th>
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
                        <td className='text-xs'>{c.numeroPolice ?? '—'}</td>
                        <td>
                          <select
                            className='select select-bordered select-sm font-bold'
                            value={c.assureurId ?? ''}
                            disabled={enCours}
                            onChange={(e) => changerAssureurClient(c, e.target.value)}
                          >
                            <option className='font-bold' value=''>— Aucun —</option>
                            {assureurs.map((a) => (
                              <option className='font-bold' key={a.id} value={a.id}>{a.nom}</option>
                            ))}
                          </select>
                        </td>
                        <td className='whitespace-nowrap'>
                          <span className={`badge mr-2 font-bold ${c.accesActif ? 'badge-success' : 'badge-error'}`}>
                            {c.accesActif ? 'Actif' : 'Suspendu'}
                          </span>
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
        )}
      </div>
    </Wrapper>
  )
}

export default page