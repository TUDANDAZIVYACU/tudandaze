import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { put } from '@vercel/blob'

// Envoi de secours : la photo passe par le serveur quand l'envoi direct depuis le navigateur échoue.
// Formats acceptés (le SVG est exclu : il peut contenir du code)
const TYPES_PHOTO_AUTORISES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'image/heic',
  'image/heif'
]

// Dossiers autorisés dans le stockage
const DOSSIERS_AUTORISES = ['factures/', 'pieces-stock/', 'immobilisations/']

// Les fonctions Vercel acceptent au maximum 4,5 Mo par requête
const TAILLE_MAX_OCTETS = 4 * 1024 * 1024

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Non connecté.' }, { status: 401 })
    }

    const formData = await request.formData()
    const fichier = formData.get('file')
    const pathname = String(formData.get('pathname') || '')

    if (!(fichier instanceof File)) {
      return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 })
    }

    if (
      !DOSSIERS_AUTORISES.some((dossier) => pathname.startsWith(dossier)) ||
      pathname.includes('..')
    ) {
      return NextResponse.json({ error: "Dossier d'envoi non autorisé." }, { status: 400 })
    }

    const type = (fichier.type || '').toLowerCase()
    if (!TYPES_PHOTO_AUTORISES.includes(type)) {
      return NextResponse.json({ error: `Format non accepté (${type || 'inconnu'}).` }, { status: 400 })
    }

    if (fichier.size > TAILLE_MAX_OCTETS) {
      return NextResponse.json(
        { error: 'Photo trop lourde pour l\'envoi de secours (4 Mo maximum).' },
        { status: 413 }
      )
    }

    const blob = await put(pathname, fichier, {
      access: 'public',
      addRandomSuffix: true,
      contentType: type
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error('upload-photo :', error)
    return NextResponse.json({ error: (error as Error).message || 'Erreur serveur.' }, { status: 500 })
  }
}