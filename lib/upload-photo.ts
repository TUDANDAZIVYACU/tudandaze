// lib/upload-photo.ts
"use client"
import { upload } from '@vercel/blob/client'

function messageDe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error || 'erreur inconnue')
}

// Envoie une photo vers le stockage Vercel Blob et renvoie son adresse.
// 1) Envoi direct depuis le navigateur (rapide).
// 2) Si cela échoue (réseau du téléphone, navigateur...), envoi de secours via le serveur.
// Si les deux échouent, l'erreur contient la vraie raison de chaque échec.
export async function envoyerPhoto(
  pathname: string,
  fichier: File,
  contentType?: string
): Promise<{ url: string }> {
  const type = contentType || fichier.type || 'image/jpeg'

  try {
    const blob = await upload(pathname, fichier, {
      access: 'public',
      handleUploadUrl: '/api/upload-facture',
      contentType: type
    })
    return { url: blob.url }
  } catch (premiere) {
    console.error('Envoi direct de la photo échoué :', premiere)

    try {
      const aEnvoyer = new File([fichier], fichier.name || 'photo.jpg', { type })
      const formData = new FormData()
      formData.append('file', aEnvoyer)
      formData.append('pathname', pathname)

      const reponse = await fetch('/api/upload-photo', { method: 'POST', body: formData })
      const data = await reponse.json().catch(() => ({} as { url?: string; error?: string }))
      if (!reponse.ok || !data.url) {
        throw new Error(data.error || `Erreur serveur (${reponse.status})`)
      }
      return { url: data.url as string }
    } catch (seconde) {
      console.error('Envoi de secours de la photo échoué :', seconde)
      throw new Error(`envoi direct : ${messageDe(premiere)} / envoi de secours : ${messageDe(seconde)}`)
    }
  }
}
