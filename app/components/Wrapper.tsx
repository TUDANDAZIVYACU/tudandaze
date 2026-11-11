import React from 'react'
import { ToastContainer } from 'react-toastify'
import Navbar from './Navbar'

type WrapperProps = {
    children: React.ReactNode
    compact?: boolean
}

// Contenu centré, limité à 72 rem de large (max-w-6xl) : sur grand écran, il reste au milieu avec des marges égales.
// Téléphone : barre du haut + barre de navigation fixe en bas (marge basse pour ne pas cacher le contenu).
const Wrapper = ({ children, compact = false }: WrapperProps) => {
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
                className={`mx-auto w-full max-w-6xl px-5 md:px-8 ${compact ? 'mt-2' : 'mt-8'} mb-28 md:mb-10 print:mx-0 print:mb-0 print:mt-0 print:max-w-none print:px-0`}
            >
                {children}
            </div>
        </div>
    )
}

export default Wrapper
