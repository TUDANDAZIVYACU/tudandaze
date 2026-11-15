"use client";
import React, { useEffect, useRef, useState } from 'react'
import type { PaiementGlobal, DepenseClient } from '../actions-suivi'
import { exporterPdf, exporterExcel, nomFichierSur, type TableauExport } from '@/lib/export-tableau'

const formaterDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR')
const formaterMontant = (n: number) => n.toLocaleString('fr-FR')

function periodeTexte(dateDebut: string, dateFin: string) {
  if (!dateDebut && !dateFin) return 'Toutes les dates'
  if (dateDebut && dateFin) return `Du ${formaterDate(dateDebut)} au ${formaterDate(dateFin)}`
  if (dateDebut) return `À partir du ${formaterDate(dateDebut)}`
  return `Jusqu'au ${formaterDate(dateFin)}`
}

const statutTexte = (statut: string) =>
  statut === 'confirme' ? 'Confirmé' : statut === 'rejete' ? 'Rejeté' : 'En attente'

// Boutons PDF + EXCEL, réutilisables dans n'importe quelle page ou fenêtre
export function BoutonsExport({ tableau }: { tableau: TableauExport | null }) {
  const [enCours, setEnCours] = useState<'pdf' | 'excel' | null>(null)

  const lancer = async (type: 'pdf' | 'excel') => {
    if (!tableau) return
    setEnCours(type)
    try {
      if (type === 'pdf') await exporterPdf(tableau)
      else await exporterExcel(tableau)
    } catch (error) {
      console.error(error)
      alert("Échec de l'export. Réessayez.")
    } finally {
      setEnCours(null)
    }
  }

  return (
    <div className='flex gap-1'>
      <button
        type='button'
        className='btn btn-sm btn-primary font-bold'
        disabled={!tableau || !!enCours}
        onClick={() => lancer('pdf')}
      >
        {enCours === 'pdf' ? <span className='loading loading-spinner loading-xs'></span> : 'PDF'}
      </button>
      <button
        type='button'
        className='btn btn-sm btn-success font-bold'
        disabled={!tableau || !!enCours}
        onClick={() => lancer('excel')}
      >
        {enCours === 'excel' ? <span className='loading loading-spinner loading-xs'></span> : 'EXCEL'}
      </button>
    </div>
  )
}

// Charge les données une seule fois à l'ouverture de la fenêtre
function useChargement<T>(charger: () => Promise<T>) {
  const [donnees, setDonnees] = useState<T | null>(null)
  const [erreur, setErreur] = useState(false)
  const chargerRef = useRef(charger)
  chargerRef.current = charger

  useEffect(() => {
    let annule = false
    chargerRef.current()
      .then((res) => { if (!annule) setDonnees(res) })
      .catch((error) => {
        console.error(error)
        if (!annule) setErreur(true)
      })
    return () => { annule = true }
  }, [])

  return { donnees, erreur }
}

function Fenetre({ titre, sousTitre, actions, onClose, children }: {
  titre: string
  sousTitre: string
  actions?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <dialog className='modal modal-open'>
      <div className='modal-box max-w-4xl font-bold'>
        <div className='flex items-start justify-between gap-2 mb-3'>
          <div>
            <p className='text-lg font-black text-success'>{titre}</p>
            <p className='text-xs text-gray-600 normal-case'>{sousTitre}</p>
          </div>
          <div className='flex flex-wrap items-center justify-end gap-2'>
            {actions}
            <button className='btn btn-sm btn-ghost font-bold' onClick={onClose}>FERMER</button>
          </div>
        </div>
        {children}
      </div>
      <div className='modal-backdrop' onClick={onClose}></div>
    </dialog>
  )
}

function Chargement({ erreur }: { erreur: boolean }) {
  if (erreur) {
    return <p className='text-sm text-error normal-case'>Impossible de charger les données. Réessayez.</p>
  }
  return (
    <div className='flex justify-center py-6'>
      <span className='loading loading-spinner loading-md text-primary'></span>
    </div>
  )
}

// PAIEMENTS DE TOUS LES CLIENTS (abonnements)
export function PaiementsTousModal({ dateDebut, dateFin, afficherAgent, charger, onClose }: {
  dateDebut: string
  dateFin: string
  afficherAgent: boolean
  charger: () => Promise<PaiementGlobal[]>
  onClose: () => void
}) {
  const { donnees, erreur } = useChargement(charger)
  const totalConfirme = (donnees ?? [])
    .filter((p) => p.statut === 'confirme')
    .reduce((total, p) => total + p.montant, 0)
  const periode = periodeTexte(dateDebut, dateFin)

  const tableau: TableauExport | null =
    donnees && donnees.length > 0
      ? {
          titre: 'Paiements de tous les clients',
          sousTitre: periode,
          nomFichier: 'paiements-tous-clients',
          colonnes: [
            'Date',
            'Client',
            ...(afficherAgent ? ['Agent vendeur'] : []),
            'Plan',
            'Mode',
            'Montant (FBU)',
            'Statut'
          ],
          lignes: donnees.map((p) => [
            formaterDate(p.date),
            p.clientNom,
            ...(afficherAgent ? [p.agentvendeurNom ?? '—'] : []),
            p.plan,
            p.provider,
            p.montant,
            statutTexte(p.statut)
          ]),
          pied: `Total confirmé : ${formaterMontant(totalConfirme)} FBU`
        }
      : null

  return (
    <Fenetre
      titre='PAIEMENTS DE TOUS LES CLIENTS'
      sousTitre={periode}
      actions={<BoutonsExport tableau={tableau} />}
      onClose={onClose}
    >
      {!donnees && <Chargement erreur={erreur} />}
      {donnees && donnees.length === 0 && (
        <p className='text-sm text-gray-500 normal-case'>Aucun paiement sur cette période.</p>
      )}
      {donnees && donnees.length > 0 && (
        <>
          <div className='overflow-x-auto'>
            <table className='table table-sm w-full'>
              <thead>
                <tr className='text-xs uppercase text-gray-600'>
                  <th>Date</th>
                  <th>Client</th>
                  {afficherAgent && <th>Agent vendeur</th>}
                  <th>Plan</th>
                  <th>Mode</th>
                  <th className='text-right'>Montant</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {donnees.map((p) => (
                  <tr key={p.id}>
                    <td className='whitespace-nowrap'>{formaterDate(p.date)}</td>
                    <td>{p.clientNom}</td>
                    {afficherAgent && <td className='text-xs'>{p.agentvendeurNom ?? '—'}</td>}
                    <td className='text-xs capitalize'>{p.plan}</td>
                    <td className='text-xs capitalize'>{p.provider}</td>
                    <td className='text-right tabular-nums whitespace-nowrap'>{formaterMontant(p.montant)} FBU</td>
                    <td>
                      <span className={`badge badge-sm font-bold ${
                        p.statut === 'confirme' ? 'badge-success' : p.statut === 'rejete' ? 'badge-error' : 'badge-warning'
                      }`}>
                        {statutTexte(p.statut)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className='mt-3 text-right text-sm'>
            Total confirmé : <span className='font-black text-success tabular-nums'>{formaterMontant(totalConfirme)} FBU</span>
          </p>
        </>
      )}
    </Fenetre>
  )
}

// DÉPENSES D'UN CLIENT
export function DepensesClientModal({ clientNom, dateDebut, dateFin, charger, onClose }: {
  clientNom: string
  dateDebut: string
  dateFin: string
  charger: () => Promise<DepenseClient[]>
  onClose: () => void
}) {
  const { donnees, erreur } = useChargement(charger)
  const total = (donnees ?? []).reduce((t, d) => t + d.montant, 0)
  const periode = periodeTexte(dateDebut, dateFin)

  const tableau: TableauExport | null =
    donnees && donnees.length > 0
      ? {
          titre: `Dépenses — ${clientNom}`,
          sousTitre: periode,
          nomFichier: `depenses-${nomFichierSur(clientNom)}`,
          colonnes: ['Date', 'Description', 'Catégorie', 'Montant (FBU)'],
          lignes: donnees.map((d) => [formaterDate(d.date), d.description, d.categorie, d.montant]),
          pied: `Total : ${formaterMontant(total)} FBU`
        }
      : null

  return (
    <Fenetre
      titre={`DÉPENSES — ${clientNom}`}
      sousTitre={periode}
      actions={<BoutonsExport tableau={tableau} />}
      onClose={onClose}
    >
      {!donnees && <Chargement erreur={erreur} />}
      {donnees && donnees.length === 0 && (
        <p className='text-sm text-gray-500 normal-case'>Aucune dépense sur cette période.</p>
      )}
      {donnees && donnees.length > 0 && (
        <>
          <div className='overflow-x-auto'>
            <table className='table table-sm w-full'>
              <thead>
                <tr className='text-xs uppercase text-gray-600'>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Catégorie</th>
                  <th className='text-right'>Montant</th>
                </tr>
              </thead>
              <tbody>
                {donnees.map((d) => (
                  <tr key={d.id}>
                    <td className='whitespace-nowrap'>{formaterDate(d.date)}</td>
                    <td className='normal-case'>{d.description}</td>
                    <td className='text-xs'>{d.categorie}</td>
                    <td className='text-right tabular-nums whitespace-nowrap'>{formaterMontant(d.montant)} FBU</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className='mt-3 text-right text-sm'>
            Total : <span className='font-black text-error tabular-nums'>{formaterMontant(total)} FBU</span>
          </p>
        </>
      )}
    </Fenetre>
  )
}
