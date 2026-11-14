"use client";
import React, { useState } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import Wrapper from '../components/Wrapper'
import { rejoindreAgentVendeur } from '../actions-inscription'

const page = () => {
  const { user } = useUser()
  const { getToken } = useAuth()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)

  const valider = async () => {
    setErreur('')

    // Les deux champs sont obligatoires
    const manquants: string[] = []
    if (!name.trim()) manquants.push("le nom de votre activité")
    if (!code.trim()) manquants.push("le code d'authentification")
    if (manquants.length > 0) {
      setErreur(`Veuillez renseigner : ${manquants.join(', ')}.`)
      return
    }

    setEnCours(true)
    try {
      const res = await rejoindreAgentVendeur({ code, name })
      if (!res.success) {
        setErreur(res.message)
        return
      }
      // Rafraîchit le profil et le jeton de session (rôle admin), puis recharge l'application
      await user?.reload()
      await getToken({ skipCache: true })
      window.location.href = '/'
    } catch (error) {
      console.error(error)
      setErreur('Erreur réseau. Réessayez.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Wrapper>
      {/* Formulaire centré au milieu de la page (horizontalement et verticalement) */}
      <div className='flex min-h-[calc(100vh-11rem)] items-center justify-center'>
        <div className='w-full max-w-md rounded-2xl bg-base-100 p-5 shadow-sm space-y-4 font-bold'>
          <p className='text-sm text-gray-600 normal-case font-bold'>
            Saisissez le nom de votre activité et le code d&apos;authentification que vous a donné votre agent vendeur.
          </p>

          <div className='flex flex-col gap-1'>
            <label className='text-xs font-bold uppercase'>Nom de votre activité *</label>
            <input
              type='text'
              className='input input-bordered w-full font-bold'
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className='flex flex-col gap-1'>
            <label className='text-xs font-bold uppercase'>Code d&apos;authentification *</label>
            <input
              type='text'
              className='input input-bordered w-full font-bold uppercase tracking-widest'
              autoCapitalize='characters'
              autoComplete='off'
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          {erreur && <p className='text-xs text-error normal-case font-bold'>{erreur}</p>}

          <button className='btn btn-primary w-full font-bold' disabled={enCours} onClick={valider}>
            {enCours ? <span className='loading loading-spinner loading-sm'></span> : 'VALIDER'}
          </button>
        </div>
      </div>
    </Wrapper>
  )
}

export default page
