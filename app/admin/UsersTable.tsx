"use client"

import React, { useState, useTransition } from 'react'
import { toast } from 'react-toastify'
import { updateUserRole, deleteUser, renvoyerInvitation, UserRow } from './actions'

const UsersTable = ({ users }: { users: UserRow[] }) => {
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)

  const handleRoleChange = (userId: string, role: 'admin' | 'caissier') => {
    setPendingId(userId)
    startTransition(async () => {
      try {
        const resultat = await updateUserRole(userId, role)
        if (resultat.success) toast.success('Rôle mis à jour')
        else toast.error(resultat.message)
      } catch {
        toast.error("Erreur lors de la mise à jour du rôle")
      } finally {
        setPendingId(null)
      }
    })
  }

  const handleDelete = (user: UserRow) => {
    const confirmed = window.confirm(
      user.status === 'en_attente'
        ? `Annuler l'invitation de ${user.email} ?`
        : `Retirer ${user.email} de votre équipe ? Il n'aura plus accès à votre entreprise.`
    )
    if (!confirmed) return

    setDeletingId(user.id)
    startTransition(async () => {
      try {
        const resultat = await deleteUser(user.id)
        if (resultat.success) {
          toast.success(user.status === 'en_attente' ? 'Invitation annulée' : 'Utilisateur retiré')
        } else {
          toast.error(resultat.message)
        }
      } catch (err) {
        console.error(err)
        toast.error('Erreur lors de la suppression')
      } finally {
        setDeletingId(null)
      }
    })
  }

  const handleResend = (user: UserRow) => {
    setResendingId(user.id)
    startTransition(async () => {
      try {
        const resultat = await renvoyerInvitation(user.id)
        if (resultat.success) toast.success(resultat.message ?? 'Invitation renvoyée')
        else toast.error(resultat.message)
      } catch (err) {
        console.error(err)
        toast.error("Erreur lors du renvoi de l'invitation")
      } finally {
        setResendingId(null)
      }
    })
  }

  const badgeStatut = (user: UserRow) =>
    user.status === 'en_attente' ? (
      <span className='badge badge-warning font-bold'>Inactif</span>
    ) : (
      <span className='badge badge-success font-bold'>Actif</span>
    )

  const selectRole = (user: UserRow, className: string) => (
    <select
      aria-label='Rôle'
      className={className}
      defaultValue={user.role}
      disabled={isPending && pendingId === user.id}
      onChange={(e) => handleRoleChange(user.id, e.target.value as 'admin' | 'caissier')}
    >
      <option value='caissier'>Caissier</option>
      <option value='admin'>Administrateur</option>
    </select>
  )

  // Boutons d'action : taille réduite sur téléphone (xs), normale sur ordinateur (sm)
  const boutons = (user: UserRow) => (
    <>
      {user.status === 'en_attente' && (
        <button
          className='btn btn-xs btn-outline md:btn-sm'
          disabled={isPending && resendingId === user.id}
          onClick={() => handleResend(user)}
        >
          {isPending && resendingId === user.id ? '...' : 'Renvoyer'}
        </button>
      )}
      <button
        className='btn btn-xs btn-error btn-outline md:btn-sm'
        disabled={isPending && deletingId === user.id}
        onClick={() => handleDelete(user)}
      >
        {isPending && deletingId === user.id
          ? '...'
          : user.status === 'en_attente' ? 'Annuler' : 'Retirer'}
      </button>
    </>
  )

  return (
    <>
      {/* Ordinateur : tableau */}
      <div className='hidden overflow-x-auto rounded-box border border-base-300 font-bold md:block'>
        <table className='table font-bold'>
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th className='font-bold'>Email</th>
              <th>Statut</th>
              <th>Rôle</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td className='font-bold'>{user.fullName}</td>
                <td className='font-bold'>{user.email}</td>
                <td>{badgeStatut(user)}</td>
                <td>
                  {user.estProprietaire ? (
                    <span className='badge badge-outline font-bold'>Propriétaire</span>
                  ) : (
                    selectRole(user, 'select select-bordered select-sm w-full max-w-[150px]')
                  )}
                </td>
                <td>
                  {!user.estProprietaire && <div className='flex justify-end gap-2'>{boutons(user)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Téléphone : une carte par utilisateur, rôle à gauche et boutons à sa droite */}
      <div className='space-y-3 font-bold md:hidden'>
        {users.map(user => (
          <div key={user.id} className='rounded-2xl border border-base-300 bg-base-100 p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <p className='break-words font-bold leading-tight'>{user.fullName}</p>
                <p className='break-all text-xs font-bold opacity-60'>{user.email}</p>
              </div>
              {badgeStatut(user)}
            </div>

            {user.estProprietaire ? (
              <div className='mt-3'>
                <span className='badge badge-outline font-bold'>Propriétaire</span>
              </div>
            ) : (
              <div className='mt-3 flex flex-wrap items-center justify-between gap-2'>
                {selectRole(user, 'select select-bordered select-sm w-[140px] shrink-0')}
                <div className='flex items-center gap-1.5'>{boutons(user)}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

export default UsersTable