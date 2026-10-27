// lib/stock-sync.ts
"use client"
import { useEffect, useRef } from "react"

const EVENEMENT = "stock-updated"
const CANAL = "stock-sync"

// Rechargement périodique par défaut : indispensable pour voir à l'écran
// ce qui a été saisi sur un AUTRE appareil (téléphone <-> ordinateur)
const INTERVALLE_PAR_DEFAUT_MS = 30000

// À appeler après chaque création de produit, approvisionnement, vente, annulation ou suppression
export function notifierStock() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(EVENEMENT))
  try {
    // Prévient aussi les autres onglets ouverts sur le même appareil
    const canal = new BroadcastChannel(CANAL)
    canal.postMessage("update")
    canal.close()
  } catch {}
}

// À placer dans chaque page ou composant qui affiche des valeurs de stock.
// intervalleMs : délai du rechargement automatique (30 s par défaut ; null pour le désactiver
// et ne recharger qu'après un changement, un retour sur l'onglet ou le retour du réseau).
//
// Une seule mise à jour à la fois par composant : le serveur traite les actions les unes après
// les autres, donc des demandes empilées retarderaient aussi les actions de l'utilisateur (vente...).
export function useStockSync(
  rafraichir: () => void | Promise<void>,
  intervalleMs: number | null = INTERVALLE_PAR_DEFAUT_MS
) {
  const ref = useRef(rafraichir)
  useEffect(() => {
    ref.current = rafraichir
  })

  useEffect(() => {
    let minuterie: ReturnType<typeof setTimeout> | null = null
    let enCours = false
    let aRelancer = false
    let actif = true

    const executer = async () => {
      enCours = true
      try {
        await ref.current()
      } catch (error) {
        console.error(error)
      } finally {
        enCours = false
      }
      // Un changement est arrivé pendant la mise à jour : on recharge une dernière fois
      if (actif && aRelancer) {
        aRelancer = false
        planifier(true)
      }
    }

    // urgent = un changement vient d'avoir lieu : on relance même si une mise à jour est déjà en cours.
    // Sinon (rechargement périodique, retour sur l'onglet...), on saute si une mise à jour est déjà en cours.
    const planifier = (urgent: boolean) => {
      if (enCours) {
        if (urgent) aRelancer = true
        return
      }
      if (minuterie) clearTimeout(minuterie)
      // Regroupe les signaux reçus en même temps (événement + autre onglet) en un seul rechargement
      minuterie = setTimeout(() => {
        minuterie = null
        if (actif) void executer()
      }, 150)
    }

    const surChangement = () => planifier(true)
    const surRetour = () => planifier(false)
    const surVisibilite = () => {
      if (document.visibilityState === "visible") planifier(false)
    }

    window.addEventListener(EVENEMENT, surChangement)
    window.addEventListener("focus", surRetour)
    window.addEventListener("online", surRetour)
    document.addEventListener("visibilitychange", surVisibilite)

    let canal: BroadcastChannel | null = null
    try {
      canal = new BroadcastChannel(CANAL)
      canal.onmessage = surChangement
    } catch {}

    let sondage: ReturnType<typeof setInterval> | null = null
    if (intervalleMs) {
      sondage = setInterval(() => {
        if (document.visibilityState === "visible") planifier(false)
      }, intervalleMs)
    }

    return () => {
      actif = false
      if (minuterie) clearTimeout(minuterie)
      if (sondage) clearInterval(sondage)
      window.removeEventListener(EVENEMENT, surChangement)
      window.removeEventListener("focus", surRetour)
      window.removeEventListener("online", surRetour)
      document.removeEventListener("visibilitychange", surVisibilite)
      canal?.close()
    }
  }, [intervalleMs])
}
