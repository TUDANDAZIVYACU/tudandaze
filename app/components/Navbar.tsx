"use client";
import { UserButton, useUser } from '@clerk/nextjs'
import { ListTree, PackagePlus, Warehouse, HandHeart, Receipt, LayoutDashboard, Users, Scale, Menu, X, Wrench } from 'lucide-react'
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

// Style d'un lien du menu : pastille pleine pour la page ouverte, simple survol pour les autres
const styleLien = (actif: boolean) =>
    `flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-center text-[11px] font-semibold leading-tight transition-colors md:shrink-0 md:justify-start md:whitespace-nowrap md:px-2.5 md:text-[13px] ${
        actif ? 'bg-primary text-primary-content' : 'hover:bg-base-200'
    }`

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

    // Propriétaires, assureurs et comptes à enregistrer ont leur propre affichage ; tous les autres (clients) gardent le menu habituel
    const mode: 'owner' | 'assureur' | 'inscription' | 'client' =
        acces?.type === 'owner'
            ? 'owner'
            : acces?.type === 'assureur'
                ? 'assureur'
                : acces?.type === 'inscription'
                    ? 'inscription'
                    : 'client'

    // Propriétaire et compte à enregistrer : le titre reste celui de l'application
    const titre =
        acces?.type === 'owner' || acces?.type === 'inscription'
            ? APP_NAME
            : acces?.type === 'assureur'
                ? acces.nom
                : businessName

    // phoneClass : position et largeur dans la grille du téléphone (12 colonnes : 3 liens = col-span-4, 4 liens = col-span-3).
    // Téléphone : ligne 1 OBSERVATION, PRODUIT, APROVISIONNEMENT
    //             ligne 2 VENTE, HISTORIQUE, DETTES, DEPENSES
    //             ligne 3 EQUIPEMENTS, CENTRALISATION, UTILISATEURS
    // compact : sur les écrans très étroits (< 480 px), l'icône est masquée pour que les 4 mots de la ligne 2 tiennent en entier.
    const allNavLinks = [
        { href: "/", label: "Observation", icon: LayoutDashboard, adminOnly: false, phoneClass: "order-1 col-span-4", compact: false },
        { href: "/new-product", label: "Produit", icon: PackagePlus, adminOnly: false, phoneClass: "order-2 col-span-4", compact: false },
        { href: "/give", label: "Vente", icon: HandHeart, adminOnly: false, phoneClass: "order-4 col-span-3", compact: true },
        { href: "/transactions", label: "Historique", icon: Receipt, adminOnly: false, phoneClass: "order-5 col-span-3", compact: true },
        { href: "/dettes", label: "Dettes", icon: ListTree, adminOnly: false, phoneClass: "order-6 col-span-3", compact: true },
        { href: "/depenses", label: "Dépenses", icon: ListTree, adminOnly: false, phoneClass: "order-7 col-span-3", compact: true },
        { href: "/immobilisations", label: "Équipements", icon: Wrench, adminOnly: false, phoneClass: "order-8 col-span-4", compact: false },
    ]

    const navLinks = allNavLinks.filter(link => !link.adminOnly || isAdmin)

    // Liens affichés avant l'approvisionnement, puis ceux affichés après
    const liensAvant = navLinks.filter(({ label }) => label === "Observation" || label === "Produit")
    const liensApres = navLinks.filter(({ label }) => label !== "Observation" && label !== "Produit")

    // Seul l'assureur a un lien de gestion ; le propriétaire n'en a plus
    const liensGestion = [{ href: "/assureur", label: "Mes clients", icon: Users }]

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

    // Redirection au démarrage : propriétaire -> /owner, assureur -> /assureur, client -> reste sur /,
    // compte pas encore rattaché -> /inscription
    useEffect(() => {
        if (!acces) return
        if (acces.type === 'inscription') {
            if (pathname !== '/inscription') router.replace('/inscription')
            return
        }
        if (pathname !== '/') return
        if (acces.type === 'owner') router.replace('/owner')
        else if (acces.type === 'assureur') router.replace('/assureur')
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
                    {(mode === 'assureur' || mode === 'client') && (
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

            {accesCharge && mode === 'assureur' && (
                <nav
                    aria-label='Navigation principale'
                    className={`${menuOpen ? 'mt-2 grid grid-cols-3 gap-1' : 'hidden'} md:mt-1 md:flex md:flex-row md:flex-nowrap md:items-center md:gap-0.5`}
                >
                    {liensGestion.map(({ href, label, icon: Icon }) => (
                        <Link
                            href={href}
                            key={href}
                            aria-current={pathname === href ? 'page' : undefined}
                            className={styleLien(pathname === href)}
                        >
                            <Icon className='h-4 w-4' />
                            {label}
                        </Link>
                    ))}
                </nav>
            )}

            {accesCharge && mode === 'client' && (
                <>
                    {/* Une seule ligne sur ordinateur. Sur téléphone, grille de 12 colonnes avec un ordre
                        et une largeur propres à chaque lien (classes order-N et col-span-N). */}
                    <nav
                        aria-label='Navigation principale'
                        className={`${menuOpen ? 'mt-2 grid grid-cols-12 gap-1' : 'hidden'} md:mt-1 md:flex md:flex-row md:flex-nowrap md:items-center md:gap-0.5`}
                    >
                        {liensAvant.map(({ href, label, icon: Icon, phoneClass, compact }) => (
                            <Link
                                href={href}
                                key={href}
                                aria-current={pathname === href ? 'page' : undefined}
                                className={`${styleLien(pathname === href)} ${phoneClass} md:order-none`}
                            >
                                <Icon className={compact ? 'hidden h-4 w-4 min-[480px]:block' : 'h-4 w-4'} />
                                {label}
                            </Link>
                        ))}
                        <button
                            type='button'
                            className={`${styleLien(false)} order-3 col-span-4 md:order-none`}
                            onClick={() => (document.getElementById('my_modal_stock') as HTMLDialogElement).showModal()}
                        >
                            <Warehouse className='h-4 w-4' />
                            Approvisionnement
                        </button>
                        {liensApres.map(({ href, label, icon: Icon, phoneClass, compact }) => (
                            <Link
                                href={href}
                                key={href}
                                aria-current={pathname === href ? 'page' : undefined}
                                className={`${styleLien(pathname === href)} ${phoneClass} md:order-none`}
                            >
                                <Icon className={compact ? 'hidden h-4 w-4 min-[480px]:block' : 'h-4 w-4'} />
                                {label}
                            </Link>
                        ))}

                        <Link
                            href="/bilan"
                            aria-label="Centralisation"
                            aria-current={pathname === '/bilan' ? 'page' : undefined}
                            className={`${styleLien(pathname === '/bilan')} order-9 col-span-4 md:order-none`}
                        >
                            <Scale className='h-4 w-4' />
                            Centralisation
                        </Link>
                        {isAdmin && (
                            <Link
                                href="/admin"
                                aria-label="Utilisateurs"
                                aria-current={pathname === '/admin' ? 'page' : undefined}
                                className={`${styleLien(pathname === '/admin')} order-10 col-span-4 md:order-none`}
                            >
                                <Users className='h-4 w-4' />
                                Utilisateurs
                            </Link>
                        )}
                    </nav>

                    <Stock />
                </>
            )}
        </header>
    )
}

export default Navbar