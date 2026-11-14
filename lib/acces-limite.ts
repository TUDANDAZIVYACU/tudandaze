// Accès limité pendant le développement.
//
// Réglage : variable d'environnement ACCES_LIMITE_EMAILS = liste d'adresses email séparées par des virgules.
//   - Variable ABSENTE ou VIDE : tout le monde peut utiliser l'application (état normal, développement terminé).
//   - Variable REMPLIE : seules ces adresses peuvent entrer (les super admins de SUPER_ADMIN_EMAILS restent toujours autorisés).
//
// Pour ouvrir l'application à tout le monde : supprimer la variable (Vercel : Settings → Environment Variables), puis redéployer.

// Adresses autorisées, en minuscules ; null = pas de limite
export function listeAccesLimite(): string[] | null {
    const brut = process.env.ACCES_LIMITE_EMAILS?.trim()
    if (!brut) return null
    const liste = brut
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    return liste.length > 0 ? liste : null
}

// Vrai si l'accès est actuellement limité à une liste d'adresses
export function accesLimiteActif(): boolean {
    return listeAccesLimite() !== null
}

// Faux seulement si l'accès est limité ET qu'aucune des adresses n'est dans la liste
export function emailAutorise(emails: string[]): boolean {
    const liste = listeAccesLimite()
    if (!liste) return true
    return emails.some((e) => liste.includes(e.trim().toLowerCase()))
}
