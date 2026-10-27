"use client";
import { readProductById, updateProduct } from '@/app/actions'
import Wrapper from '@/app/components/Wrapper'
import { FormDataType, Product } from '@/type'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify'

// Mêmes unités (et mêmes valeurs) que sur la page "Créer un produit"
const UNITES = [
    { value: "Pcs", label: "Pièces" },
    { value: "G", label: "Gramme" },
    { value: "Kg", label: "Kilogramme" },
    { value: "Bout", label: "Bouteille" },
    { value: "L", label: "Litre" },
    { value: "M", label: "Mètre" },
    { value: "Cm", label: "Centimètre" },
    { value: "H", label: "Heure" },
]

const ModifierProduitPage = ({ params }: { params: Promise<{ productId: string }> }) => {
    const { user } = useUser()
    const email = user?.primaryEmailAddress?.emailAddress as string
    const [product, setProduct] = useState<Product | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [formData, setFormData] = useState<FormDataType>({
        id: "",
        name: "",
        price: 0,
        prixAchat: 0,
        prixVente: 0,
        imageUrl: "",
        unit: "",
    })
    const router = useRouter()

    const fetchProduct = async () => {
        try {
            const { productId } = await params
            if (email) {
                const fetchedProduct = await readProductById(productId, email)
                if (fetchedProduct) {
                    setProduct(fetchedProduct)
                    setFormData({
                        id: fetchedProduct.id,
                        name: fetchedProduct.name,
                        price: fetchedProduct.price,
                        prixAchat: fetchedProduct.prixAchat || 0,
                        prixVente: fetchedProduct.prixVente || 0,
                        imageUrl: fetchedProduct.imageUrl ?? "",
                        unit: fetchedProduct.unit || "",
                    })
                }
            }
        } catch (error) {
            console.error(error)
        }
    }

    useEffect(() => {
        fetchProduct()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [email])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isSaving) return
        if (!formData.name || !formData.name.trim()) {
            toast.error("Le nom du produit est requis.")
            return
        }
        setIsSaving(true)
        try {
            await updateProduct(formData, email)
            toast.success("Produit mis a jour avec succes !")

            // On informe le reste de l'application (dashboard, transactions) pour qu'ils se rafraîchissent
            window.dispatchEvent(new Event("stock-updated"))

            router.push("/products")
        } catch (error: any) {
            console.error(error)
            toast.error(error?.message || "Erreur lors de la mise à jour")
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Wrapper>
            <div>
                {product ? (
                    <div>
                        <h1 className="text-2xl font-bold mb-4">Mise a jour du produit</h1>
                        <div className="flex md:flex-row flex-col md:items-center">
                            <form className="space-y-2" onSubmit={handleSubmit}>
                                <div className="text-sm font-semibold mb-2">Nom</div>
                                <input type="text" name="name" placeholder="Nom"
                                    className="input input-bordered w-full"
                                    value={formData.name} onChange={handleInputChange} />

                                <div className="text-sm font-semibold mb-2">Prix achat</div>
                                <input type="number" name="prixAchat" placeholder="0"
                                    className="input input-bordered w-full"
                                    value={formData.prixAchat} onChange={handleInputChange} />

                                <div className="text-sm font-semibold mb-2">Prix vente</div>
                                <input type="number" name="prixVente" placeholder="0"
                                    className="input input-bordered w-full"
                                    value={formData.prixVente} onChange={handleInputChange} />

                                <div className="text-sm font-semibold mb-2">Unité</div>
                                <select name="unit" className="select select-bordered w-full"
                                    value={formData.unit} onChange={handleInputChange}>
                                    <option value="">Sélectionner l'unité</option>
                                    {UNITES.map(u => (
                                        <option key={u.value} value={u.value}>{u.label}</option>
                                    ))}
                                    {/* Unité ancienne (ex. "pcs" en minuscules) : conservée pour ne pas être effacée */}
                                    {formData.unit && !UNITES.some(u => u.value === formData.unit) && (
                                        <option value={formData.unit}>{formData.unit}</option>
                                    )}
                                </select>

                                <button type="submit" className="btn btn-primary mt-3" disabled={isSaving}>
                                    {isSaving ? "Enregistrement..." : "Mettre a jour"}
                                </button>
                            </form>
                        </div>
                    </div>
                ) : (
                    <div className="flex justify-center items-center w-full">
                        <span className="loading loading-spinner loading-xl"></span>
                    </div>
                )}
            </div>
        </Wrapper>
    )
}

export default ModifierProduitPage
