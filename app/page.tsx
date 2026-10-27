"use client";
import { useUser } from "@clerk/nextjs";
import Wrapper from "./components/Wrapper";
import ProductOverview from "./components/ProductOverview";
import RecentTransactions from "./components/RecentTransactions";
import StockSummaryTable from "./components/StockSummaryTable";
import { useState, useEffect, useCallback } from "react";
import { getDashboard, type DashboardData } from "./actions";
import { useStockSync } from "@/lib/stock-sync";

// Date du jour en heure locale (et non en UTC), au format AAAA-MM-JJ
const aujourdhui = () => new Date().toLocaleDateString("en-CA")

// "lundi 19 octobre 2026"
const dateLongue = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

// Dernier tableau de bord reçu, gardé dans le navigateur pour s'afficher immédiatement
const CLE_CACHE = "dashboard-cache-v2"
type CacheDashboard = { email: string; date: string; data: DashboardData }

export default function Home() {
  const { user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress as string
  const [dateFiltre, setDateFiltre] = useState(aujourdhui)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [erreur, setErreur] = useState(false)
  // Incrémenté à chaque mise à jour du stock pour recharger le tableau de bord
  const [version, setVersion] = useState(0)

  // 1) Affichage immédiat du dernier tableau de bord connu (même utilisateur, même date)
  useEffect(() => {
    if (!email) return
    try {
      const brut = localStorage.getItem(CLE_CACHE)
      if (!brut) return
      const cache = JSON.parse(brut) as CacheDashboard
      if (cache.email === email && cache.date === dateFiltre) {
        setDashboard((actuel) => actuel ?? cache.data)
      }
    } catch {
      // cache illisible : on l'ignore
    }
  }, [email, dateFiltre])

  // 2) Chiffres à jour, en arrière-plan. Si la date change avant la fin de la requête
  // précédente, l'ancienne réponse est ignorée. Les anciens chiffres restent affichés
  // jusqu'à l'arrivée des nouveaux.
  useEffect(() => {
    if (!email) return
    let annule = false
    getDashboard(email, dateFiltre || undefined)
      .then((resultat) => {
        if (annule) return
        if (resultat) {
          setDashboard(resultat)
          setErreur(false)
          try {
            const cache: CacheDashboard = { email, date: dateFiltre, data: resultat }
            localStorage.setItem(CLE_CACHE, JSON.stringify(cache))
          } catch {
            // stockage plein ou indisponible : sans conséquence
          }
        } else {
          setErreur(true)
        }
      })
      .catch((e) => {
        console.error(e)
        if (!annule) setErreur(true)
      })
    return () => {
      annule = true
    }
  }, [email, dateFiltre, version])

  // Rechargement automatique (événement interne, autre onglet, retour sur l'onglet)
  const stockMisAJour = useCallback(() => setVersion((v) => v + 1), [])
  useStockSync(stockMisAJour)

  const titre = dateFiltre ? dateLongue(dateFiltre) : "Toutes les opérations"

  // Marge totale des ventes du jour : (prix de vente - prix d'achat du dernier achat avant la vente) × quantité.
  // Même règle que la marge de chaque opération : une vente sans prix d'achat connu n'est pas comptée.
  const margeTotale = dashboard
    ? dashboard.transactions
        .filter((tx) => tx.type !== "IN")
        .reduce((total, tx) => {
          const cout = dashboard.coutsAchat?.[tx.id] ?? 0
          if (cout <= 0) return total
          const prixVente = tx.prixVente || tx.price || 0
          return total + (prixVente - cout) * tx.quantity
        }, 0)
    : undefined

  return (
    <Wrapper compact>
      {/* En-tête : la journée consultée à gauche, la valeur du stock à droite (même sur mobile) */}
      <section className="mb-5 flex flex-nowrap items-end justify-between gap-x-3 border-b border-base-300 pb-5 md:gap-x-6">
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight first-letter:uppercase sm:text-2xl md:text-3xl">
            {titre}
          </h1>
          <div className="mt-3">
            <input
              aria-label="Choisir la date"
              type="date"
              className="input input-bordered input-sm max-w-full"
              value={dateFiltre}
              onChange={(e) => setDateFiltre(e.target.value)}
            />
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xs font-normal opacity-70 sm:text-sm">Valeur du stock</p>
          <p className="text-xl font-bold tabular-nums text-success sm:text-3xl md:text-4xl">
            {dashboard ? dashboard.stockValue.toLocaleString() : "…"}{" "}
            <span className="text-xs font-medium opacity-60 sm:text-sm"></span>
          </p>
          <p className="text-[10px] font-normal opacity-60 sm:text-xs">au prix de vente</p>
        </div>
      </section>

      {erreur && !dashboard ? (
        <div role="alert" className="alert alert-error alert-soft flex flex-wrap items-center justify-between gap-3">
          <span>Impossible de charger les données. Vérifiez la connexion ou réessayez.</span>
          <button type="button" className="btn btn-sm" onClick={() => setVersion((v) => v + 1)}>
            Réessayer
          </button>
        </div>
      ) : (
        /* Téléphone : récapitulatif, achats et ventes, puis état du stock.
           Ordinateur : récapitulatif et opérations à gauche, l'état du stock reste à droite. */
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="order-1 lg:order-none lg:col-span-7">
            <ProductOverview
              email={email}
              dateFiltre={dateFiltre}
              donnees={dashboard?.stats ?? null}
              margeTotale={margeTotale}
            />
          </div>
          <div className="order-3 lg:order-none lg:col-span-5 lg:row-span-2">
            <StockSummaryTable email={email} dateFiltre={dateFiltre} donnees={dashboard?.summary ?? null} />
          </div>
          <div className="order-2 lg:order-none lg:col-span-7">
            <RecentTransactions
              email={email}
              dateFiltre={dateFiltre}
              donnees={dashboard?.transactions ?? null}
              coutsAchat={dashboard?.coutsAchat}
            />
          </div>
        </div>
      )}
    </Wrapper>
  );
}