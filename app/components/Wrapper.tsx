import React from 'react'
import { ToastContainer } from 'react-toastify'
import Navbar from './Navbar'

type WrapperProps = {
    children: React.ReactNode
    compact?: boolean
}

// Contenu centré, limité à 72 rem de large (max-w-6xl) : sur grand écran, il reste au milieu avec des marges égales.
// Espace entre le menu du haut et le titre : réduit (mt-2) pour toutes les pages, sur ordinateur comme sur téléphone.
// Le paramètre « compact » est conservé pour ne pas modifier les pages qui l'utilisent, il n'a plus d'effet.
// Téléphone : barre du haut + barre de navigation fixe en bas (marge basse pour ne pas cacher le contenu).
const Wrapper = ({ children }: WrapperProps) => {
    return (
        <div>
            <div className='print:hidden'>
                <Navbar/>
            </div>
            <div className='print:hidden'>
                <ToastContainer
                    position='top-right'
                    autoClose= {5000}
                    hideProgressBar={false}
                    newestOnTop={false}
                    closeOnClick
                    pauseOnHover
                    draggable
                />
            </div>

            <div
                className={`mx-auto w-full max-w-6xl px-5 md:px-8 mt-2 mb-28 md:mb-10 print:mx-0 print:mb-0 print:mt-0 print:max-w-none print:px-0`}
            >
                {children}
            </div>
        </div>
    )
}

export default Wrapper
