import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { envoyerConfirmationPaiementWhatsApp } from "@/lib/whatsapp";
import { ajouterMois, getPlan } from "@/lib/plans";

export async function POST(req: NextRequest) {
  // Vérification du secret partagé avec Lumicash
  const secretRecu =
    req.headers.get("x-lumicash-secret") ?? req.nextUrl.searchParams.get("secret");
  const secretAttendu = process.env.LUMICASH_WEBHOOK_SECRET;

  if (!secretAttendu || secretRecu !== secretAttendu) {
    console.warn("Webhook Lumicash : secret invalide ou manquant.");
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  // ⚠️ Adapter les noms de champs à la documentation Lumicash réelle
  const { reference, status, phoneNumber } = body;

  if (!reference || !status) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }

  const paiement = await prisma.paiementAbonnement.findUnique({
    where: { codeTrans: reference },
  });

  if (!paiement) {
    console.warn(`Webhook Lumicash : paiement introuvable pour reference=${reference}`);
    return NextResponse.json({ error: "Transaction inconnue" }, { status: 404 });
  }

  // Idempotence : un webhook renvoyé ne crédite pas deux fois
  if (paiement.statut !== "en_attente") {
    return NextResponse.json({ received: true, alreadyProcessed: true });
  }

  const estReussi = status === "success" || status === "confirmed";

  if (!estReussi) {
    await prisma.paiementAbonnement.update({
      where: { id: paiement.id },
      data: { statut: "rejete", rawPayload: body },
    });
    return NextResponse.json({ received: true });
  }

  // Nombre de mois crédités = durée du plan réellement payé
  const plan = getPlan(paiement.plan);
  const mois = plan?.mois ?? 1;

  const traite = await prisma.$transaction(async (tx) => {
    // updateMany avec statut en_attente : garde contre deux webhooks simultanés
    const maj = await tx.paiementAbonnement.updateMany({
      where: { id: paiement.id, statut: "en_attente" },
      data: { statut: "confirme", rawPayload: body },
    });
    if (maj.count === 0) return false;

    const existant = await tx.abonnement.findUnique({
      where: { businessbiId: paiement.businessbiId },
    });

    const maintenant = new Date();
    // Si l'abonnement (ou l'essai) court encore, les mois s'ajoutent à la suite
    const base = existant && existant.dateFin > maintenant ? existant.dateFin : maintenant;
    const dateFin = ajouterMois(base, mois);

    await tx.abonnement.upsert({
      where: { businessbiId: paiement.businessbiId },
      update: { statut: "actif", plan: paiement.plan, dateFin },
      create: {
        businessbiId: paiement.businessbiId,
        statut: "actif",
        plan: paiement.plan,
        dateDebut: maintenant,
        dateFin,
      },
    });
    return true;
  });

  if (!traite) {
    return NextResponse.json({ received: true, alreadyProcessed: true });
  }

  // Preuve de paiement par WhatsApp
  const telephoneDestinataire = paiement.telephone ?? phoneNumber;
  if (telephoneDestinataire) {
    await envoyerConfirmationPaiementWhatsApp({
      telephone: telephoneDestinataire,
      montant: paiement.montant,
      plan: paiement.plan,
      codeTrans: paiement.codeTrans,
    });
  } else {
    console.warn(`Aucun numéro disponible pour confirmer par WhatsApp (paiement ${paiement.id})`);
  }

  return NextResponse.json({ received: true });
}
