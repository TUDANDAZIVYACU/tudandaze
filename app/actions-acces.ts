"use server";

import { prisma } from "@/lib/prisma"
import { currentUser } from "@clerk/nextjs/server"
import { resoudreAcces } from "@/lib/acces"
import { withRetry } from "@/lib/retry"
import { getBusinessName } from "./actions"
import { accesAvecCache } from "@/lib/acces-cache"

// Type d'accès du compte connecté, lu côté serveur : sert à adapter le menu (Navbar).
// En cas de coupure réseau (Clerk ou base de données), renvoie null au lieu de faire planter la page.
export async function getMonAcces() {
    try {
        const user = await currentUser()
        if (!user) return null

        const acces = await withRetry(() => resoudreAcces(user))

        if (acces.type === "owner") return { type: "owner" as const }
        if (acces.type === "client") return { type: "client" as const }
        if (acces.type === "inscription") return { type: "inscription" as const }
        if (acces.type === "refuse") return { type: "refuse" as const, motif: acces.motif }

        const assureur = await withRetry(() =>
            prisma.assureur.findUnique({
                where: { id: acces.assureurId },
                select: { nom: true }
            })
        )
        return {
            type: "assureur" as const,
            role: acces.role,
            nom: assureur?.nom ?? "ASSUREUR"
        }
    } catch (error) {
        console.error(error)
        return null
    }
}

export type NavbarInfo = {
    acces:
        | { type: "owner" }
        | { type: "assureur"; role: string; nom: string }
        | { type: "client" }
        | { type: "inscription" }
        | { type: "refuse"; motif: string }
    // Nom de l'entreprise (clients uniquement)
    businessName: string | null
}

// Tout ce dont la barre de navigation a besoin, en UNE action :
// type de compte + nom de l'entreprise. L'identité est lue côté serveur (Clerk).
export async function getNavbarInfo(): Promise<NavbarInfo | null> {
    try {
        const user = await currentUser()
        if (!user) return null

        const acces = await accesAvecCache(user.id, () => withRetry(() => resoudreAcces(user)))

        if (acces.type === "owner") return { acces: { type: "owner" }, businessName: null }
        if (acces.type === "inscription") return { acces: { type: "inscription" }, businessName: null }
        if (acces.type === "refuse") return { acces: { type: "refuse", motif: acces.motif }, businessName: null }

        if (acces.type === "client") {
            const identifiant = user.primaryEmailAddress?.emailAddress ?? user.primaryPhoneNumber?.phoneNumber
            const businessName = identifiant ? await getBusinessName(identifiant) : null
            return { acces: { type: "client" }, businessName }
        }

        const assureur = await withRetry(() =>
            prisma.assureur.findUnique({
                where: { id: acces.assureurId },
                select: { nom: true }
            })
        )
        return {
            acces: { type: "assureur", role: acces.role, nom: assureur?.nom ?? "ASSUREUR" },
            businessName: null
        }
    } catch (error) {
        console.error(error)
        return null
    }
}