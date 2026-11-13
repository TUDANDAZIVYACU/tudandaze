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

  const prenom = user?.firstName

  return (
    <Wrapper compact>
      {/* En-tête : bonjour et journée consultée à gauche, sélecteur de date à droite */}
      <section className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {prenom && <p className="text-sm text-base-content/60">Bonjour {prenom}</p>}
          <h1 className="text-xl font-bold leading-tight first-letter:uppercase sm:text-2xl md:text-3xl">
            {titre}
          </h1>
        </div>
        <input
          aria-label="Choisir la date"
          type="date"
          className="input input-bordered input-sm max-w-full bg-base-100"
          value={dateFiltre}
          onChange={(e) => setDateFiltre(e.target.value)}
        />
      </section>

      {/* Chiffres clés de la journée */}
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="col-span-2 lg:col-span-1">
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
