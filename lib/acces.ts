import type { User } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

// Mettre à true pour bloquer les clients qui n'ont pas (encore) d'assureur.
// Par défaut les clients existants (sans assureur) gardent l'accès tant que accesActif est vrai.
const BLOQUER_CLIENTS_SANS_ASSUREUR = false;

export type Acces =
  | { type: 'owner' }
  | { type: 'assureur'; assureurId: string; role: string }
  // role : 'admin' pour le titulaire du compte de l'entreprise, ou le rôle donné à un membre de son équipe
  | { type: 'client'; businessbiId: string; role: 'admin' | 'caissier' }
  // Compte connecté mais pas encore rattaché : il doit saisir le code d'un assureur (page /inscription)
  | { type: 'inscription' }
  | {
      type: 'refuse';
      motif: 'non-enregistre' | 'client-suspendu' | 'assureur-suspendu' | 'sans-assureur';
    };

// Identifiants VÉRIFIÉS dans Clerk (emails en minuscules, téléphones au format international)
function identifiantsVerifies(user: User) {
  const emails = user.emailAddresses
    .filter((e) => e.verification?.status === 'verified')
    .map((e) => e.emailAddress.toLowerCase());
  const telephones = user.phoneNumbers
    .filter((p) => p.verification?.status === 'verified')
    .map((p) => p.phoneNumber);
  return { emails, telephones };
}

export async function resoudreAcces(user: User): Promise<Acces> {
  const { emails, telephones } = identifiantsVerifies(user);

  // 1. Propriétaires de l'application
  const proprietaires = (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (emails.some((e) => proprietaires.includes(e))) {
    return { type: 'owner' };
  }

  // 2. Recherche par email OU téléphone
  const filtre: { email?: { in: string[] }; telephone?: { in: string[] } }[] = [];
  if (emails.length) filtre.push({ email: { in: emails } });
  if (telephones.length) filtre.push({ telephone: { in: telephones } });
  // Aucun identifiant vérifié : impossible d'enregistrer ce compte
  if (filtre.length === 0) return { type: 'refuse', motif: 'non-enregistre' };

  const [assureurUser, client, membre] = await Promise.all([
    prisma.assureurUser.findFirst({
      where: { OR: filtre },
      include: { assureur: { select: { actif: true } } },
    }),
    prisma.businessbi.findFirst({
      where: { OR: filtre },
      select: {
        id: true,
        accesActif: true,
        assureurId: true,
        assureur: { select: { actif: true } },
      },
    }),
    // Membre de l'équipe d'une entreprise cliente (ajouté par l'administrateur de cette entreprise)
    prisma.membreBusinessbi.findFirst({
      where: { OR: filtre },
      select: {
        id: true,
        role: true,
        clerkUserId: true,
        businessbi: {
          select: {
            id: true,
            accesActif: true,
            assureurId: true,
            assureur: { select: { actif: true } },
          },
        },
      },
    }),
  ]);

  // 3. Utilisateur d'un assureur
  if (assureurUser) {
    // Déjà lié à un autre compte Clerk : on refuse
    if (assureurUser.clerkUserId && assureurUser.clerkUserId !== user.id) {
      return { type: 'refuse', motif: 'non-enregistre' };
    }
    if (!assureurUser.assureur.actif) {
      return { type: 'refuse', motif: 'assureur-suspendu' };
    }
    // Première connexion : on lie le compte Clerk
    if (!assureurUser.clerkUserId) {
      await prisma.assureurUser.update({
        where: { id: assureurUser.id },
        data: { clerkUserId: user.id },
      });
    }
    return { type: 'assureur', assureurId: assureurUser.assureurId, role: assureurUser.role };
  }

  // 4. Client : titulaire du compte de l'entreprise (toujours administrateur)
  if (client) {
    if (!client.accesActif) return { type: 'refuse', motif: 'client-suspendu' };
    if (client.assureur && !client.assureur.actif) {
      return { type: 'refuse', motif: 'assureur-suspendu' };
    }
    if (!client.assureurId && BLOQUER_CLIENTS_SANS_ASSUREUR) {
      return { type: 'refuse', motif: 'sans-assureur' };
    }
    return { type: 'client', businessbiId: client.id, role: 'admin' };
  }

  // 5. Client : membre de l'équipe d'une entreprise (administrateur ou caissier)
  if (membre) {
    // Déjà lié à un autre compte Clerk : on refuse
    if (membre.clerkUserId && membre.clerkUserId !== user.id) {
      return { type: 'refuse', motif: 'non-enregistre' };
    }
    const entreprise = membre.businessbi;
    if (!entreprise.accesActif) return { type: 'refuse', motif: 'client-suspendu' };
    if (entreprise.assureur && !entreprise.assureur.actif) {
      return { type: 'refuse', motif: 'assureur-suspendu' };
    }
    if (!entreprise.assureurId && BLOQUER_CLIENTS_SANS_ASSUREUR) {
      return { type: 'refuse', motif: 'sans-assureur' };
    }
    // Première connexion : on lie le compte Clerk
    if (!membre.clerkUserId) {
      await prisma.membreBusinessbi.update({
        where: { id: membre.id },
        data: { clerkUserId: user.id },
      });
    }
    return {
      type: 'client',
      businessbiId: entreprise.id,
      role: membre.role === 'admin' ? 'admin' : 'caissier',
    };
  }

  // 6. Compte inconnu : il s'enregistre lui-même avec le code de son assureur
  return { type: 'inscription' };
}
