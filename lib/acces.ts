import type { User } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { DUREE_ESSAI_JOURS } from '@/lib/plans';
import { emailAutorise } from '@/lib/acces-limite';

// Mettre à true pour bloquer les clients qui n'ont pas (encore) d'agentvendeur.
// Par défaut les clients existants (sans agentvendeur) gardent l'accès tant que accesActif est vrai.
const BLOQUER_CLIENTS_SANS_AGENTVENDEUR = false;

export type Acces =
  | { type: 'owner' }
  | { type: 'agentvendeur'; agentvendeurId: string; role: string }
  // role : 'admin' pour le titulaire du compte de l'entreprise, ou le rôle donné à un membre de son équipe
  // abonnementFin : fin de l'abonnement (ou de l'essai) en millisecondes ; le proxy bloque l'application une fois dépassée
  | { type: 'client'; businessbiId: string; role: 'admin' | 'caissier'; abonnementFin: number }
  // Compte connecté mais pas encore rattaché : il doit saisir le code d'un agentvendeur (page /inscription)
  | { type: 'inscription' }
  | {
      type: 'refuse';
      // 'acces-limite' : l'application est réservée à quelques adresses pendant le développement (voir lib/acces-limite.ts)
      motif: 'non-enregistre' | 'client-suspendu' | 'agentvendeur-suspendu' | 'sans-agentvendeur' | 'acces-limite';
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

// Fin d'abonnement d'une entreprise. Si elle n'a encore aucun abonnement (client créé avant
// la mise en place des abonnements), on lui ouvre un essai gratuit à partir de maintenant.
async function finAbonnement(
  businessbiId: string,
  abonnement: { dateFin: Date } | null
): Promise<number> {
  if (abonnement) return abonnement.dateFin.getTime();

  const dateFin = new Date(Date.now() + DUREE_ESSAI_JOURS * 24 * 60 * 60 * 1000);
  try {
    const cree = await prisma.abonnement.upsert({
      where: { businessbiId },
      update: {},
      create: { businessbiId, statut: 'essai', dateFin },
      select: { dateFin: true },
    });
    return cree.dateFin.getTime();
  } catch (error) {
    console.error('Création de l\'essai gratuit:', error);
    return dateFin.getTime();
  }
}

export async function resoudreAcces(user: User): Promise<Acces> {
  const { emails, telephones } = identifiantsVerifies(user);

  // 1. Propriétaires de l'application (toujours autorisés, même quand l'accès est limité)
  const proprietaires = (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (emails.some((e) => proprietaires.includes(e))) {
    return { type: 'owner' };
  }

  // 1 bis. Accès limité pendant le développement : seules les adresses de ACCES_LIMITE_EMAILS peuvent entrer.
  // Variable absente ou vide = tout le monde (voir lib/acces-limite.ts).
  if (!emailAutorise(emails)) {
    return { type: 'refuse', motif: 'acces-limite' };
  }

  // 2. Recherche par email OU téléphone
  const filtre: { email?: { in: string[] }; telephone?: { in: string[] } }[] = [];
  if (emails.length) filtre.push({ email: { in: emails } });
  if (telephones.length) filtre.push({ telephone: { in: telephones } });
  // Aucun identifiant vérifié : impossible d'enregistrer ce compte
  if (filtre.length === 0) return { type: 'refuse', motif: 'non-enregistre' };

  const [agentvendeurUser, client, membre] = await Promise.all([
    prisma.agentvendeurUser.findFirst({
      where: { OR: filtre },
      include: { agentvendeur: { select: { actif: true } } },
    }),
    prisma.businessbi.findFirst({
      where: { OR: filtre },
      select: {
        id: true,
        accesActif: true,
        agentvendeurId: true,
        agentvendeur: { select: { actif: true } },
        abonnement: { select: { dateFin: true } },
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
            agentvendeurId: true,
            agentvendeur: { select: { actif: true } },
            abonnement: { select: { dateFin: true } },
          },
        },
      },
    }),
  ]);

  // 3. Utilisateur d'un agentvendeur
  if (agentvendeurUser) {
    // Déjà lié à un autre compte Clerk : on refuse
    if (agentvendeurUser.clerkUserId && agentvendeurUser.clerkUserId !== user.id) {
      return { type: 'refuse', motif: 'non-enregistre' };
    }
    if (!agentvendeurUser.agentvendeur.actif) {
      return { type: 'refuse', motif: 'agentvendeur-suspendu' };
    }
    // Première connexion : on lie le compte Clerk
    if (!agentvendeurUser.clerkUserId) {
      await prisma.agentvendeurUser.update({
        where: { id: agentvendeurUser.id },
        data: { clerkUserId: user.id },
      });
    }
    return { type: 'agentvendeur', agentvendeurId: agentvendeurUser.agentvendeurId, role: agentvendeurUser.role };
  }

  // 4. Client : titulaire du compte de l'entreprise (toujours administrateur)
  if (client) {
    if (!client.accesActif) return { type: 'refuse', motif: 'client-suspendu' };
    if (client.agentvendeur && !client.agentvendeur.actif) {
      return { type: 'refuse', motif: 'agentvendeur-suspendu' };
    }
    if (!client.agentvendeurId && BLOQUER_CLIENTS_SANS_AGENTVENDEUR) {
      return { type: 'refuse', motif: 'sans-agentvendeur' };
    }
    const abonnementFin = await finAbonnement(client.id, client.abonnement);
    return { type: 'client', businessbiId: client.id, role: 'admin', abonnementFin };
  }

  // 5. Client : membre de l'équipe d'une entreprise (administrateur ou caissier)
  if (membre) {
    // Déjà lié à un autre compte Clerk : on refuse
    if (membre.clerkUserId && membre.clerkUserId !== user.id) {
      return { type: 'refuse', motif: 'non-enregistre' };
    }
    const entreprise = membre.businessbi;
    if (!entreprise.accesActif) return { type: 'refuse', motif: 'client-suspendu' };
    if (entreprise.agentvendeur && !entreprise.agentvendeur.actif) {
      return { type: 'refuse', motif: 'agentvendeur-suspendu' };
    }
    if (!entreprise.agentvendeurId && BLOQUER_CLIENTS_SANS_AGENTVENDEUR) {
      return { type: 'refuse', motif: 'sans-agentvendeur' };
    }
    // Première connexion : on lie le compte Clerk
    if (!membre.clerkUserId) {
      await prisma.membreBusinessbi.update({
        where: { id: membre.id },
        data: { clerkUserId: user.id },
      });
    }
    const abonnementFin = await finAbonnement(entreprise.id, entreprise.abonnement);
    return {
      type: 'client',
      businessbiId: entreprise.id,
      role: membre.role === 'admin' ? 'admin' : 'caissier',
      abonnementFin,
    };
  }

  // 6. Compte inconnu : il s'enregistre lui-même avec le code de son agentvendeur
  return { type: 'inscription' };
}
