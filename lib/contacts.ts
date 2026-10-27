import { prisma } from "@/lib/prisma"
import { normaliserTelephone } from "@/lib/telephone"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type Contact = { email: string | null; telephone: string | null }

// Nettoie et valide un email et/ou un téléphone (au moins l'un des deux est requis)
export function nettoyerContact(email?: string | null, telephone?: string | null): Contact {
    const e = email?.trim().toLowerCase() || null
    if (e && !EMAIL_REGEX.test(e)) throw new Error("Adresse email invalide.")

    const brut = telephone?.trim()
    const t = brut ? normaliserTelephone(brut) : null
    if (brut && !t) throw new Error("Numéro de téléphone invalide.")

    if (!e && !t) throw new Error("Un email ou un numéro de téléphone est requis.")
    return { email: e, telephone: t }
}

// Vérifie qu'aucun client ni utilisateur d'assureur n'utilise déjà cet email / ce téléphone.
// Un même identifiant ne doit jamais désigner deux comptes, sinon l'accès serait ambigu.
export async function verifierIdentifiantsLibres(
    contact: Contact,
    exclure?: { businessbiId?: string; assureurUserId?: string }
) {
    const filtre = [
        ...(contact.email ? [{ email: contact.email }] : []),
        ...(contact.telephone ? [{ telephone: contact.telephone }] : [])
    ]
    if (filtre.length === 0) return

    const [client, utilisateur] = await Promise.all([
        prisma.businessbi.findFirst({
            where: {
                OR: filtre,
                ...(exclure?.businessbiId ? { id: { not: exclure.businessbiId } } : {})
            },
            select: { id: true }
        }),
        prisma.assureurUser.findFirst({
            where: {
                OR: filtre,
                ...(exclure?.assureurUserId ? { id: { not: exclure.assureurUserId } } : {})
            },
            select: { id: true }
        })
    ])

    if (client || utilisateur) {
        throw new Error("Cet email ou ce numéro de téléphone est déjà enregistré.")
    }
}
