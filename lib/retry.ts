// Réessaie automatiquement une opération Prisma en cas de coupure réseau/DB
export async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1500): Promise<T> {
    let lastError: any
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn()
        } catch (error: any) {
            lastError = error
            const isConnectionIssue =
                error?.code === "P1001" ||
                error?.code === "P1002" ||
                error?.code === "P1017" ||
                error?.message?.includes("Can't reach database server") ||
                error?.message?.includes("ConnectionReset")
            if (!isConnectionIssue || attempt === retries) throw error
            console.warn(`Tentative ${attempt}/${retries} échouée (connexion DB), nouvelle tentative dans ${delayMs}ms...`)
            await new Promise((res) => setTimeout(res, delayMs))
        }
    }
    throw lastError
}