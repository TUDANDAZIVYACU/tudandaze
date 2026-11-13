"use client";
import { UserButton, useUser } from '@clerk/nextjs'
import { ListTree, PackagePlus, Warehouse, HandHeart, Receipt, LayoutDashboard, Users, Scale, Wrench, CreditCard, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import { checkAndAddBusinessbi } from '../actions'
import { getNavbarInfo, type NavbarInfo } from '../actions-acces'
import Stock from './Stock'
import ThemeSelector from './ThemeSelector'

type AccesNavbar = NavbarInfo['acces'] | null
type Lien = { href: string; label: string; court?: string; icon: LucideIcon }

const APP_NAME = "TUDANDAZE.COM"

// Dernier état de la barre connu, gardé dans le navigateur pour un affichage immédiat
const CLE_CACHE = "navbar-cache-v1"
type CacheNavbar = { userId: string; info: NavbarInfo }

// Ordinateur : lien du menu du haut (pastille bleu ciel pour la page ouverte)
const styleLienHaut = (actif: boolean) =>
    `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-2 text-[13px] font-semibold leading-tight transition-colors ${
        actif ? 'bg-primary text-primary-content shadow-sm' : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'
    }`

// Icône du menu du haut : masquée entre tablette et grand écran pour que le menu tienne sur une ligne
const classeIcone = 'h-4 w-4 md:hidden xl:block'

// Menu du haut : une seule ligne centrée (elle passe à la ligne seulement sur les écrans de tablette)
const classeNavHaut = 'mt-1 flex flex-row flex-wrap items-center justify-center gap-0.5 lg:flex-nowrap lg:-mx-[8%]'

// Téléphone : onglet de la barre du bas (icône au-dessus du texte, largeur fixe : la barre défile horizontalement)
const styleOnglet = (actif: boolean) =>
    `flex w-[5.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-semibold leading-tight transition-colors ${
        actif ? 'bg-primary/10 text-primary' : 'text-base-content/60'
    }`

// Liens du menu client
const lienObservation: Lien = { href: "/", label: "Observation", icon: LayoutDashboard }
const lienProduit: Lien = { href: "/new-product", label: "Produit", icon: PackagePlus }
const lienVente: Lien = { href: "/give", label: "Vente", icon: HandHeart }
const lienHistorique: Lien = { href: "/transactions", label: "Historique", icon: Receipt }
const lienDettes: Lien = { href: "/dettes", label: "Dettes", icon: ListTree }
const lienDepenses: Lien = { href: "/depenses", label: "Dépenses", icon: Wallet }
const lienCentralisation: Lien = { href: "/bilan", label: "Centralisation", court: "Centralis.", icon: Scale }
const lienEquipements: Lien = { href: "/immobilisations", label: "Équipements", icon: Wrench }
const lienUtilisateurs: Lien = { href: "/admin", label: "Utilisateurs", icon: Users }
const lienAbonnement: Lien = { href: "/abonnement", label: "Abonnement", icon: CreditCard }

// Seul l'agentvendeur a un lien de gestion ; le propriétaire n'en a plus
const liensGestion: Lien[] = [{ href: "/agentvendeur", label: "Mes clients", icon: Users }]

const ouvrirApprovisionnement = () =>
    (document.getElementById('my_modal_stock') as HTMLDialogElement).showModal()

const Navbar = () => {
    const { user, isLoaded } = useUser()
    const pathname = usePathname()
    const router = useRouter()
    const [businessName, setBusinessName] = useState<string>(APP_NAME)
    const [acces, setAcces] = useState<AccesNavbar>(null)
    const barreRef = useRef<HTMLDivElement>(null)
    const hasSynced = useRef(false)

    const role = user?.publicMetadata?.role as string | undefined
    const isAdmin = isLoaded && role === 'admin'

    const userId = user?.id

    // Le type de compte est connu une fois la lecture terminée (ou lue depuis le cache)
    const accesCharge = acces !== null

    // Propriétaires, agentvendeurs et comptes à enregistrer ont leur propre affichage ; tous les autres (clients) gardent le menu habituel
    const mode: 'owner' | 'agentvendeur' | 'inscription' | 'client' =
        acces?.type === 'owner'
            ? 'owner'
            : acces?.type === 'agentvendeur'
                ? 'agentvendeur'
                : acces?.type === 'inscription'
                    ? 'inscription'
                    : 'client'

    // Propriétaire et compte à enregistrer : le titre reste celui de l'application
    const titre =
        acces?.type === 'owner' || acces?.type === 'inscription'
            ? APP_NAME
            : acces?.type === 'agentvendeur'
                ? acces.nom
                : businessName

    // Ordinateur (menu du haut), dans l'ordre :
    // Observation, Produit, Approvisionnement (bouton), Vente, Historique, Dettes, Dépenses, Centralisation,
    // Équipements, Utilisateurs (administrateur), Abonnement
    const liensAvant = [lienObservation, lienProduit]
    const liensApres = [lienVente, lienHistorique, lienDettes, lienDepenses, lienCentralisation, lienEquipements]

    // Téléphone (barre du bas) : tous les liens, dans le même ordre que sur ordinateur, à faire défiler vers la droite.
    // La page ouverte est ramenée au centre de la barre à chaque changement de page.
    useEffect(() => {
        barreRef.current
            ?.querySelector('[aria-current="page"]')
            ?.scrollIntoView({ inline: 'center', block: 'nearest' })
    }, [pathname, acces])

    // 1) Affichage immédiat du dernier état connu pour ce compte
    useEffect(() => {
        if (!isLoaded || !userId) return
        try {
            const brut = localStorage.getItem(CLE_CACHE)
            if (!brut) return
            const cache = JSON.parse(brut) as CacheNavbar
            if (cache.userId !== userId) return
            setAcces((actuel) => actuel ?? cache.info.acces)
            if (cache.info.businessName) setBusinessName(cache.info.businessName)
        } catch {
            // cache illisible : on l'ignore
        }
    }, [isLoaded, userId])

    // 2) Type de compte + nom de l'entreprise, lus côté serveur en UNE seule action
    useEffect(() => {
        if (!isLoaded || !userId) return
        getNavbarInfo()
            .then((info) => {
                if (!info) return
                setAcces(info.acces)
                if (info.businessName) setBusinessName(info.businessName)
                try {
                    const cache: CacheNavbar = { userId, info }
                    localStorage.setItem(CLE_CACHE, JSON.stringify(cache))
                } catch {
                    // stockage indisponible : sans conséquence
                }
            })
            .catch((err) => {
                console.error("Erreur getNavbarInfo:", err)
                setAcces((actuel) => actuel ?? { type: 'client' })
            })
    }, [isLoaded, userId])

    // Redirection au démarrage : propriétaire -> /owner, agentvendeur -> /agentvendeur, client -> reste sur /,
    // compte pas encore rattaché -> /inscription
    useEffect(() => {
        if (!acces) return
        if (acces.type === 'inscription') {
            if (pathname !== '/inscription') router.replace('/inscription')
            return
        }
        if (pathname !== '/') return
        if (acces.type === 'owner') router.replace('/owner')
        else if (acces.type === 'agentvendeur') router.replace('/agentvendeur')
    }, [acces, pathname, router])

    // Après connexion : donne le rôle admin au titulaire d'un compte client qui n'a pas encore de rôle
    // (et synchronise le rôle des membres d'équipe). Lancé une seule fois, et seulement pour les clients,
    // une fois le menu affiché : il ne retarde plus l'affichage.
    useEffect(() => {
        if (!user || hasSynced.current || acces?.type !== 'client') return
        hasSynced.current = true

        checkAndAddBusinessbi()
            .then(() => user.reload())
            .catch((err) => console.error("Erreur checkAndAddBusinessbi:", err))
    }, [user, acces])

    const logo = (
        <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-content'>
            <PackagePlus className='h-5 w-5' />
        </span>
    )

    const avecMenu = accesCharge && (mode === 'client' || mode === 'agentvendeur')

    return (
        <>
            {/* ORDINATEUR : en-tête avec le menu sur une seule ligne centrée (même largeur que les pages) */}
            <header className='hidden rounded-b-3xl bg-base-100 shadow-sm md:block print:hidden'>
                <div className='mx-auto w-full max-w-6xl px-8 pb-2 pt-3'>
                <div className='flex items-center justify-between gap-3'>
                    <div className='flex min-w-0 items-center gap-3'>
                        {logo}
                        <span className='truncate text-lg font-bold md:text-xl'>{titre}</span>
                    </div>
                    <div className='flex shrink-0 items-center gap-2'>
                        <ThemeSelector />
                        <UserButton />
                    </div>
                </div>

                {accesCharge && mode === 'agentvendeur' && (
                    <nav aria-label='Navigation principale' className={classeNavHaut}>
                        {liensGestion.map(({ href, label, icon: Icon }) => (
                            <Link
                                href={href}
                                key={href}
                                aria-current={pathname === href ? 'page' : undefined}
                                className={styleLienHaut(pathname === href)}
                            >
                                <Icon className={classeIcone} />
                                {label}
                            </Link>
                        ))}
                    </nav>
                )}

                {accesCharge && mode === 'client' && (
                    <nav aria-label='Navigation principale' className={classeNavHaut}>
                        {liensAvant.map(({ href, label, icon: Icon }) => (
                            <Link
                                href={href}
                                key={href}
                                aria-current={pathname === href ? 'page' : undefined}
                                className={styleLienHaut(pathname === href)}
                            >
                                <Icon className={classeIcone} />
                                {label}
                            </Link>
                        ))}
                        <button type='button' className={styleLienHaut(false)} onClick={ouvrirApprovisionnement}>
                            <Warehouse className={classeIcone} />
                            Approvisionnement
                        </button>
                        {liensApres.map(({ href, label, icon: Icon }) => (
                            <Link
                                href={href}
                                key={href}
                                aria-current={pathname === href ? 'page' : undefined}
                                className={styleLienHaut(pathname === href)}
                            >
                                <Icon className={classeIcone} />
                                {label}
                            </Link>
                        ))}
                        {isAdmin && (
                            <Link
                                href={lienUtilisateurs.href}
                                aria-label="Utilisateurs"
                                aria-current={pathname === lienUtilisateurs.href ? 'page' : undefined}
                                className={styleLienHaut(pathname === lienUtilisateurs.href)}
                            >
                                <Users className={classeIcone} />
                                Utilisateurs
                            </Link>
                        )}
                        {/* Abonnement : administrateur et caissier peuvent payer à l'avance ; les mois s'ajoutent à la fin de l'abonnement en cours */}
                        <Link
                            href={lienAbonnement.href}
                            aria-label="Abonnement"
                            aria-current={pathname === lienAbonnement.href ? 'page' : undefined}
                            className={styleLienHaut(pathname === lienAbonnement.href)}
                        >
                            <CreditCard className={classeIcone} />
                            Abonnement
                        </Link>
                    </nav>
                )}
                </div>
            </header>

            {/* TÉLÉPHONE : barre du haut (nom + outils) */}
            <header className='sticky top-0 z-30 flex items-center justify-between gap-3 rounded-b-3xl bg-base-100 px-5 py-3 shadow-sm md:hidden print:hidden'>
                <div className='flex min-w-0 items-center gap-3'>
                    {logo}
                    <span className='truncate text-lg font-bold'>{titre}</span>
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                    <ThemeSelector />
                    <UserButton />
                </div>
            </header>

            {/* TÉLÉPHONE : barre de navigation en bas, avec tous les liens (à faire défiler vers la droite) */}
            {avecMenu && (
                <nav
                    aria-label='Navigation principale'
                    className='fixed inset-x-0 bottom-0 z-50 border-t border-base-300 bg-base-100 pb-[env(safe-area-inset-bottom)] md:hidden print:hidden'
                >
                    <div
                        ref={barreRef}
                        className='flex items-stretch gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
                    >
                        {mode === 'agentvendeur' &&
                            liensGestion.map(({ href, label, court, icon: Icon }) => (
                                <Link
                                    href={href}
                                    key={href}
                                    aria-current={pathname === href ? 'page' : undefined}
                                    className={styleOnglet(pathname === href)}
                                >
                                    <Icon className='h-5 w-5' />
                                    <span className='max-w-full truncate'>{court ?? label}</span>
                                </Link>
                            ))}

                        {mode === 'client' && (
                            <>
                                {liensAvant.map(({ href, label, court, icon: Icon }) => (
                                    <Link
                                        href={href}
                                        key={href}
                                        aria-current={pathname === href ? 'page' : undefined}
                                        className={styleOnglet(pathname === href)}
                                    >
                                        <Icon className='h-5 w-5' />
                                        <span className='max-w-full truncate'>{court ?? label}</span>
                                    </Link>
                                ))}
                                <button type='button' className={styleOnglet(false)} onClick={ouvrirApprovisionnement}>
                                    <Warehouse className='h-5 w-5' />
                                    <span className='max-w-full truncate'>Approvis.</span>
                                </button>
                                {liensApres.map(({ href, label, court, icon: Icon }) => (
                                    <Link
                                        href={href}
                                        key={href}
                                        aria-current={pathname === href ? 'page' : undefined}
                                        className={styleOnglet(pathname === href)}
                                    >
                                        <Icon className='h-5 w-5' />
                                        <span className='max-w-full truncate'>{court ?? label}</span>
                                    </Link>
                                ))}
                                {isAdmin && (
                                    <Link
                                        href={lienUtilisateurs.href}
                                        aria-current={pathname === lienUtilisateurs.href ? 'page' : undefined}
                                        className={styleOnglet(pathname === lienUtilisateurs.href)}
                                    >
                                        <Users className='h-5 w-5' />
                                        <span className='max-w-full truncate'>Utilisateurs</span>
                                    </Link>
                                )}
                                <Link
                                    href={lienAbonnement.href}
                                    aria-current={pathname === lienAbonnement.href ? 'page' : undefined}
                                    className={styleOnglet(pathname === lienAbonnement.href)}
                                >
                                    <CreditCard className='h-5 w-5' />
                                    <span className='max-w-full truncate'>Abonnement</span>
                                </Link>
                            </>
                        )}
                    </div>
                </nav>
            )}

            {accesCharge && mode === 'client' && <Stock />}
        </>
    )
}

export default Navbar
