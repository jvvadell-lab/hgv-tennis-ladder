'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CATEGORIES = ['Cuarta', 'Quinta', 'Sexta', 'Sexta Novato']

const CATEGORY_COLORS: Record<string, { bg: string; border: string; badge: string }> = {
  'Cuarta':       { bg: 'from-yellow-50 to-yellow-100', border: 'border-yellow-400', badge: 'bg-yellow-400 text-white' },
  'Quinta':       { bg: 'from-blue-50 to-blue-100',    border: 'border-blue-400',   badge: 'bg-blue-500 text-white' },
  'Sexta':        { bg: 'from-green-50 to-green-100',  border: 'border-green-400',  badge: 'bg-green-500 text-white' },
  'Sexta Novato': { bg: 'from-gray-50 to-gray-100',    border: 'border-gray-400',   badge: 'bg-gray-500 text-white' },
}

type Player = {
  id: string
  name: string
  category: string
  position: number
  wins: number
  losses: number
}

export default function LadderPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPlayers = async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('status', 'active')
        .order('category')
        .order('position')

      if (error) {
        console.error('Error:', error)
      } else {
        setPlayers(data || [])
      }
      setLoading(false)
    }

    fetchPlayers()
  }, [])

  const getPlayersByCategory = (category: string) => {
    return players.filter(p => p.category === category)
  }

  const getMedal = (position: number) => {
    if (position === 1) return '🥇'
    if (position === 2) return '🥈'
    if (position === 3) return '🥉'
    return `#${position}`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-6xl mb-4">🎾</div>
          <p className="text-xl text-gray-600">Cargando escaleras...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-800 to-blue-600 text-white py-10 px-4 text-center shadow-lg">
        <h1 className="text-4xl font-bold mb-2">🎾 Escalera de Clasificación</h1>
        <p className="text-blue-200 text-lg">Club de Tenis HGV · Temporada 2025</p>
      </div>

      {/* Escaleras por categoría */}
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {CATEGORIES.map(category => {
            const categoryPlayers = getPlayersByCategory(category)
            const colors = CATEGORY_COLORS[category]

            return (
              <div
                key={category}
                className={`bg-gradient-to-br ${colors.bg} border-2 ${colors.border} rounded-2xl shadow-lg overflow-hidden`}
              >
                {/* Cabecera de categoría */}
                <div className={`${colors.badge} px-6 py-4 flex items-center justify-between`}>
                  <h2 className="text-xl font-bold">Categoría {category}</h2>
                  <span className="text-sm opacity-90">{categoryPlayers.length} jugadores</span>
                </div>

                {/* Tabla de jugadores */}
                {categoryPlayers.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <p className="text-4xl mb-2">🎾</p>
                    <p>No hay jugadores en esta categoría</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-white bg-opacity-60">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Pos</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Jugador</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">V</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">D</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryPlayers.map((player, index) => (
                        <tr
                          key={player.id}
                          className={`border-t border-white border-opacity-50 hover:bg-white hover:bg-opacity-40 transition-colors ${
                            index === 0 ? 'font-semibold' : ''
                          }`}
                        >
                          <td className="px-4 py-3 text-lg">
                            {getMedal(player.position)}
                          </td>
                          <td className="px-4 py-3 text-gray-800">
                            {player.name}
                          </td>
                          <td className="px-4 py-3 text-center text-green-600 font-semibold">
                            {player.wins || 0}
                          </td>
                          <td className="px-4 py-3 text-center text-red-500 font-semibold">
                            {player.losses || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>

        {/* Leyenda */}
        <div className="mt-8 bg-white rounded-xl shadow p-6">
          <h3 className="font-semibold text-gray-700 mb-3">📖 Leyenda</h3>
          <div className="flex flex-wrap gap-6 text-sm text-gray-600">
            <span>🥇 1er puesto</span>
            <span>🥈 2do puesto</span>
            <span>🥉 3er puesto</span>
            <span><strong>V</strong> = Victorias</span>
            <span><strong>D</strong> = Derrotas</span>
          </div>
        </div>
      </div>
    </div>
  )
}