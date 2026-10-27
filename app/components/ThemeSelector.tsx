"use client";
import React, { useEffect, useState } from 'react'
import { Palette } from 'lucide-react'

const THEMES = [
  "retro", "light", "dark", "cupcake", "bumblebee", "emerald", "corporate",
  "synthwave", "cyberpunk", "valentine", "halloween", "garden",
  "forest", "aqua", "lofi", "pastel", "fantasy", "wireframe", "black",
  "luxury", "dracula", "cmyk", "autumn", "business", "acid", "lemonade",
  "night", "coffee", "winter"
]

const THEME_COLORS: Record<string, { bg: string }> = {
  retro: { bg: "#e4d8b4" }, light: { bg: "#ffffff" }, dark: { bg: "#1d232a" },
  cupcake: { bg: "#faf7f5" }, bumblebee: { bg: "#fffde7" }, emerald: { bg: "#f0fdf4" },
  corporate: { bg: "#f3f4f6" }, synthwave: { bg: "#2d1b69" }, cyberpunk: { bg: "#ffee00" },
  valentine: { bg: "#fae6f0" }, halloween: { bg: "#212121" }, garden: { bg: "#e9e7e7" },
  forest: { bg: "#171212" }, aqua: { bg: "#345ca8" }, lofi: { bg: "#f5f5f5" },
  pastel: { bg: "#fff0f3" }, fantasy: { bg: "#fffbf5" }, wireframe: { bg: "#ffffff" },
  black: { bg: "#000000" }, luxury: { bg: "#09090b" }, dracula: { bg: "#282a36" },
  cmyk: { bg: "#ffffff" }, autumn: { bg: "#f1f1ee" }, business: { bg: "#1c1c1c" },
  acid: { bg: "#f5f5f5" }, lemonade: { bg: "#fff9c4" }, night: { bg: "#0f1729" },
  coffee: { bg: "#20161f" }, winter: { bg: "#e8f4fd" },
}

const ThemeSelector = () => {
  const [currentTheme, setCurrentTheme] = useState("retro")
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("theme") || "retro"
    setCurrentTheme(saved)
    document.documentElement.setAttribute("data-theme", saved)
  }, [])

  const handleThemeChange = (theme: string) => {
    setCurrentTheme(theme)
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem("theme", theme)
    setOpen(false)
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
      <div className="relative z-50">
        <button onClick={() => setOpen(!open)} className="btn btn-ghost btn-sm gap-1">
          <Palette className="w-4 h-4" />
          <span className="hidden sm:inline text-xs capitalize">{currentTheme}</span>
        </button>

        {open && (
          <div className="
            fixed sm:absolute
            left-4 right-4 sm:left-auto sm:right-0
            mt-2 sm:mt-2
            top-auto
            bg-base-200 rounded-2xl shadow-2xl p-2
            sm:w-56
            max-h-[60vh] overflow-y-auto
            z-50
          ">
            <p className="text-xs font-bold uppercase opacity-50 px-2 py-1 sticky top-0 bg-base-200 z-10">
              Thème
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-1 gap-1">
              {THEMES.map((theme) => {
                const bg = THEME_COLORS[theme]?.bg || "#fff"
                const isActive = currentTheme === theme
                return (
                  <button
                    key={theme}
                    onClick={() => handleThemeChange(theme)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm capitalize transition-all w-full text-left
                      ${isActive ? 'ring-2 ring-primary font-bold bg-base-300' : 'hover:bg-base-300'}`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-base-300 shrink-0"
                      style={{ backgroundColor: bg }}
                    />
                    <span className="truncate">{theme}</span>
                    {isActive && <span className="ml-auto text-primary">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default ThemeSelector
