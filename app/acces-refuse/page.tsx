import { SignOutButton } from '@clerk/nextjs';

const MESSAGES: Record<string, { titre: string; texte: string }> = {
  'non-enregistre': {
    titre: 'Compte non reconnu',
    texte:
      "Votre email ou votre numéro de téléphone n'est pas enregistré. Contactez votre assureur pour obtenir l'accès.",
  },
  'client-suspendu': {
    titre: 'Accès suspendu',
    texte: 'Votre accès a été suspendu. Contactez votre assureur.',
  },
  'assureur-suspendu': {
    titre: 'Accès suspendu',
    texte: "Le compte de votre assureur est suspendu. Contactez-le pour rétablir l'accès.",
  },
  'sans-assureur': {
    titre: 'Accès non activé',
    texte: "Votre compte n'est rattaché à aucun assureur. Contactez votre assureur.",
  },
  erreur: {
    titre: 'Vérification impossible',
    texte: 'Une erreur est survenue. Réessayez dans un instant.',
  },
};

export default async function AccesRefusePage({
  searchParams,
}: {
  searchParams: Promise<{ motif?: string }>;
}) {
  const { motif } = await searchParams;
  const message = MESSAGES[motif ?? ''] ?? MESSAGES['non-enregistre'];

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-base-200">
      <div className="card bg-base-100 shadow-xl w-full max-w-md">
        <div className="card-body items-center text-center">
          <h1 className="card-title text-2xl">{message.titre}</h1>
          <p>{message.texte}</p>
          <div className="card-actions mt-4">
            <SignOutButton>
              <button className="btn btn-primary">Se déconnecter</button>
            </SignOutButton>
          </div>
        </div>
      </div>
    </main>
  );
}