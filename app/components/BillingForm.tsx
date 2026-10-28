"use client";

import { useState } from "react";
import { paymentProvidersPublic } from "@/lib/payments-public";
import { PLANS_AVEC_MONTANT } from "@/lib/plans";

export default function BillingForm() {
  const [plan, setPlan] = useState(PLANS_AVEC_MONTANT[0].key as string);
  const [provider, setProvider] = useState(paymentProvidersPublic[0]?.key ?? "");
  const [telephone, setTelephone] = useState("");
  const [numeroCompte, setNumeroCompte] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; codeTrans?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProvider = paymentProvidersPublic.find((p) => p.key === provider);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/paiements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          plan,
          telephone: selectedProvider?.requiresField === "telephone" ? telephone : undefined,
          numeroCompte: selectedProvider?.requiresField === "numeroCompte" ? numeroCompte : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Une erreur est survenue");
      } else {
        setResult(data);
      }
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4 normal-case font-normal">
      <div>
        <label className="block text-sm mb-1 font-bold uppercase">Durée de l&apos;abonnement</label>
        <select
          className="select select-bordered w-full"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
        >
          {PLANS_AVEC_MONTANT.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
              {p.remise > 0 ? ` (-${p.remise}%)` : ""} — {p.montant.toLocaleString("fr-FR")} FBU
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm mb-1 font-bold uppercase">Moyen de paiement</label>
        <select
          className="select select-bordered w-full"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          {paymentProvidersPublic.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {selectedProvider?.requiresField === "telephone" && (
        <div>
          <label className="block text-sm mb-1 font-bold uppercase">Numéro de téléphone</label>
          <input
            type="tel"
            className="input input-bordered w-full"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="+257 ..."
            required
          />
        </div>
      )}

      {selectedProvider?.requiresField === "numeroCompte" && (
        <div>
          <label className="block text-sm mb-1 font-bold uppercase">Numéro de compte</label>
          <input
            type="text"
            className="input input-bordered w-full"
            value={numeroCompte}
            onChange={(e) => setNumeroCompte(e.target.value)}
            required
          />
        </div>
      )}

      {selectedProvider && (
        <p className="text-sm opacity-70 font-bold">{selectedProvider.instructions}</p>
      )}

      {error && <p className="text-error text-sm">{error}</p>}

      {result && (
        <div className="alert alert-success flex-col items-start">
          <p>{result.message}</p>
          {result.codeTrans && (
            <p className="text-xs opacity-70">Référence : {result.codeTrans}</p>
          )}
        </div>
      )}

      <button type="submit" className="btn btn-primary uppercase font-bold" disabled={loading}>
        {loading ? "Envoi..." : "Payer l'abonnement"}
      </button>
    </form>
  );
}
