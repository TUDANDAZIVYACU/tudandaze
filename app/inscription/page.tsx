"use client";
import React, { useState } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import Wrapper from '../components/Wrapper'
import { rejoindreAgentVendeur } from '../actions-inscription'

const page = () => {
  const { user } = useUser()
  const { getToken } = useAuth()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [rc, setRc] = useState('')
  const [nif, setNif] = useState('')
  const [secteurActivite, setSecteurActivite] = useState('')
  const [proprietaire, setProprietaire] = useState('')
  const [telephone, setTelephone] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)

  const valider = async () => {
    setErreur('')

    // Seuls le code de l'agentvendeur et le nom de l'entreprise sont obligatoires
    const manquants: string[] = []
    if (!code.trim()) manquants.push("le code de l'agentvendeur")
    if (!name.trim()) manquants.push("le nom de l'entreprise")
    if (manquants.length > 0) {
      setErreur(`Veuillez renseigner : ${manquants.join(', ')}.`)
      return
    }

    setEnCours(true)
    try {
      const res = await rejoindreAgentVendeur({
        code,
        name,
        rc,
        nif,
        secteurActivite,
        proprietaire,
        telephone
      })
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
      <div className='max-w-2xl mx-auto -mt-4 space-y-2 font-bold'>
        <h1 className='text-base font-bold text-error'>REJOINDRE MON AGENTVENDEUR</h1>

        <div className='border-2 border-base-200 rounded-3xl p-3 space-y-2'>
          <p className='text-[11px] text-gray-600 normal-case font-bold'>
            Saisissez le code de votre agentvendeur et le nom de votre entreprise. Les autres informations sont facultatives.
          </p>

          <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2'>
            <div className='flex flex-col gap-0.5 sm:col-span-2'>
              <label className='text-[11px] font-bold uppercase'>Code de l&apos;agentvendeur *</label>
              <input
                type='text'
                className='input input-bordered input-sm w-full font-bold uppercase tracking-widest'
                autoCapitalize='characters'
                autoComplete='off'
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>

            <div className='flex flex-col gap-0.5 sm:col-span-2'>
              <label className='text-[11px] font-bold uppercase'>Nom de votre entreprise *</label>
              <input
                type='text'
                className='input input-bordered input-sm w-full font-bold'
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className='flex flex-col gap-0.5'>
              <label className='text-[11px] font-bold uppercase'>RC</label>
              <input
                type='text'
                className='input input-bordered input-sm w-full font-bold'
                value={rc}
                onChange={(e) => setRc(e.target.value)}
              />
            </div>

            <div className='flex flex-col gap-0.5'>
              <label className='text-[11px] font-bold uppercase'>NIF</label>
              <input
                type='text'
                className='input input-bordered input-sm w-full font-bold'
                value={nif}
                onChange={(e) => setNif(e.target.value)}
              />
            </div>

            <div className='flex flex-col gap-0.5'>
              <label className='text-[11px] font-bold uppercase'>Secteur d&apos;activité</label>
              <input
                type='text'
                className='input input-bordered input-sm w-full font-bold'
                value={secteurActivite}
                onChange={(e) => setSecteurActivite(e.target.value)}
              />
            </div>

            <div className='flex flex-col gap-0.5'>
              <label className='text-[11px] font-bold uppercase'>Propriétaire</label>
              <input
                type='text'
                className='input input-bordered input-sm w-full font-bold'
                value={proprietaire}
                onChange={(e) => setProprietaire(e.target.value)}
              />
            </div>

            <div className='flex flex-col gap-0.5 sm:col-span-2'>
              <label className='text-[11px] font-bold uppercase'>Téléphone</label>
              <input
                type='tel'
                className='input input-bordered input-sm w-full font-bold'
                placeholder='+257...'
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
              />
            </div>
          </div>

          {/* Zone fixée en bas de l'écran : message d'erreur + bouton VALIDER */}
          <div className='sticky bottom-0 -mx-3 -mb-3 px-3 py-2 bg-base-100 border-t-2 border-base-200 rounded-b-3xl space-y-1'>
            {erreur && <p className='text-xs text-error normal-case font-bold'>{erreur}</p>}

            <button className='btn btn-primary btn-sm w-full font-bold' disabled={enCours} onClick={valider}>
              {enCours ? <span className='loading loading-spinner loading-sm'></span> : 'VALIDER'}
            </button>
          </div>
        </div>
      </div>
    </Wrapper>
  )
}

export default page
