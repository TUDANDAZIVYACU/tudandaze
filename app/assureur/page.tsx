"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Wrapper from '../components/Wrapper'
import {
  getMonAssureur,
  getClientsAssureur,
  basculerAccesClient,
  importerClientsAssureur
} from '../actions-assureur'
import { lireClientsExcel } from '@/lib/lire-clients-excel'

type MonAssureur = {
  id: string
  nom: string
  code: string
  role: string
}

type ClientRow = {
  id: string
  name: string
  email: string | null
  telephone: string | null
  numeroPolice: string | null
  nif: string | null
  accesActif: boolean
  createdAt: Date
  nombreProduits: number
}

type ResultatImport = {
  erreur?: string
  ajoutes: number
  misAJour: number
  ignores: { ligne: number; nom: string; raison: string }[]
}

// Fiche importée par l'assureur (Excel) qui attend l'inscription du client : ni email ni téléphone de connexion
const estEnAttente = (c: ClientRow) => !c.email && !c.telephone

const page = () => {
  const [assureur, setAssureur] = useState<MonAssureur | null>(null)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erreurChargement, setErreurChargement] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [codeCopie, setCodeCopie] = useState(false)
  const [importEnCours, setImportEnCours] = useState(false)
  const [resultatImport, setResultatImport] = useState<ResultatImport | null>(null)
  const fichierRef = useRef<HTMLInputElement>(null)

  const estAdmin = assureur?.role === 'ADMIN'

  const charger = useCallback(async () => {
    try {
      const [infos, liste] = await Promise.all([getMonAssureur(), getClientsAssureur()])
      setAssureur(infos)
      setClients(liste as ClientRow[])
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

  const copierCode = async () => {
    if (!assureur) return
    try {
      await navigator.clipboard.writeText(assureur.code)
      setCodeCopie(true)
      setTimeout(() => setCodeCopie(false), 2000)
    } catch (error) {
      console.error(error)
      alert(`Code : ${assureur.code}`)
    }
  }

  // Lit le fichier Excel (Nom de l'entreprise, RC, NIF) puis enregistre les clients
  const importerExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0]
    e.target.value = '' // permet de re-choisir le même fichier après correction
    if (!fichier) return

    const echec = (erreur: string) => setResultatImport({ erreur, ajoutes: 0, misAJour: 0, ignores: [] })

    if (!/\.xlsx$/i.test(fichier.name)) {
      echec("Choisissez un fichier Excel au format .xlsx (Fichier → Enregistrer sous → Classeur Excel).")
      return
    }
    if (fichier.size > 1024 * 1024) {
      echec('Fichier trop lourd (1 Mo maximum).')
      return
    }

    setImportEnCours(true)
    setResultatImport(null)
    try {
      const lignes = await lireClientsExcel(fichier)
      if (lignes.length === 0) {
        echec('Le fichier ne contient aucun client sous la ligne des titres.')
        return
      }
      const res = await importerClientsAssureur(lignes)
      if (!res.success) {
        echec(res.message)
        return
      }
      setResultatImport({ ajoutes: res.ajoutes, misAJour: res.misAJour, ignores: res.ignores })
      await charger()
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : ''
      echec(
        message.startsWith('Colonnes introuvables') || message.startsWith('Le fichier')
          ? message
          : 'Impossible de lire ce fichier : vérifiez qu\'il s\'agit bien d\'un classeur Excel (.xlsx).'
      )
    } finally {
      setImportEnCours(false)
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
    return [c.name, c.email, c.telephone, c.numeroPolice, c.nif]
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

  if (erreurChargement || !assureur) {
    return (
      <Wrapper>
        <div className='border-2 border-base-200 rounded-3xl p-6 text-center font-bold'>
          <p>Impossible de charger votre espace assureur.</p>
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

  return (
    <Wrapper>
      <div className='space-y-4 font-bold'>

        <h1 className='text-lg font-bold text-error'>
          ESPACE ASSUREUR — {assureur.nom}
        </h1>

        {/* CODE ASSUREUR : à donner aux clients, qui s'enregistrent eux-mêmes */}
        {estAdmin && (
          <div className='border-2 border-base-200 rounded-3xl p-4 flex flex-wrap items-center justify-between gap-3'>
            <div>
              <p className='text-xs uppercase text-gray-600'>Votre code assureur</p>
              <p className='text-2xl font-black text-success tracking-widest'>{assureur.code}</p>
              <p className='text-xs text-gray-600 normal-case'>
                Donnez ce code à vos clients : ils créent leur compte et s&apos;enregistrent eux-mêmes.
              </p>
              <p className='text-xs text-gray-600 normal-case'>
                Ou importez votre liste (Excel : Nom de l&apos;entreprise, RC, NIF) : ils complètent le reste à leur inscription.
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <button className='btn btn-sm btn-primary' onClick={copierCode}>
                {codeCopie ? 'COPIÉ ✓' : 'COPIER LE CODE'}
              </button>
              <input
                ref={fichierRef}
                type='file'
                accept='.xlsx'
                className='hidden'
                onChange={importerExcel}
              />
              <button
                className='btn btn-sm btn-secondary'
                disabled={importEnCours}
                onClick={() => fichierRef.current?.click()}
              >
                {importEnCours ? <span className='loading loading-spinner loading-xs'></span> : 'IMPORTER (EXCEL)'}
              </button>
            </div>
          </div>
        )}

        {/* RÉSULTAT DE L'IMPORT */}
        {resultatImport && (
          <div className='border-2 border-base-200 rounded-3xl p-4 space-y-2'>
            <div className='flex items-center justify-between'>
              <p className='text-sm uppercase text-gray-600'>Résultat de l&apos;import</p>
              <button className='btn btn-xs btn-ghost' onClick={() => setResultatImport(null)}>FERMER</button>
            </div>

            {resultatImport.erreur ? (
              <p className='text-sm text-error normal-case'>{resultatImport.erreur}</p>
            ) : (
              <>
                <p className='text-sm normal-case'>
                  <span className='text-success'>{resultatImport.ajoutes} client(s) ajouté(s)</span>
                  {resultatImport.misAJour > 0 && (
                    <span className='text-gray-600'> · {resultatImport.misAJour} fiche(s) mise(s) à jour</span>
                  )}
                  {resultatImport.ignores.length > 0 && (
                    <span className='text-error'> · {resultatImport.ignores.length} ligne(s) ignorée(s)</span>
                  )}
                </p>
                {resultatImport.ignores.length > 0 && (
                  <ul className='text-xs text-gray-600 normal-case space-y-0.5 max-h-40 overflow-y-auto'>
                    {resultatImport.ignores.map((i, index) => (
                      <li key={`${i.ligne}-${index}`}>
                        Ligne {i.ligne} ({i.nom}) : {i.raison}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        {/* RÉSUMÉ */}
        <div className='grid md:grid-cols-2 gap-3'>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center'>
            <p className='text-xs uppercase text-gray-600'>Clients</p>
            <p className='text-2xl font-black text-red'>{clients.length}</p>
            {enAttente > 0 && (
              <p className='text-xs text-gray-600 normal-case'>dont {enAttente} en attente d&apos;inscription</p>
            )}
          </div>
          <div className='border-2 border-base-200 rounded-3xl p-4 text-center'>
            <p className='text-xs uppercase text-gray-600'>Accès actifs</p>
            <p className='text-2xl font-black text-success'>{accesActifs}</p>
          </div>
        </div>

        {/* MES CLIENTS */}
        <div className='border-2 border-base-200 rounded-3xl p-4'>
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
              Aucun client pour le moment.{estAdmin ? ' Importez votre liste Excel, ou donnez votre code à vos clients : ils apparaîtront ici dès leur inscription.' : ''}
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
                    <th>RC</th>
                    <th>Produits</th>
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
                      <td className='text-xs'>
                        <div>{c.numeroPolice ?? '—'}</div>
                        {c.nif && <div className='text-[10px] text-gray-500'>NIF {c.nif}</div>}
                      </td>
                      <td>{c.nombreProduits}</td>
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
                        <Link
                          href={`/assureur/variation/${c.id}`}
                          className='btn btn-xs btn-secondary mr-1'
                        >
                          IN/OUT
                        </Link>
                        <Link
                          href={`/assureur/stock/${c.id}`}
                          className='btn btn-xs btn-primary mr-1'
                        >
                          STOCK
                        </Link>
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
    </Wrapper>
  )
}

export default page
