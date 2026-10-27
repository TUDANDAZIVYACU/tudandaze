"use client"

import React, { useState, useTransition, useRef } from 'react'
import { toast } from 'react-toastify'
import { inviteUser } from './actions'

const InviteUserModal = () => {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'caissier'>('caissier')
  const [isPending, startTransition] = useTransition()
  const modalRef = useRef<HTMLDialogElement>(null)

  const closeModal = () => {
    modalRef.current?.close()
    setEmail('')
    setRole('caissier')
  }

  const handleInvite = () => {
    startTransition(async () => {
      try {
        const resultat = await inviteUser(email, role)
        if (!resultat.success) {
          toast.error(resultat.message)
          return
        }
        toast.success(resultat.message ?? 'Invitation envoyée', { autoClose: 9000 })
        closeModal()
      } catch (err) {
        console.error(err)
        toast.error("Erreur lors de l'invitation. Vérifiez votre connexion et réessayez.")
      }
    })
  }

  return (
    <>
      <button
        className='btn btn-primary btn-sm font-bold md:btn-md'
        onClick={() => modalRef.current?.showModal()}
      >
        Inviter un utilisateur
      </button>

      <dialog ref={modalRef} className='modal modal-bottom sm:modal-middle'>
        <div className='modal-box'>
          <h3 className='mb-1 text-lg font-bold'>Inviter un utilisateur</h3>
          <p className='mb-4 text-xs text-gray-500'>
            Il rejoindra uniquement l&apos;équipe de votre entreprise.
          </p>

          <div className='form-control mb-4 w-full'>
            <label className='label'>
              <span className='label-text font-bold'>Email</span>
            </label>
            <input
              type='email'
              inputMode='email'
              autoCapitalize='none'
              placeholder='exemple@gmail.com'
              className='input input-bordered w-full'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className='form-control mb-4 w-full'>
            <label className='label'>
              <span className='label-text font-bold'>Rôle</span>
            </label>
            <select
              className='select select-bordered w-full'
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'caissier')}
              disabled={isPending}
            >
              <option value='caissier'>Caissier</option>
              <option value='admin'>Administrateur</option>
            </select>
          </div>

          <p className='mb-4 rounded-xl bg-base-200 p-3 text-xs font-normal'>
            Si l&apos;email n&apos;arrive pas, demandez à la personne de vérifier ses courriers indésirables,
            ou de s&apos;inscrire directement sur le site avec cette adresse.
          </p>

          <div className='modal-action'>
            <button className='btn' onClick={closeModal} disabled={isPending}>
              Annuler
            </button>
            <button
              className='btn btn-primary'
              onClick={handleInvite}
              disabled={isPending || !email}
            >
              {isPending ? 'Envoi...' : "Envoyer l'invitation"}
            </button>
          </div>
        </div>

        <form method='dialog' className='modal-backdrop'>
          <button>close</button>
        </form>
      </dialog>
    </>
  )
}

export default InviteUserModal