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

// Carte de chiffre clé : libellé en haut, grand chiffre, précision en bas
function CarteChiffre({
  libelle,
  valeur,
  note,
  classeValeur = "",
}: {
  libelle: string
  valeur: string
  note?: string
  classeValeur?: string
}) {
  return (
    <div className="rounded-2xl bg-base-100 p-4 shadow-sm">
      <p className="text-xs font-medium text-base-content/60 sm:text-sm">{libelle}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl lg:text-3xl ${classeValeur}`}>{valeur}</p>
      {note && <p className="mt-0.5 text-[11px] text-base-content/50 sm:text-xs">{note}</p>}
    </div>
  )
}

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
      {/* En-tête. Ordinateur : journée consultée à gauche, sélecteur de date à droite.
          Téléphone : journée et sélecteur de date à gauche, « Valeur du stock » à leur droite. */}
      <section className="mb-4 flex items-start justify-between gap-3 md:flex-wrap md:items-end md:gap-x-4 md:gap-y-3">
        <div className="min-w-0 flex-1 space-y-2 md:flex-none md:space-y-0">
          <h1 className="text-xl font-bold leading-tight first-letter:uppercase sm:text-2xl md:text-3xl">
            {titre}
          </h1>
          <input
            aria-label="Choisir la date"
            type="date"
            className="input input-bordered input-sm max-w-full bg-base-100 md:hidden"
            value={dateFiltre}
            onChange={(e) => setDateFiltre(e.target.value)}
          />
        </div>

        {/* Téléphone seulement : valeur du stock à droite de la date */}
        <div className="shrink-0 rounded-2xl bg-base-100 p-3 text-right shadow-sm md:hidden">
          <p className="text-xs font-medium text-base-content/60">Valeur du stock</p>
          <p className="text-lg font-bold tabular-nums text-primary">
            {dashboard ? dashboard.stockValue.toLocaleString() : "…"}
          </p>
          <p className="text-[11px] text-base-content/50">au prix de vente</p>
        </div>

        <input
          aria-label="Choisir la date"
          type="date"
          className="input input-bordered input-sm hidden max-w-full bg-base-100 md:block"
          value={dateFiltre}
          onChange={(e) => setDateFiltre(e.target.value)}
        />
      </section>

      {/* Chiffres clés de la journée */}
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="hidden md:col-span-2 md:block lg:col-span-1">
          <CarteChiffre
            libelle="Valeur du stock"
            valeur={dashboard ? dashboard.stockValue.toLocaleString() : "…"}
            note="au prix de vente"
            classeValeur="text-primary"
          />
        </div>
        <CarteChiffre
          libelle="Marge du jour"
          valeur={margeTotale !== undefined ? margeTotale.toLocaleString() : "…"}
          note="ventes avec prix d'achat connu"
          classeValeur={margeTotale !== undefined && margeTotale < 0 ? "text-error" : "text-success"}
        />
        <CarteChiffre
          libelle="Opérations"
          valeur={dashboard ? dashboard.transactions.length.toLocaleString() : "…"}
          note="achats et ventes de la période"
        />
      </section>

      {erreur && !dashboard ? (
        <div role="alert" className="alert alert-error alert-soft flex flex-wrap items-center justify-between gap-3">
          <span>Impossible de charger les données. Vérifiez la connexion ou réessayez.</span>
          <button type="button" className="btn btn-sm" onClick={() => setVersion((v) => v + 1)}>
            Réessayer
          </button>
        </div>
      ) : (
        /* Ordinateur : achats et ventes à gauche ; à droite, le récapitulatif de la journée avec l'état du stock juste en dessous.
           La carte des achats et ventes a toujours exactement la hauteur de la colonne de droite : elle s'arrête en bas de la carte
           de l'état du stock, même quand il y a peu de contenu à droite ; si la liste est plus longue, elle défile dans sa carte.
           Téléphone : récapitulatif, état du stock, puis achats et ventes, sans limite de hauteur. */
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:self-start">
            <ProductOverview
              email={email}
              dateFiltre={dateFiltre}
              donnees={dashboard?.stats ?? null}
              margeTotale={margeTotale}
            />
            <StockSummaryTable email={email} dateFiltre={dateFiltre} donnees={dashboard?.summary ?? null} />
          </div>
          <div className="lg:relative lg:col-span-7 lg:col-start-1 lg:row-start-1">
            <div className="lg:absolute lg:-inset-1 lg:overflow-y-auto lg:p-1 lg:[&>*]:min-h-full">
              <RecentTransactions
                email={email}
                dateFiltre={dateFiltre}
                donnees={dashboard?.transactions ?? null}
                coutsAchat={dashboard?.coutsAchat}
              />
            </div>
          </div>
        </div>
      )}
    </Wrapper>
  );
}
