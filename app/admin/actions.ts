"use server"
import { clerkClient, currentUser } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { resoudreAcces } from '@/lib/acces'

// Chaque entreprise cliente a SES propres utilisateurs : un administrateur ne voit et ne gère
// que l'équipe de son entreprise (table MembreBusinessbi), jamais les comptes des autres.

class ErreurMetier extends Error {}

type Resultat = { success: true; message?: string } | { success: false; message: string }

export type UserRow = {
  id: string
  email: string
  fullName: string
  role: 'admin' | 'caissier'
  status: 'actif' | 'en_attente'
  // Titulaire du compte de l'entreprise : toujours administrateur, ne peut pas être retiré
  estProprietaire: boolean
}

// Vérifie que l'appelant est administrateur d'une entreprise cliente et renvoie l'identifiant de CETTE entreprise.
// Le rôle vient de la base de données (resoudreAcces), pas d'une valeur modifiable côté navigateur.
async function exigerAdminEntreprise(): Promise<string> {
  const user = await currentUser()
  if (!user) throw new ErreurMetier("Non connecté.")
  const acces = await resoudreAcces(user)
  if (acces.type !== 'client' || acces.role !== 'admin') {
    throw new ErreurMetier("Acces refuse : reserve aux administrateurs")
  }
  return acces.businessbiId
}

function messageSur(error: unknown): string {
  if (error instanceof ErreurMetier) return error.message
  console.error(error)
  return "Une erreur s'est produite. Vérifiez votre connexion et réessayez."
}

function roleValide(role: string): role is 'admin' | 'caissier' {
  return role === 'admin' || role === 'caissier'
}

// Liste l'équipe de l'entreprise de l'administrateur connecté :
// le titulaire du compte + les membres ajoutés (actifs, ou en attente de leur première connexion).
export async function getUsersList(): Promise<UserRow[]> {
  const businessbiId = await exigerAdminEntreprise()

  const entreprise = await prisma.businessbi.findUnique({
    where: { id: businessbiId },
    select: {
      name: true,
      email: true,
      telephone: true,
      proprietaire: true,
      membres: { orderBy: { createdAt: 'asc' } }
    }
  })
  if (!entreprise) throw new Error("Entreprise introuvable.")

  // Noms des membres déjà connectés (lus dans Clerk, sans bloquer l'affichage en cas de coupure)
  const noms = new Map<string, string>()
  const ids = entreprise.membres.map(m => m.clerkUserId).filter((id): id is string => !!id)
  if (ids.length > 0) {
    try {
      const client = await clerkClient()
      const { data } = await client.users.getUserList({ userId: ids, limit: 100 })
      data.forEach(u => noms.set(u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()))
    } catch (error) {
      console.error(error)
    }
  }

  const proprietaire: UserRow = {
    id: `proprietaire:${businessbiId}`,
    email: entreprise.email ?? entreprise.telephone ?? "-",
    fullName: entreprise.proprietaire?.trim() || entreprise.name,
    role: 'admin',
    status: 'actif',
    estProprietaire: true
  }

  const membres: UserRow[] = entreprise.membres.map(m => ({
    id: m.id,
    email: m.email ?? m.telephone ?? "-",
    fullName: (m.clerkUserId && noms.get(m.clerkUserId)) || m.nom || "-",
    role: m.role === 'admin' ? 'admin' : 'caissier',
    status: m.clerkUserId ? 'actif' : 'en_attente',
    estProprietaire: false
  }))

  return [proprietaire, ...membres]
}

export async function updateUserRole(userId: string, role: 'admin' | 'caissier'): Promise<Resultat> {
  try {
    const businessbiId = await exigerAdminEntreprise()
    if (!roleValide(role)) throw new ErreurMetier("Rôle invalide.")

    // Le membre doit appartenir à l'entreprise de l'administrateur
    const membre = await prisma.membreBusinessbi.findFirst({ where: { id: userId, businessbiId } })
    if (!membre) throw new ErreurMetier("Utilisateur introuvable dans votre entreprise.")

    await prisma.membreBusinessbi.update({ where: { id: membre.id }, data: { role } })

    // Le rôle est aussi recopié dans Clerk (menus et zones réservées aux administrateurs)
    if (membre.clerkUserId) {
      try {
        const client = await clerkClient()
        await client.users.updateUserMetadata(membre.clerkUserId, { publicMetadata: { role } })
      } catch (error) {
        // Non bloquant : le rôle de la base sera recopié à sa prochaine connexion
        console.error(error)
      }
    }

    revalidatePath('/admin')
    return { success: true }
  } catch (error) {
    return { success: false, message: messageSur(error) }
  }
}

// Retire un membre de l'équipe (ou annule son invitation s'il ne s'est pas encore connecté).
// Son compte de connexion n'est pas supprimé : il perd seulement l'accès à cette entreprise.
export async function deleteUser(userId: string): Promise<Resultat> {
  try {
    const businessbiId = await exigerAdminEntreprise()

    const membre = await prisma.membreBusinessbi.findFirst({ where: { id: userId, businessbiId } })
    if (!membre) throw new ErreurMetier("Utilisateur introuvable dans votre entreprise.")

    await prisma.membreBusinessbi.delete({ where: { id: membre.id } })

    try {
      const client = await clerkClient()
      if (membre.clerkUserId) {
        // Il ne garde pas le rôle (admin / caissier) de cette entreprise
        await client.users.updateUserMetadata(membre.clerkUserId, { publicMetadata: { role: null } })
      } else if (membre.email) {
        // Invitation pas encore acceptée : on l'annule
        const { data: invitations } = await client.invitations.getInvitationList({ limit: 100, status: 'pending' })
        for (const inv of invitations) {
          if (inv.emailAddress.toLowerCase() === membre.email.toLowerCase()) {
            await client.invitations.revokeInvitation(inv.id)
          }
        }
      }
    } catch (error) {
      // Non bloquant : l'accès est déjà retiré dans la base
      console.error(error)
    }

    revalidatePath('/admin')
    return { success: true }
  } catch (error) {
    return { success: false, message: messageSur(error) }
  }
}

// Ajoute un utilisateur à l'équipe de l'entreprise de l'administrateur connecté.
// - Pas encore de compte : une invitation Clerk lui est envoyée par email.
// - Compte déjà existant : il est simplement ajouté, et peut se connecter tout de suite.
export async function inviteUser(email: string, role: 'admin' | 'caissier'): Promise<Resultat> {
  try {
    const businessbiId = await exigerAdminEntreprise()

    const adresse = email?.trim().toLowerCase()
    if (!adresse) throw new ErreurMetier("Email requis.")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) throw new ErreurMetier("Email invalide.")
    if (!roleValide(role)) throw new ErreurMetier("Rôle invalide.")

    // Un email n'appartient qu'à une seule entreprise (ou assureur)
    const [titulaire, membreExistant, utilisateurAssureur] = await Promise.all([
      prisma.businessbi.findUnique({ where: { email: adresse }, select: { id: true } }),
      prisma.membreBusinessbi.findUnique({ where: { email: adresse }, select: { businessbiId: true } }),
      prisma.assureurUser.findUnique({ where: { email: adresse }, select: { id: true } })
    ])
    if (titulaire?.id === businessbiId || membreExistant?.businessbiId === businessbiId) {
      throw new ErreurMetier("Cet utilisateur fait déjà partie de votre équipe.")
    }
    if (titulaire || membreExistant || utilisateurAssureur) {
      throw new ErreurMetier("Cet email est déjà utilisé par un autre compte.")
    }

    const client = await clerkClient()
    const { data: comptes } = await client.users.getUserList({ emailAddress: [adresse], limit: 1 })
    const compteExistant = comptes[0]

    try {
      await prisma.membreBusinessbi.create({ data: { email: adresse, businessbiId, role } })
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ErreurMetier("Cet email est déjà utilisé par un autre compte.")
      throw error
    }

    if (compteExistant) {
      // Le rôle est recopié dans Clerk (sans bloquer) ; le compte sera lié à l'entreprise à sa prochaine connexion
      try {
        await client.users.updateUserMetadata(compteExistant.id, { publicMetadata: { role } })
      } catch (error) {
        console.error(error)
      }
      revalidatePath('/admin')
      return { success: true, message: "Utilisateur ajouté : il a déjà un compte et peut se connecter." }
    }

    try {
      await client.invitations.createInvitation({ emailAddress: adresse, publicMetadata: { role } })
    } catch (error) {
      // L'invitation n'est pas partie : on annule l'ajout pour ne pas laisser un membre fantôme
      console.error(error)
      await prisma.membreBusinessbi.delete({ where: { email: adresse } }).catch(() => {})
      throw new ErreurMetier("Impossible d'envoyer l'invitation. Vérifiez l'adresse email et réessayez.")
    }

    revalidatePath('/admin')
    return {
      success: true,
      message: "Invitation envoyée. Si elle n'arrive pas, vérifiez les courriers indésirables, ou demandez à la personne de s'inscrire sur le site avec cet email."
    }
  } catch (error) {
    return { success: false, message: messageSur(error) }
  }
}

// Renvoie l'invitation d'un membre qui ne s'est pas encore connecté :
// l'ancienne invitation est annulée, puis une nouvelle est envoyée.
export async function renvoyerInvitation(userId: string): Promise<Resultat> {
  try {
    const businessbiId = await exigerAdminEntreprise()

    const membre = await prisma.membreBusinessbi.findFirst({ where: { id: userId, businessbiId } })
    if (!membre || !membre.email) throw new ErreurMetier("Utilisateur introuvable dans votre entreprise.")
    if (membre.clerkUserId) throw new ErreurMetier("Cet utilisateur s'est déjà connecté.")

    const client = await clerkClient()
    try {
      const { data: invitations } = await client.invitations.getInvitationList({ limit: 100, status: 'pending' })
      for (const inv of invitations) {
        if (inv.emailAddress.toLowerCase() === membre.email.toLowerCase()) {
          await client.invitations.revokeInvitation(inv.id)
        }
      }
      await client.invitations.createInvitation({
        emailAddress: membre.email,
        publicMetadata: { role: membre.role === 'admin' ? 'admin' : 'caissier' }
      })
    } catch (error) {
      console.error(error)
      throw new ErreurMetier("Impossible de renvoyer l'invitation. Demandez à cette personne de s'inscrire directement sur le site avec cet email.")
    }

    return { success: true, message: "Invitation renvoyée. Pensez à vérifier les courriers indésirables." }
  } catch (error) {
    return { success: false, message: messageSur(error) }
  }
}