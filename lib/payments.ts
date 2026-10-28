import { paymentProvidersPublic, type ProviderPublic } from "@/lib/payments-public";

export type InitierArgs = {
  montant: number;
  telephone?: string;
  numeroCompte?: string;
  reference: string; // codeTrans
  callbackUrl: string;
};

export type InitierResult = { success: boolean; message?: string };

export interface PaymentAdapter extends ProviderPublic {
  initier(args: InitierArgs): Promise<InitierResult>;
}

const lumicash: PaymentAdapter = {
  ...paymentProvidersPublic.find((p) => p.key === "lumicash")!,

  async initier({ montant, telephone, reference, callbackUrl }) {
    const url = process.env.LUMICASH_API_URL;
    const cle = process.env.LUMICASH_API_KEY;

    // API Lumicash pas encore configurée : le paiement reste "en_attente"
    // jusqu'à la confirmation (webhook ou confirmation manuelle).
    if (!url || !cle) {
      return { success: true, message: "En attente de confirmation manuelle" };
    }

    // ⚠️ À adapter à la documentation réelle de Lumicash (URL, en-têtes, noms des champs)
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cle}`,
      },
      body: JSON.stringify({
        amount: montant,
        phoneNumber: telephone,
        reference,
        callbackUrl,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Lumicash initier:", res.status, detail);
      return { success: false, message: "Lumicash a refusé la demande de paiement" };
    }

    return { success: true };
  },
};

export const paymentAdapters: Record<string, PaymentAdapter> = {
  lumicash,
};
