import React from 'react'
import { ToastContainer } from 'react-toastify'
import Navbar from './Navbar'

type WrapperProps = {
    children: React.ReactNode
    compact?: boolean
}

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

            <div className={`px-5 md:px-[10%] ${compact ? 'mt-2' : 'mt-8'} mb-10 print:mt-0 print:px-0`}>
                {children}
            </div>
        </div>
    )
}

export default Wrapper