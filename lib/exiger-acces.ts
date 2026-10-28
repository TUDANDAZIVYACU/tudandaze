import { currentUser } from "@clerk/nextjs/server"
import { resoudreAcces } from "@/lib/acces"

// À appeler au début de chaque action réservée au propriétaire de l'application.
export async function exigerOwner() {
    const user = await currentUser()
    if (!user) throw new Error("Non connecté.")
    const acces = await resoudreAcces(user)
    if (acces.type !== "owner") throw new Error("Accès refusé.")
    return user
}

// À appeler au début de chaque action d'un agentvendeur.
// adminSeulement : true pour suspendre, réactiver, importer, etc.
// Renvoie l'agentvendeur du compte connecté : toujours filtrer les clients avec cet agentvendeurId.
export async function exigerAgentVendeur(adminSeulement = false) {
    const user = await currentUser()
    if (!user) throw new Error("Non connecté.")
    const acces = await resoudreAcces(user)
    if (acces.type !== "agentvendeur") throw new Error("Accès refusé.")
    if (adminSeulement && acces.role !== "ADMIN") throw new Error("Accès refusé.")
    return { agentvendeurId: acces.agentvendeurId, role: acces.role }
}