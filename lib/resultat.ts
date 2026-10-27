// Résultat renvoyé par les actions serveur.
// En production, Next.js masque le message des erreurs lancées dans une action serveur
// ("An error occurred in the Server Components render"). On renvoie donc le message dans
// le résultat pour pouvoir l'afficher à l'utilisateur.
export type Resultat<T extends object = object> =
    | ({ success: true } & T)
    | { success: false; message: string }

export async function executer<T extends object = object>(
    fn: () => Promise<T | void>
): Promise<Resultat<T>> {
    try {
        const data = await fn()
        return { success: true, ...(data ?? {}) } as Resultat<T>
    } catch (error: any) {
        console.error(error)

        const code: string | undefined = typeof error?.code === "string" ? error.code : undefined
        const instable =
            code === "P1001" ||
            code === "P1002" ||
            code === "P1017" ||
            error?.message?.includes("Can't reach database server")

        let message: string
        if (instable) {
            message = "Connexion instable. Vérifiez votre connexion internet et réessayez."
        } else if (code === "P2002") {
            message = "Cet élément existe déjà (email, téléphone ou code déjà utilisé)."
        } else if (code && /^P\d{4}$/.test(code)) {
            message = "Erreur de base de données. Réessayez."
        } else {
            message = error?.message || "Erreur serveur"
        }
        return { success: false, message }
    }
}
