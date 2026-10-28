import { clerkMiddleware, createRouteMatcher, clerkClient } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { resoudreAcces, type Acces } from '@/lib/acces';
import { accesAvecCache } from '@/lib/acces-cache';

// /api/webhooks : appelé par Lumicash (pas de session Clerk), protégé par LUMICASH_WEBHOOK_SECRET
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/acces-refuse(.*)',
  '/api/webhooks(.*)',
]);

// Routes réservées aux administrateurs du client (role === "admin" dans publicMetadata)
const isAdminRoute = createRouteMatcher(['/centralisation(.*)', '/admin(.*)']);

// Zone propriétaires de l'application
const isOwnerRoute = createRouteMatcher(['/owner(.*)', '/api/owner(.*)']);

// Zone agentvendeurs
const isAgentVendeurRoute = createRouteMatcher(['/agentvendeur(.*)', '/api/agentvendeur(.*)']);

// Page où un nouveau compte saisit le code de son agentvendeur
const isInscriptionRoute = createRouteMatcher(['/inscription(.*)']);

// Seules routes accessibles à un client dont l'abonnement a expiré : payer pour le renouveler
const isAbonnementRoute = createRouteMatcher(['/abonnement(.*)', '/api/paiements(.*)']);

const estApi = (request: NextRequest) => request.nextUrl.pathname.startsWith('/api');

function refuser(request: NextRequest, motif: string) {
  if (estApi(request)) {
    return NextResponse.json({ error: 'Accès refusé', motif }, { status: 403 });
  }
  return NextResponse.redirect(new URL(`/acces-refuse?motif=${motif}`, request.url));
}

// Renvoie un compte pas encore rattaché vers la page d'inscription
function versInscription(request: NextRequest) {
  if (estApi(request)) {
    return NextResponse.json({ error: 'Inscription requise' }, { status: 403 });
  }
  return NextResponse.redirect(new URL('/inscription', request.url));
}

// Renvoie l'utilisateur vers sa propre zone s'il demande une zone qui n'est pas la sienne
function versSaZone(
  request: NextRequest,
  acces: Exclude<Acces, { type: 'refuse' } | { type: 'inscription' }>
) {
  if (estApi(request)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }
  const accueil =
    acces.type === 'owner' ? '/owner' : acces.type === 'agentvendeur' ? '/agentvendeur' : '/';
  return NextResponse.redirect(new URL(accueil, request.url));
}

// Vérification d'accès réelle (appel à Clerk + base de données) : lente, donc gardée en mémoire
// quelques minutes par accesAvecCache (lib/acces-cache.ts).
async function chargerAcces(userId: string): Promise<Acces> {
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  return resoudreAcces(user);
}

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;

  await auth.protect();

  if (isAdminRoute(request)) {
    const { sessionClaims } = await auth();
    const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;

    if (role !== 'admin') {
      // Redirige les non-admins vers l'accueil s'ils tentent d'accéder à une route admin
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Contrôle d'accès : propriétaire / agentvendeur / client / compte à enregistrer
  try {
    const { userId } = await auth();
    if (!userId) return;

    const acces = await accesAvecCache(userId, () => chargerAcces(userId));

    if (acces.type === 'refuse') return refuser(request, acces.motif);

    // Compte pas encore rattaché à un agentvendeur : seule la page d'inscription est accessible
    if (acces.type === 'inscription') {
      if (isInscriptionRoute(request)) return;
      return versInscription(request);
    }

    // La page d'inscription ne concerne que les comptes pas encore rattachés
    if (isInscriptionRoute(request)) return versSaZone(request, acces);

    if (isOwnerRoute(request)) {
      if (acces.type !== 'owner') return versSaZone(request, acces);
      return;
    }

    if (isAgentVendeurRoute(request)) {
      if (acces.type !== 'agentvendeur') return versSaZone(request, acces);
      return;
    }

    // Reste de l'application : réservé aux clients
    if (acces.type !== 'client') return versSaZone(request, acces);

    // Abonnement (ou essai) expiré : seule la page de paiement reste accessible
    if (acces.abonnementFin < Date.now() && !isAbonnementRoute(request)) {
      if (estApi(request)) {
        return NextResponse.json(
          { error: 'Abonnement expiré', motif: 'abonnement-expire' },
          { status: 403 }
        );
      }
      // Administrateur et caissier sont envoyés vers la page de paiement
      return NextResponse.redirect(new URL('/abonnement', request.url));
    }
  } catch (error) {
    console.error('Erreur vérification accès (proxy):', error);
    // Zones sensibles : en cas d'erreur on bloque.
    if (isOwnerRoute(request) || isAgentVendeurRoute(request)) {
      return refuser(request, 'erreur');
    }
    // Zone client : en cas de coupure réseau/DB, on laisse passer plutôt que de
    // bloquer toute l'application sur une erreur d'infrastructure.
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
