import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

// Formats de photo acceptés (le SVG est volontairement exclu : il peut contenir du code).
// Les variantes (image/jpg, etc.) sont tolérées au cas où un téléphone les enverrait.
const TYPES_PHOTO_AUTORISES = [
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/x-png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
  'image/x-ms-bmp',
  'image/tiff',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence'
]

// Dossiers autorisés dans le stockage (mêmes que la route d'envoi de secours)
const DOSSIERS_AUTORISES = ['factures/', 'pieces-stock/', 'immobilisations/']

// Aligné sur TAILLE_MAX_PHOTO (lib/photo.ts) : si la compression échoue,
// la photo d'origine est envoyée telle quelle.
const TAILLE_MAX_OCTETS = 15 * 1024 * 1024

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as HandleUploadBody

    const reponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // auth() lit la session dans la requête : aucun appel réseau vers Clerk,
        // contrairement à currentUser() qui échoue quand la connexion est instable.
        const { userId } = await auth()
        if (!userId) throw new Error('Non connecté.')

        if (
          !DOSSIERS_AUTORISES.some((dossier) => pathname.startsWith(dossier)) ||
          pathname.includes('..')
        ) {
          throw new Error("Dossier d'envoi non autorisé.")
        }

        return {
          allowedContentTypes: TYPES_PHOTO_AUTORISES,
          maximumSizeInBytes: TAILLE_MAX_OCTETS,
          addRandomSuffix: true
        }
      }
      // Pas de onUploadCompleted : l'URL est enregistrée avec le produit ou l'approvisionnement
    })
    return NextResponse.json(reponse)
  } catch (error) {
    console.error('upload-facture :', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}