import { SignUp } from '@clerk/nextjs'
import React from 'react'

const page = () => {
    return (
        <div className='flex flex-col justify-center items-center min-h-screen gap-4 py-6'>
            <div className='w-full max-w-[400px] px-4 text-center'>
                <p className='text-xs text-gray-600'>
                    L&apos;accès est ouvert par votre assureur. Inscrivez-vous avec l&apos;email ou le numéro
                    de téléphone qu&apos;il a enregistré pour vous.
                </p>
            </div>
            <SignUp />
        </div>
    )
}

export default page
