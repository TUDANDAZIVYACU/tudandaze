"use client";
import React, { useEffect, useRef, useState } from 'react'
import Wrapper from '../components/Wrapper'
import { useUser } from '@clerk/nextjs'
import { envoyerPhoto as envoyerVersStockage } from '@/lib/upload-photo'
import { toast } from 'react-toastify'
import { Wrench } from 'lucide-react'
import { BoutonsExport } from '../components/suivi-ui'
import { Kpi, CarteBarres } from '../components/analyse-ui'
import { nomFichierSur, type TableauExport } from '@/lib/export-tableau'
import {
  createImmobilisation,
  readImmobilisations
} from '../actions-immobilisations'
import { getBusinessName } from '../actions'

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
  <div className='flex flex-col gap-1'>
    <span className='text-sm font-normal opacity-70'>{label}</span>
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      onChange={onChoose}
      className='file-input file-input-bordered w-full'
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

  // ───────── Recherche, chiffres clés et export ─────────
  const [recherche, setRecherche] = useState('')
  const [nomEntreprise, setNomEntreprise] = useState('')

  useEffect(() => {
    if (!email) return
    getBusinessName(email)
      .then((nom) => setNomEntreprise(nom))
      .catch((error) => console.error(error))
  }, [email])

  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const visibles = equipements.filter((e) => {
    const q = norm(recherche.trim())
    return !q || norm(`${e.designation} ${e.numeroSerie ?? ''}`).includes(q)
  })

  const anneeDe = (e: Equipement) => new Date(e.dateAcquisition).getUTCFullYear()
  const anneeCourante = Number(aujourdhui().slice(0, 4))
  const acquisCetteAnnee = equipements.filter((e) => anneeDe(e) === anneeCourante)
  const valeurAnnee = acquisCetteAnnee.reduce((acc, e) => acc + (e.prix ?? 0), 0)
  const plusCher = equipements.reduce<Equipement | null>((m, e) => (m === null || e.prix > m.prix ? e : m), null)
  const parAnnee = (Object.entries as (o: Record<string, { valeur: number; nombre: number }>) => [string, { valeur: number; nombre: number }][])(
    equipements.reduce<Record<string, { valeur: number; nombre: number }>>((acc, e) => {
      const cle = String(anneeDe(e))
      const ligne = acc[cle] ?? { valeur: 0, nombre: 0 }
      acc[cle] = { valeur: ligne.valeur + (e.prix ?? 0), nombre: ligne.nombre + 1 }
      return acc
    }, {})
  ).sort((a, b) => Number(b[0]) - Number(a[0]))

  const tableauExport: TableauExport | null =
    equipements.length > 0
      ? {
          organisation: nomEntreprise || undefined,
          titre: 'Liste des équipements',
          sousTitre: `Édité le ${new Date().toLocaleDateString('fr-FR')}`,
          nomFichier: `equipements-${nomFichierSur(nomEntreprise || 'entreprise')}`,
          colonnes: ['Désignation', "Date d'acquisition", 'N° de série', 'Prix (FBU)'],
          lignes: equipements.map((e) => [
            e.designation,
            new Date(e.dateAcquisition).toLocaleDateString('fr-FR', { timeZone: 'UTC' }),
            e.numeroSerie ?? '',
            Math.round(e.prix)
          ]),
          colonnesGras: [3],
          resume: [
            { libelle: 'Équipements', valeur: equipements.length },
            { libelle: 'Valeur totale (FBU)', valeur: Math.round(valeurTotale), ton: 'vert' }
          ],
          totaux: [{ libelle: 'Valeur totale (FBU)', valeur: Math.round(valeurTotale), ton: 'vert' }]
        }
      : null

  const champ = 'flex flex-col gap-1'
  const libelle = 'text-sm font-normal opacity-70'

  return (
    <Wrapper>
      <div className='space-y-4'>

        {/* En-tête */}
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold leading-tight md:text-3xl'>Équipements</h1>
            <p className='text-sm font-normal opacity-60'>Le matériel de l&apos;entreprise et sa valeur</p>
          </div>
          <BoutonsExport tableau={tableauExport} />
        </div>

        {/* Chiffres clés */}
        <section className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          <Kpi libelle='Équipements' valeur={String(equipements.length)} unite='' classeValeur='text-primary' />
          <Kpi libelle='Valeur totale' valeur={fmt(valeurTotale)} classeValeur='text-success' />
          <Kpi
            libelle={`Acquis en ${anneeCourante}`}
            valeur={fmt(valeurAnnee)}
            note={`${acquisCetteAnnee.length} équipement${acquisCetteAnnee.length > 1 ? 's' : ''}`}
          />
          <Kpi
            libelle='Équipement le plus cher'
            valeur={fmt(plusCher?.prix ?? 0)}
            note={plusCher ? plusCher.designation : 'aucun'}
          />
        </section>

        <div className='grid gap-4 lg:grid-cols-12'>

          {/* GAUCHE : formulaire d'enregistrement */}
          <section className='rounded-2xl bg-base-100 p-5 shadow-sm md:p-6 lg:col-span-5'>
            <h2 className='text-lg font-bold'>Enregistrer un équipement</h2>

            <div className='mt-4 space-y-4'>
              <label className={champ}>
                <span className={libelle}>Désignation *</span>
                <input
                  type="text"
                  placeholder="Ex : Groupe électrogène"
                  className='input input-bordered w-full'
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                />
              </label>

              <div className='grid grid-cols-2 gap-3'>
                <label className={champ}>
                  <span className={libelle}>Date d&apos;acquisition *</span>
                  <input
                    type="date"
                    className='input input-bordered w-full'
                    value={dateAcquisition}
                    max={aujourdhui()}
                    onChange={(e) => setDateAcquisition(e.target.value)}
                  />
                </label>
                <label className={champ}>
                  <span className={libelle}>Prix (FBU) *</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    min={0}
                    className='input input-bordered w-full'
                    value={prix === 0 ? '' : prix}
                    onChange={(e) => setPrix(Number(e.target.value))}
                  />
                </label>
              </div>

              <label className={champ}>
                <span className={libelle}>Numéro de série</span>
                <input
                  type="text"
                  className='input input-bordered w-full'
                  value={numeroSerie}
                  onChange={(e) => setNumeroSerie(e.target.value)}
                />
              </label>

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

              <button
                onClick={enregistrer}
                disabled={enCours}
                className='btn btn-primary h-12 w-full text-base'
              >
                {enCours ? <span className='loading loading-spinner loading-sm'></span> : 'Enregistrer'}
              </button>
            </div>
          </section>

          {/* DROITE : répartition par année et liste */}
          <div className='space-y-4 lg:col-span-7'>
            {parAnnee.length > 0 && (
              <CarteBarres
                titre="Valeur acquise par année"
                classe='bg-primary'
                lignes={parAnnee.map(([annee, v]) => ({
                  libelle: annee,
                  valeur: v.valeur,
                  detail: `${v.nombre} équipement${v.nombre > 1 ? 's' : ''}`
                }))}
              />
            )}

            <section className='rounded-2xl bg-base-100 p-5 shadow-sm md:p-6'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <h2 className='text-lg font-bold'>Liste des équipements</h2>
                <span className='badge badge-primary badge-soft font-bold'>
                  {visibles.length} équipement{visibles.length > 1 ? 's' : ''}
                </span>
              </div>

              <input
                type="text"
                placeholder='Rechercher un équipement...'
                aria-label='Rechercher un équipement'
                className='input input-bordered mt-4 w-full'
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
              />

              {equipements.length === 0 && (
                <p className='mt-4 text-sm font-normal opacity-70'>Aucun équipement enregistré pour le moment.</p>
              )}
              {equipements.length > 0 && visibles.length === 0 && (
                <p className='mt-4 text-sm font-normal opacity-70'>Aucun équipement ne correspond à la recherche.</p>
              )}

              {visibles.length > 0 && (
                <div className='mt-4 divide-y divide-base-300'>
                  {visibles.map((e) => {
                    const factureOk = e.factureUrl && e.factureUrl.startsWith('https://')
                    const photoOk = e.photoUrl && e.photoUrl.startsWith('https://')
                    return (
                      <div key={e.id} className='flex items-center gap-3 py-3'>
                        {photoOk ? (
                          <a href={e.photoUrl as string} target='_blank' rel='noopener noreferrer' className='shrink-0'>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={e.photoUrl as string}
                              alt={e.designation}
                              className='h-14 w-14 rounded-xl border border-base-300 object-cover'
                            />
                          </a>
                        ) : (
                          <span className='flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-base-200'>
                            <Wrench className='h-6 w-6 opacity-50' />
                          </span>
                        )}

                        <div className='min-w-0 flex-1'>
                          <p className='truncate font-bold leading-tight'>{e.designation}</p>
                          <p className='text-xs font-normal opacity-60'>
                            Acquis le {new Date(e.dateAcquisition).toLocaleDateString('fr-FR', { timeZone: 'UTC' })}
                          </p>
                          {e.numeroSerie && (
                            <p className='truncate text-xs font-normal opacity-60'>N° de série : {e.numeroSerie}</p>
                          )}
                          {factureOk && (
                            <a
                              href={e.factureUrl as string}
                              target='_blank'
                              rel='noopener noreferrer'
                              className='link link-primary mt-0.5 inline-block text-xs font-semibold'
                            >
                              Voir la facture
                            </a>
                          )}
                        </div>

                        <div className='shrink-0 text-right'>
                          <p className='text-xs font-normal opacity-60'>Prix</p>
                          <p className='font-bold tabular-nums text-success'>{fmt(e.prix)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </Wrapper>
  )
}

export default page
