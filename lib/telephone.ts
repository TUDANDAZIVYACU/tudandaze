// lib/telephone.ts
// Convertit un numéro saisi en format international (E.164). Retourne null si invalide.
export function normaliserTelephone(
  input: string,
  indicatifDefaut = "+257"
): string | null {
  const brut = input.replace(/[\s().-]/g, "");
  if (!brut) return null;

  let e164: string;
  if (brut.startsWith("+")) e164 = brut;
  else if (brut.startsWith("00")) e164 = "+" + brut.slice(2);
  else e164 = indicatifDefaut + brut.replace(/^0+/, "");

  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}