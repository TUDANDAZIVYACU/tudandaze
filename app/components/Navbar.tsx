"use client";
import { UserButton, useUser } from '@clerk/nextjs'
import { ListTree, PackagePlus, Warehouse, HandHeart, Receipt, LayoutDashboard, Users, Scale, Menu, X, Wrench, CreditCard } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import { checkAndAddBusinessbi } from '../actions'
import { getNavbarInfo, type NavbarInfo } from '../actions-acces'
import Stock from './Stock'
import ThemeSelector from './ThemeSelector'

type AccesNavbar = NavbarInfo['acces'] | null

const APP_NAME = "ASSURANCE.COM"

// Dernier état de la barre connu, gardé dans le navigateur pour un affichage immédiat
const CLE_CACHE = "navbar-cache-v1"
type CacheNavbar = { userId: string; info: NavbarInfo }

// Style d'un lien du menu : pastille pleine pour la page ouverte, simple survol pour les autres.
// Téléphone : liens alignés à gauche, un par ligne. Ordinateur : une seule ligne centrée.
const styleLien = (actif: boolean) =>
    `flex items-center justify-start gap-1.5 rounded-lg px-3 py-1.5 text-left text-[13px] font-semibold leading-tight transition-colors md:shrink-0 md:whitespace-nowrap md:px-2.5 md:py-2 ${
        actif ? 'bg-primary text-primary-content' : 'hover:bg-base-200'
    }`

// Icône : visible sur téléphone et sur grand écran, masquée entre les deux pour que le menu tienne sur une ligne
const classeIcone = 'h-4 w-4 md:hidden xl:block'

// Menu ouvert sur téléphone : une colonne, sans interligne. Ordinateur : une seule ligne centrée
// (elle passe à la ligne seulement sur les écrans de tablette, trop étroits).
const classeNav = (menuOpen: boolean) =>
    `${menuOpen ? 'mt-2 flex flex-col items-stretch gap-0' : 'hidden'} md:mt-1 md:flex md:flex-row md:flex-wrap md:items-center md:justify-center md:gap-0.5 lg:flex-nowrap lg:-mx-[8%]`

const Navbar = () => {
    const { user, isLoaded } = useUser()
    const pathname = usePathname()
    const router = useRouter()
    const [businessName, setBusinessName] = useState<string>(APP_NAME)
    const [acces, setAcces] = useState<AccesNavbar>(null)
    const [menuOpen, setMenuOpen] = useState(false)
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

    // Ordre d'affichage (téléphone et ordinateur) :
    // Observation, Produit, Approvisionnement (bouton), Vente, Historique, Dettes, Dépenses, Centralisation,
    // Équipements, Utilisateurs (administrateur), Abonnement
    const liensAvant = [
        { href: "/", label: "Observation", icon: LayoutDashboard },
        { href: "/new-product", label: "Produit", icon: PackagePlus },
    ]
    const liensApres = [
        { href: "/give", label: "Vente", icon: HandHeart },
        { href: "/transactions", label: "Historique", icon: Receipt },
        { href: "/dettes", label: "Dettes", icon: ListTree },
        { href: "/depenses", label: "Dépenses", icon: ListTree },
        { href: "/bilan", label: "Centralisation", icon: Scale },
        { href: "/immobilisations", label: "Équipements", icon: Wrench },
    ]

    // Seul l'agentvendeur a un lien de gestion ; le propriétaire n'en a plus
    const liensGestion = [{ href: "/agentvendeur", label: "Mes clients", icon: Users }]

    useEffect(() => {
        setMenuOpen(false)
    }, [pathname])

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

    return (
        <header className='border-b border-base-300 bg-base-100 px-5 pb-2 pt-3 md:px-[10%] print:hidden'>
            {/* Ligne 1 : nom de l'entreprise à gauche, outils à droite */}
            <div className='flex items-center justify-between gap-3'>
                <div className='flex min-w-0 items-center gap-3'>
                    <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-content'>
                        <PackagePlus className='h-5 w-5' />
                    </span>
                    <span className='truncate text-lg font-bold md:text-xl'>{titre}</span>
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                    {(mode === 'agentvendeur' || mode === 'client') && (
                        <button
                            className='btn btn-sm btn-ghost md:hidden'
                            onClick={() => setMenuOpen((prev) => !prev)}
                            aria-label="Afficher le menu"
                            aria-expanded={menuOpen}
                        >
                            {menuOpen ? <X className='h-5 w-5' /> : <Menu className='h-5 w-5' />}
                        </button>
                    )}
                    <ThemeSelector />
                    <UserButton />
                </div>
            </div>

            {accesCharge && mode === 'agentvendeur' && (
                <nav aria-label='Navigation principale' className={classeNav(menuOpen)}>
                    {liensGestion.map(({ href, label, icon: Icon }) => (
                        <Link
                            href={href}
                            key={href}
                            aria-current={pathname === href ? 'page' : undefined}
                            className={styleLien(pathname === href)}
                        >
                            <Icon className={classeIcone} />
                            {label}
                        </Link>
                    ))}
                </nav>
            )}

            {accesCharge && mode === 'client' && (
                <>
                    {/* Téléphone : liens à gauche, un sous l'autre. Ordinateur : une seule ligne centrée. */}
                    <nav aria-label='Navigation principale' className={classeNav(menuOpen)}>
                        {liensAvant.map(({ href, label, icon: Icon }) => (
                            <Link
                                href={href}
                                key={href}
                                aria-current={pathname === href ? 'page' : undefined}
                                className={styleLien(pathname === href)}
                            >
                                <Icon className={classeIcone} />
                                {label}
                            </Link>
                        ))}
                        <button
                            type='button'
                            className={styleLien(false)}
                            onClick={() => (document.getElementById('my_modal_stock') as HTMLDialogElement).showModal()}
                        >
                            <Warehouse className={classeIcone} />
                            Approvisionnement
                        </button>
                        {liensApres.map(({ href, label, icon: Icon }) => (
                            <Link
                                href={href}
                                key={href}
                                aria-current={pathname === href ? 'page' : undefined}
                                className={styleLien(pathname === href)}
                            >
                                <Icon className={classeIcone} />
                                {label}
                            </Link>
                        ))}
                        {isAdmin && (
                            <Link
                                href="/admin"
                                aria-label="Utilisateurs"
                                aria-current={pathname === '/admin' ? 'page' : undefined}
                                className={styleLien(pathname === '/admin')}
                            >
                                <Users className={classeIcone} />
                                Utilisateurs
                            </Link>
                        )}
                        {/* Abonnement : administrateur et caissier peuvent payer à l'avance ; les mois s'ajoutent à la fin de l'abonnement en cours */}
                        <Link
                            href="/abonnement"
                            aria-label="Abonnement"
                            aria-current={pathname === '/abonnement' ? 'page' : undefined}
                            className={styleLien(pathname === '/abonnement')}
                        >
                            <CreditCard className={classeIcone} />
                            Abonnement
                        </Link>
                    </nav>

                    <Stock />
                </>
            )}
        </header>
    )
}

export default Navbar
