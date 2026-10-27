// lib/whatsapp.ts
// Envoi de messages WhatsApp via l'API Cloud de Meta (WhatsApp Business Platform).
// Prérequis : compte WhatsApp Business API (Meta for Developers), numéro
// validé, et un token d'accès permanent (System User Token).
//
// Variables d'environnement requises :
//   WHATSAPP_PHONE_NUMBER_ID -> ID du numéro expéditeur (Meta Business Manager)
//   WHATSAPP_ACCESS_TOKEN    -> token d'accès permanent (System User)
//   WHATSAPP_API_VERSION     -> ex: "v21.0" (optionnel)

const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";

function getWhatsAppEndpoint(): string {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID manquant dans les variables d'environnement.");
  }
  return `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
}

// Met un numéro au format E.164 attendu par WhatsApp (sans "+", sans espaces).
// Ex: "+257 69 10 58 10" -> "25769105810" | "069105810" -> "25769105810"
function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, "");
  cleaned = cleaned.replace(/^\+/, "");
  if (cleaned.startsWith("0")) {
    cleaned = "257" + cleaned.slice(1);
  }
  return cleaned;
}

interface WhatsAppApiResponse {
  messages?: { id: string }[];
  error?: { message: string; type: string; code: number };
}

/**
 * Envoie un message via un template pré-approuvé par Meta.
 * OBLIGATOIRE pour une confirmation de paiement (message "business-initiated").
 *
 * Crée le template dans Meta Business Manager > WhatsApp Manager > Modèles
 * de messages, catégorie UTILITY, ex. nommé "confirmation_paiement" :
 *   Corps : "Bonjour, votre paiement de {{1}} FBU pour le plan {{2}} a été
 *            confirmé. Référence : {{3}}. Merci pour votre confiance,
 *            TUDANDAZE.COM."
 * L'approbation Meta prend généralement quelques heures.
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[]
): Promise<WhatsAppApiResponse> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN manquant dans les variables d'environnement.");
  }

  const payload = {
    messaging_product: "whatsapp",
    to: formatPhoneForWhatsApp(to),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: "body",
          parameters: bodyParams.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };

  const res = await fetch(getWhatsAppEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data: WhatsAppApiResponse = await res.json();
  if (!res.ok) console.error("Erreur envoi WhatsApp (template):", data);
  return data;
}

/**
 * Envoie un texte libre. Ne fonctionne QUE si l'utilisateur a écrit au
 * numéro WhatsApp Business dans les dernières 24h. Utile en dev/test, ou en
 * repli si le template n'est pas encore approuvé — pas fiable en prod seul.
 */
export async function sendWhatsAppText(to: string, message: string): Promise<WhatsAppApiResponse> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN manquant dans les variables d'environnement.");
  }

  const payload = {
    messaging_product: "whatsapp",
    to: formatPhoneForWhatsApp(to),
    type: "text",
    text: { body: message },
  };

  const res = await fetch(getWhatsAppEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data: WhatsAppApiResponse = await res.json();
  if (!res.ok) console.error("Erreur envoi WhatsApp (texte):", data);
  return data;
}

/**
 * Envoie la preuve de paiement par WhatsApp : essaie d'abord le template
 * approuvé (prod), puis se rabat sur le texte libre en cas d'échec (dev, ou
 * template pas encore approuvé).
 */
export async function envoyerConfirmationPaiementWhatsApp(params: {
  telephone: string;
  montant: number;
  plan: string;
  codeTrans: string;
}) {
  const { telephone, montant, plan, codeTrans } = params;
  const montantFormatte = montant.toLocaleString("fr-FR");

  try {
    const result = await sendWhatsAppTemplate(telephone, "confirmation_paiement", "fr", [
      montantFormatte,
      plan,
      codeTrans,
    ]);
    if (result.error) throw new Error(result.error.message);
    return { success: true };
  } catch (templateError) {
    console.warn("Template WhatsApp indisponible, repli sur texte libre :", templateError);
    try {
      await sendWhatsAppText(
        telephone,
        `Bonjour ! Votre paiement de ${montantFormatte} FBU pour l'abonnement TUDANDAZE.COM (plan ${plan}) a été confirmé avec succès. Référence : ${codeTrans}. Merci de votre confiance !`
      );
      return { success: true };
    } catch (textError) {
      console.error("Échec envoi WhatsApp (texte et template):", textError);
      return { success: false };
    }
  }
}