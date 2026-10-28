// Partie publique des moyens de paiement : aucune clé secrète ici, importable depuis un composant client.

export type ProviderPublic = {
  key: string;
  label: string;
  requiresField: "telephone" | "numeroCompte" | null;
  instructions: string;
};

export const paymentProvidersPublic: ProviderPublic[] = [
  {
    key: "lumicash",
    label: "Lumicash",
    requiresField: "telephone",
    instructions:
      "Saisissez le numéro Lumicash qui paie. Vous recevrez une demande de confirmation sur votre téléphone.",
  },
];
