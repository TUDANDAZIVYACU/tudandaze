// lib/photo.ts
// Photos acceptées : tout format d'image courant (JPEG, PNG, WebP, GIF, AVIF, BMP, TIFF,
// et HEIC/HEIF des iPhone). Le SVG est exclu : il peut contenir du code.

export const TAILLE_MAX_PHOTO = 15 * 1024 * 1024 // 15 Mo

const TYPES_PAR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
}

// Variantes de types MIME envoyées par certains téléphones / navigateurs
const ALIAS_MIME: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
  "image/x-ms-bmp": "image/bmp",
  "image/tif": "image/tiff",
  "image/x-heic": "image/heic",
  "image/x-heif": "image/heif",
  "image/heic-sequence": "image/heic",
  "image/heif-sequence": "image/heif",
}

const MIME_AUTORISES = new Set(Object.values(TYPES_PAR_EXTENSION))

// Extension du nom de fichier ("" si le nom n'a pas de point, fréquent sur Android)
function extensionDe(nom: string): string {
  const i = nom.lastIndexOf(".")
  if (i === -1) return ""
  return nom.slice(i + 1).toLowerCase()
}

// Certains téléphones ne renseignent pas le type du fichier, ou donnent un nom sans extension :
// on accepte alors le fichier (le champ ne propose déjà que des images) sauf s'il est clairement autre chose.
export function estPhoto(fichier: File): boolean {
  const type = fichier.type.toLowerCase()
  const ext = extensionDe(fichier.name)
  if (type === "image/svg+xml" || ext === "svg") return false
  if (type.startsWith("image/")) return true
  if (TYPES_PAR_EXTENSION[ext] !== undefined) return true
  if ((type === "" || type === "application/octet-stream") && ext === "") return true
  return false
}

// Type MIME à envoyer au stockage : toujours un type standard accepté par le serveur
export function typeMimePhoto(fichier: File): string {
  const type = fichier.type.toLowerCase()
  const canonique = ALIAS_MIME[type] ?? type
  if (MIME_AUTORISES.has(canonique)) return canonique
  return TYPES_PAR_EXTENSION[extensionDe(fichier.name)] ?? "image/jpeg"
}

type ImageChargee = {
  source: CanvasImageSource
  largeur: number
  hauteur: number
  liberer: () => void
}

// 1re méthode : createImageBitmap ; 2e méthode (si elle échoue) : élément <img>,
// que certains navigateurs mobiles savent lire pour des formats que createImageBitmap refuse.
async function chargerImage(fichier: File): Promise<ImageChargee> {
  try {
    const bitmap = await createImageBitmap(fichier)
    return {
      source: bitmap,
      largeur: bitmap.width,
      hauteur: bitmap.height,
      liberer: () => bitmap.close(),
    }
  } catch {
    const url = URL.createObjectURL(fichier)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error("Lecture de l'image impossible"))
        el.src = url
      })
      return {
        source: img,
        largeur: img.naturalWidth,
        hauteur: img.naturalHeight,
        liberer: () => URL.revokeObjectURL(url),
      }
    } catch (e) {
      URL.revokeObjectURL(url)
      throw e
    }
  }
}

// Réduit la photo (max 1600 px, JPEG) pour un envoi rapide.
// Si le navigateur ne sait pas lire le format, on garde l'original (avec un type MIME corrigé).
export async function compresserImage(fichier: File): Promise<File> {
  const original = () =>
    new File([fichier], fichier.name || "photo", { type: typeMimePhoto(fichier) })

  try {
    const image = await chargerImage(fichier)
    try {
      if (!image.largeur || !image.hauteur) return original()
      const max = 1600
      const ratio = Math.min(1, max / Math.max(image.largeur, image.hauteur))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(image.largeur * ratio)
      canvas.height = Math.round(image.hauteur * ratio)
      const ctx = canvas.getContext("2d")
      if (!ctx) return original()
      // Fond blanc : sans lui, la transparence d'un PNG deviendrait noire en JPEG
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height)
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.8)
      )
      if (!blob) return original()
      return new File([blob], "photo.jpg", { type: "image/jpeg" })
    } finally {
      image.liberer()
    }
  } catch {
    return original()
  }
}