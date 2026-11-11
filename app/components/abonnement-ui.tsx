"use client";
import React, { useEffect, useState } from 'react'

export type AbonnementInfo = { etat: 'essai' | 'actif' | 'expire'; plan: string | null; dateFin: Date } | null

export type PaiementRow = {
  id: string
  createdAt: Date
  duree: string
  montant: number
  statut: string
  codeTrans: string
}

type ReponsePaiements = { success: true; paiements: PaiementRow[] } | { success: false; message: string }

export const formatDate = (d: Date | string) => new Date(d).toLocaleDateString('fr-FR')

// Colonne « Abonnement » : badge Actif / Essai / Expiré avec la date de fin
export function CelluleAbonnement({ abonnement }: { abonnement: AbonnementInfo }) {
  if (!abonnement) return <span className='badge badge-ghost'>Aucun</span>
  const { etat, dateFin } = abonnement
  return (
    <>
      <span className={`badge ${etat === 'actif' ? 'badge-success' : etat === 'essai' ? 'badge-info' : 'badge-error'}`}>
        {etat === 'actif' ? 'Actif' : etat === 'essai' ? 'Essai' : 'Expiré'}
      </span>
      <div className='text-[10px] text-gray-500 normal-case'>
        {etat === 'expire' ? 'le' : "jusqu'au"} {formatDate(dateFin)}
      </div>
    </>
  )
}

// Fenêtre « Historique des paiements » d'un client. Elle charge les paiements à son ouverture.
export function PaiementsClientModal({
  clientNom,
  dateDebut,
  dateFin,
  charger,
  onClose
}: {
  clientNom: string
  dateDebut: string
  dateFin: string
  charger: () => Promise<ReponsePaiements>
  onClose: () => void
}) {
  const [paiements, setPaiements] = useState<PaiementRow[]>([])
  const [enCours, setEnCours] = useState(true)
  const [erreur, setErreur] = useState('')
  const filtreActif = !!dateDebut || !!dateFin

  useEffect(() => {
    let annule = false
    charger()
      .then((res) => {
        if (annule) return
        if (res.success) setPaiements(res.paiements)
        else setErreur(res.message)
      })
      .catch((error) => {
        console.error(error)
        if (!annule) setErreur('Erreur réseau. Réessayez.')
      })
      .finally(() => {
        if (!annule) setEnCours(false)
      })
    return () => {
      annule = true
    }
    // Chargement une seule fois, à l'ouverture de la fenêtre
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalConfirme = paiements
    .filter((p) => p.statut === 'confirme')
    .reduce((total, p) => total + p.montant, 0)

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4' onClick={onClose}>
      <div className='w-full max-w-lg space-y-3 rounded-3xl bg-base-100 p-5' onClick={(e) => e.stopPropagation()}>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <p className='text-xs uppercase text-gray-600'>Historique des paiements</p>
            <h2 className='break-words text-lg font-bold'>{clientNom}</h2>
            {filtreActif && (
              <p className='text-xs text-gray-600 normal-case'>
                Période : {dateDebut ? `du ${formatDate(dateDebut)}` : 'depuis le début'}
                {dateFin ? ` au ${formatDate(dateFin)}` : ", jusqu'à aujourd'hui"}
              </p>
            )}
          </div>
          <button className='btn btn-sm btn-ghost' onClick={onClose}>FERMER</button>
        </div>

        {enCours && (
          <div className='flex justify-center py-6'>
            <span className='loading loading-spinner loading-md text-primary'></span>
          </div>
        )}

        {!enCours && erreur && <p className='text-sm text-error normal-case'>{erreur}</p>}

        {!enCours && !erreur && paiements.length === 0 && (
          <p className='text-sm text-gray-500 normal-case'>
            Aucun paiement{filtreActif ? ' sur cette période' : ' pour le moment'}.
          </p>
        )}

        {!enCours && !erreur && paiements.length > 0 && (
          <>
            <div className='max-h-80 overflow-auto'>
              <table className='table table-sm w-full'>
                <thead>
                  <tr className='text-xs uppercase text-gray-600'>
                    <th>Date</th>
                    <th>Durée</th>
                    <th className='text-right'>Montant (FBU)</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {paiements.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.createdAt)}</td>
                      <td className='normal-case'>{p.duree}</td>
                      <td className='text-right tabular-nums'>{p.montant.toLocaleString('fr-FR')}</td>
                      <td>
                        <span
                          className={`badge badge-sm ${
                            p.statut === 'confirme' ? 'badge-success' : p.statut === 'rejete' ? 'badge-error' : 'badge-warning'
                          }`}
                        >
                          {p.statut === 'confirme' ? 'Confirmé' : p.statut === 'rejete' ? 'Rejeté' : 'En attente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className='flex items-center justify-between border-t border-base-300 pt-3'>
              <span className='text-sm uppercase text-gray-600'>Total confirmé</span>
              <span className='text-lg font-black text-success tabular-nums'>
                {totalConfirme.toLocaleString('fr-FR')} FBU
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
