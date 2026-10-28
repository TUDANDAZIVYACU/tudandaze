// Configuration unique des abonnements : modifier ici le prix ou les remises suffit.
// Utilisable côté client (BillingForm) et côté serveur (API, webhook).

export const PRIX_MENSUEL = 200000; // FBU par mois

export type PlanKey = "mensuel" | "trimestriel" | "semestriel" | "annuel";

export type Plan = {
  key: PlanKey;
  label: string;
  mois: number;
  remise: number; // en pourcentage
};

export const PLANS: Plan[] = [
  { key: "mensuel", label: "Mensuel", mois: 1, remise: 0 },
  { key: "trimestriel", label: "Trimestriel", mois: 3, remise: 10 },
  { key: "semestriel", label: "Semestriel", mois: 6, remise: 20 },
  { key: "annuel", label: "Annuel", mois: 12, remise: 30 },
];

export function getPlan(key: string): Plan | undefined {
  return PLANS.find((p) => p.key === key);
}

// Montant à payer pour un plan : prix mensuel x nombre de mois, moins la remise
export function montantPlan(plan: Plan): number {
  return Math.round((PRIX_MENSUEL * plan.mois * (100 - plan.remise)) / 100);
}

// Plans avec leur montant calculé (mensuel 200 000, trimestriel 540 000,
// semestriel 960 000, annuel 1 680 000)
export const PLANS_AVEC_MONTANT = PLANS.map((p) => ({ ...p, montant: montantPlan(p) }));

// Ajoute n mois à une date en gardant le même jour (ou le dernier jour du mois)
export function ajouterMois(date: Date, mois: number): Date {
  const d = new Date(date);
  const jour = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + mois);
  const dernierJour = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(jour, dernierJour));
  return d;
}

export const DUREE_ESSAI_JOURS = 30;
