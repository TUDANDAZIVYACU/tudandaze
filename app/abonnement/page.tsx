import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resoudreAcces } from "@/lib/acces";
import Wrapper from "@/app/components/Wrapper";
import BillingForm from "@/app/components/BillingForm";
import { getPlan } from "@/lib/plans";

export const dynamic = "force-dynamic";

const formatDate = (d: Date) =>
  d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

export default async function AbonnementPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  // Administrateur et caissier de l'entreprise peuvent payer l'abonnement
  const acces = await resoudreAcces(user);
  if (acces.type !== "client") redirect("/");

  const [abonnement, paiements] = await Promise.all([
    prisma.abonnement.findUnique({ where: { businessbiId: acces.businessbiId } }),
    prisma.paiementAbonnement.findMany({
      where: { businessbiId: acces.businessbiId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const maintenant = new Date();
  const enCours = abonnement && abonnement.dateFin > maintenant;

  let etat = "Aucun abonnement";
  if (abonnement) {
    if (!enCours) etat = `Expiré le ${formatDate(abonnement.dateFin)}`;
    else if (abonnement.statut === "essai") etat = `Essai gratuit jusqu'au ${formatDate(abonnement.dateFin)}`;
    else etat = `Actif jusqu'au ${formatDate(abonnement.dateFin)}`;
  }

  return (
    <Wrapper>
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold">Abonnement</h1>
          <p className={enCours ? "text-success" : "text-error"}>{etat}</p>
        </div>

        <section className="card bg-base-100 border border-base-300 p-4">
          <h2 className="font-bold">Payer ou prolonger</h2>
          {enCours && (
            <p className="text-sm opacity-70 normal-case font-normal">
              Vous pouvez payer à l&apos;avance : les mois payés s&apos;ajoutent à la fin de votre abonnement actuel.
            </p>
          )}
          <BillingForm />
        </section>

        {paiements.length > 0 && (
          <section>
            <h2 className="font-bold mb-2">Derniers paiements</h2>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Durée</th>
                    <th>Montant (FBU)</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {paiements.map((p) => (
                    <tr key={p.id}>
                      <td>{p.createdAt.toLocaleDateString("fr-FR")}</td>
                      <td>{getPlan(p.plan)?.label ?? p.plan}</td>
                      <td>{p.montant.toLocaleString("fr-FR")}</td>
                      <td>
                        {p.statut === "confirme"
                          ? "Confirmé"
                          : p.statut === "rejete"
                          ? "Rejeté"
                          : "En attente"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </Wrapper>
  );
}
