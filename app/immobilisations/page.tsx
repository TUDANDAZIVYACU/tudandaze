"use client";
import React, { useEffect, useRef, useState } from 'react'
import Wrapper from '../components/Wrapper'
import { useUser } from '@clerk/nextjs'
import { envoyerPhoto as envoyerVersStockage } from '@/lib/upload-photo'
import { toast } from 'react-toastify'
import { Trash2 } from 'lucide-react'
import {
  createImmobilisation,
  readImmobilisations,
  deleteImmobilisation
} from '../actions-immobilisations'

type Equipement = {
  id: string
  designation: string
  dateAcquisition: Date | string
  prix: number
  numeroSerie: string | null
  factureUrl: string | null
  photoUrl: string | null
  createdAt: Date | string
}

const VINGT_QUATRE_HEURES_MS = 24 * 60 * 60 * 1000

// Date du jour au Burundi (AAAA-MM-JJ)
const aujourdhui = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Bujumbura' })

const fmt = (n: number) => Math.round(n).toLocaleString()

// Réduit la photo (max 1600 px, JPEG) pour un envoi rapide. En cas d'échec, on garde l'original.
async function compresserImage(fichier: File, nom: string): Promise<File> {
  try {
    const bitmap = await createImageBitmap(fichier)
    const max = 1600
    const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * ratio)
    canvas.height = Math.round(bitmap.height * ratio)
    const ctx = canvas.getContext('2d')
    if (!ctx) return fichier
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    if (!blob) return fichier
    return new File([blob], nom, { type: 'image/jpeg' })
  } catch {
    return fichier
  }
}

// Envoie une photo au stockage et renvoie son adresse
// (envoi direct, puis envoi de secours via le serveur si le premier échoue)
async function envoyerPhoto(fichier: File, nom: string): Promise<string> {
  const compresse = await compresserImage(fichier, `${nom}.jpg`)
  const blob = await envoyerVersStockage(
    `immobilisations/${Date.now()}-${nom}.jpg`,
    compresse,
    compresse.type || 'image/jpeg'
  )
  return blob.url
}

// Champ photo (choix de la galerie ou de l'appareil photo, aperçu, retrait)
const ChampPhoto = ({ label, preview, inputRef, onChoose, onClear }: {
  label: string
  preview: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onChoose: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClear: () => void
}) => (
  <div>
    <label className='text-xs font-bold'>{label}</label>
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      onChange={onChoose}
      className='file-input file-input-bordered file-input-sm w-full'
    />
    {preview && (
      <div className='mt-2 flex items-start gap-3'>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview}
          alt={label}
          className='h-24 w-auto rounded-xl border-2 border-base-200 object-contain'
        />
        <button type="button" className='btn btn-xs btn-ghost text-error' onClick={onClear}>
          RETIRER LA PHOTO
        </button>
      </div>
    )}
  </div>
)

const page = () => {
  const { user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.primaryPhoneNumber?.phoneNumber

  const [equipements, setEquipements] = useState<Equipement[]>([])
  const [designation, setDesignation] = useState('')
  const [dateAcquisition, setDateAcquisition] = useState(aujourdhui())
  const [prix, setPrix] = useState<number>(0)
  const [numeroSerie, setNumeroSerie] = useState('')
  const [factureFichier, setFactureFichier] = useState<File | null>(null)
  const [facturePreview, setFacturePreview] = useState('')
  const [photoFichier, setPhotoFichier] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [enCours, setEnCours] = useState(false)
  const factureInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const valeurTotale = equipements.reduce((acc, e) => acc + (e.prix ?? 0), 0)

  const charger = async (identifiant: string) => {
    try {
      const data = await readImmobilisations(identifiant)
      setEquipements(data as Equipement[])
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    if (email) charger(email)
  }, [email])

  const viderFacture = () => {
    if (facturePreview) URL.revokeObjectURL(facturePreview)
    setFactureFichier(null)
    setFacturePreview('')
    if (factureInputRef.current) factureInputRef.current.value = ''
  }

  const viderPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFichier(null)
    setPhotoPreview('')
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  // Vérifie le fichier choisi (image, 15 Mo maximum) avant de le garder
  const fichierValide = (fichier: File): boolean => {
    if (!fichier.type.startsWith('image/')) {
      toast.error('Veuillez choisir une image.')
      return false
    }
    if (fichier.size > 15 * 1024 * 1024) {
      toast.error('La photo est trop lourde (15 Mo maximum).')
      return false
    }
    return true
  }

  const choisirFacture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0] ?? null
    if (facturePreview) URL.revokeObjectURL(facturePreview)
    if (!fichier) {
      setFactureFichier(null)
      setFacturePreview('')
      return
    }
    if (!fichierValide(fichier)) {
      viderFacture()
      return
    }
    setFactureFichier(fichier)
    setFacturePreview(URL.createObjectURL(fichier))
  }

  const choisirPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0] ?? null
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    if (!fichier) {
      setPhotoFichier(null)
      setPhotoPreview('')
      return
    }
    if (!fichierValide(fichier)) {
      viderPhoto()
      return
    }
    setPhotoFichier(fichier)
    setPhotoPreview(URL.createObjectURL(fichier))
  }

  const enregistrer = async () => {
    if (!email) {
      toast.error('Utilisateur non identifié. Réessayez dans un instant.')
      return
    }
    if (enCours) return

    const manquants: string[] = []
    if (!designation.trim()) manquants.push('Désignation')
    if (!dateAcquisition) manquants.push("Date d'acquisition")
    if (!prix || Number(prix) <= 0) manquants.push('Prix')
    if (manquants.length > 0) {
      toast.error(`Champs manquants ou invalides : ${manquants.join(', ')}`)
      return
    }
    if (dateAcquisition > aujourdhui()) {
      toast.error("La date d'acquisition ne peut pas être dans le futur.")
      return
    }

    // Même numéro de série déjà enregistré : on refuse avant d'envoyer les photos
    const serie = numeroSerie.trim().toLowerCase()
    if (serie && equipements.some((e) => e.numeroSerie?.trim().toLowerCase() === serie)) {
      toast.error('Un équipement avec ce numéro de série est déjà enregistré.')
      return
    }

    setEnCours(true)
    try {
      let factureUrl: string | undefined
      let photoUrl: string | undefined
      try {
        if (factureFichier) factureUrl = await envoyerPhoto(factureFichier, 'facture')
        if (photoFichier) photoUrl = await envoyerPhoto(photoFichier, 'equipement')
      } catch (error) {
        console.error(error)
        const detail = error instanceof Error ? error.message : ''
        toast.error(`Impossible d'envoyer la photo${detail ? ` (${detail})` : ''}. Réessayez ou retirez-la.`)
        return
      }

      const res = await createImmobilisation(
        {
          designation,
          dateAcquisition,
          prix: Number(prix),
          numeroSerie,
          factureUrl,
          photoUrl
        },
        email
      )
      if (!res.success) {
        toast.error(res.message)
        return
      }

      toast.success('Équipement enregistré avec succès')
      setDesignation('')
      setDateAcquisition(aujourdhui())
      setPrix(0)
      setNumeroSerie('')
      viderFacture()
      viderPhoto()
      await charger(email)
    } catch (error) {
      console.error(error)
      toast.error('Erreur réseau. Réessayez.')
    } finally {
      setEnCours(false)
    }
  }

  const supprimer = async (equipement: Equipement) => {
    if (!email) return
    if (!confirm(`Supprimer l'équipement « ${equipement.designation} » ?`)) return
    try {
      const res = await deleteImmobilisation(equipement.id, email)
      if (res.success) {
        toast.success('Équipement supprimé avec succès')
        await charger(email)
      } else {
        toast.error(res.message)
      }
    } catch (error) {
      console.error(error)
      toast.error('Erreur réseau. Réessayez.')
    }
  }

  return (
    <Wrapper>
      <div className='grid md:grid-cols-2 gap-6 font-bold'>

        {/* GAUCHE : formulaire d'enregistrement */}
        <div className='md:-mt-6'>
          <h1 className='text-2xl font-bold mb-2'>Enregistrer un équipement</h1>
          <div className='space-y-3'>
            <div>
              <label className='text-xs font-bold'>Désignation *</label>
              <input
                type="text"
                placeholder="Ex : Groupe électrogène"
                className='input input-bordered w-full'
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
              />
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div>
                <label className='text-xs font-bold'>Date d&apos;acquisition *</label>
                <input
                  type="date"
                  className='input input-bordered w-full'
                  value={dateAcquisition}
                  max={aujourdhui()}
                  onChange={(e) => setDateAcquisition(e.target.value)}
                />
              </div>
              <div>
                <label className='text-xs font-bold'>Prix (FBU) *</label>
                <input
                  type="number"
                  placeholder="0"
                  min={0}
                  className='input input-bordered w-full'
                  value={prix === 0 ? '' : prix}
                  onChange={(e) => setPrix(Number(e.target.value))}
                />
              </div>
            </div>

            <div>
              <label className='text-xs font-bold'>Numéro de série</label>
              <input
                type="text"
                className='input input-bordered w-full'
                value={numeroSerie}
                onChange={(e) => setNumeroSerie(e.target.value)}
              />
            </div>

            <ChampPhoto
              label="Photo de la facture (facultatif)"
              preview={facturePreview}
              inputRef={factureInputRef}
              onChoose={choisirFacture}
              onClear={viderFacture}
            />

            <ChampPhoto
              label="Photo de l'équipement (facultatif)"
              preview={photoPreview}
              inputRef={photoInputRef}
              onChoose={choisirPhoto}
              onClear={viderPhoto}
            />
          </div>

          <button
            onClick={enregistrer}
            disabled={enCours}
            className='btn btn-primary w-full mt-3 font-bold'
          >
            {enCours ? <span className='loading loading-spinner loading-sm'></span> : 'ENREGISTRER'}
          </button>
        </div>

        {/* DROITE : liste des équipements */}
        <div className='md:-mt-6'>
          <div className='border-2 border-base-200 p-4 rounded-3xl mb-2 flex items-center justify-between gap-3'>
            <div>
              <h2 className='text-2xl font-bold'>
                Équipements :
                <span className='ml-2 text-red'>{equipements.length}</span>
              </h2>
            </div>
            <div className='border-2 border-base-200 rounded-2xl px-4 py-2 text-center'>
              <p className='text-xs font-bold text-gray-600'>VALEUR TOTALE</p>
              <p className='text-base font-black text-success'>{fmt(valeurTotale)} FBU</p>
            </div>
          </div>

          <div className='space-y-3'>
            {equipements.length === 0 && (
              <p className='text-sm text-gray-500 normal-case'>Aucun équipement enregistré pour le moment.</p>
            )}

            {equipements.map((e) => {
              const peutSupprimer = Date.now() - new Date(e.createdAt).getTime() <= VINGT_QUATRE_HEURES_MS
              const factureOk = e.factureUrl && e.factureUrl.startsWith('https://')
              const photoOk = e.photoUrl && e.photoUrl.startsWith('https://')
              return (
                <div key={e.id} className='border-2 border-base-200 p-4 rounded-3xl flex items-center gap-3'>
                  {photoOk && (
                    <a href={e.photoUrl as string} target='_blank' rel='noopener noreferrer' className='shrink-0'>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={e.photoUrl as string}
                        alt={e.designation}
                        className='h-16 w-16 rounded-xl border-2 border-base-200 object-cover'
                      />
                    </a>
                  )}

                  <div className='flex-1 min-w-0'>
                    <p className='font-bold text-base truncate'>{e.designation}</p>
                    <p className='text-xs text-gray-600'>
                      Acquis le {new Date(e.dateAcquisition).toLocaleDateString('fr-FR', { timeZone: 'UTC' })}
                    </p>
                    {e.numeroSerie && (
                      <p className='text-xs text-gray-600 truncate'>N° de série : {e.numeroSerie}</p>
                    )}
                    {factureOk && (
                      <a
                        href={e.factureUrl as string}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='link link-primary text-xs font-bold inline-block mt-1'
                      >
                        Voir la facture
                      </a>
                    )}
                  </div>

                  <div className='text-right shrink-0'>
                    <p className='text-xs text-gray-600'>Prix</p>
                    <p className='font-black text-sm text-success'>{fmt(e.prix)}</p>
                  </div>

                  {peutSupprimer && (
                    <button
                      type="button"
                      aria-label="Supprimer l'équipement"
                      title="Supprimer (possible pendant 24h)"
                      className='btn btn-ghost btn-sm btn-circle text-error shrink-0'
                      onClick={() => supprimer(e)}
                    >
                      <Trash2 className='w-4 h-4' />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </Wrapper>
  )
}

export default page