import { currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { resoudreAcces } from "@/lib/acces";
import { paymentAdapters } from "@/lib/payments";
import { getPlan, montantPlan } from "@/lib/plans";

// Référence unique transmise à Lumicash et stockée comme codeTrans (ex: TDZ-20261028-8F3A1C2B)
function genererCodeTrans(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const alea = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `TDZ-${date}-${alea}`;
}

export async function POST(req: NextRequest) {
  // L'entreprise qui paie vient de la session, jamais du formulaire
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  const acces = await resoudreAcces(user);
  // Administrateur et caissier de l'entreprise peuvent payer l'abonnement
  if (acces.type !== "client") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { plan, provider, telephone, numeroCompte } = body;

  if (!plan || !provider) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }

  const planInfo = getPlan(plan);
  if (!planInfo) {
    return NextResponse.json({ error: "Plan inconnu" }, { status: 400 });
  }

  const adapter = paymentAdapters[provider];
  if (!adapter) {
    return NextResponse.json({ error: "Moyen de paiement inconnu" }, { status: 400 });
  }

  if (adapter.requiresField === "telephone" && !telephone) {
    return NextResponse.json({ error: "Numéro de téléphone requis" }, { status: 400 });
  }
  if (adapter.requiresField === "numeroCompte" && !numeroCompte) {
    return NextResponse.json({ error: "Numéro de compte requis" }, { status: 400 });
  }

  const montant = montantPlan(planInfo);
  const codeTrans = genererCodeTrans();

  const paiement = await prisma.paiementAbonnement.create({
    data: {
      businessbiId: acces.businessbiId,
      provider,
      plan: planInfo.key,
      montant,
      codeTrans,
      telephone: telephone || null,
      numeroCompte: numeroCompte || null,
      statut: "en_attente",
    },
  });

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://tudandaze.com"}/api/webhooks/${provider}`;

  try {
    const resultat = await adapter.initier({
      montant,
      telephone,
      numeroCompte,
      reference: codeTrans,
      callbackUrl,
    });

    if (!resultat.success) {
      await prisma.paiementAbonnement.update({
        where: { id: paiement.id },
        data: { statut: "rejete" },
      });
      return NextResponse.json(
        { error: resultat.message ?? "Échec de l'initiation du paiement" },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("Erreur initiation paiement:", error);
    await prisma.paiementAbonnement.update({
      where: { id: paiement.id },
      data: { statut: "rejete" },
    });
    return NextResponse.json({ error: "Erreur lors de l'initiation du paiement" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: "Demande de paiement enregistrée, en attente de confirmation.",
    codeTrans: paiement.codeTrans,
  });
}
