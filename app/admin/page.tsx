'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AdminPage() {
  const [activeSection, setActiveSection] = useState('dashboard')
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [filterCategoria, setFilterCategoria] = useState('')
  const [filterGenero, setFilterGenero] = useState('')

  useEffect(() => {
    if (activeSection === 'players') {
      fetchPlayers()
    }
  }, [activeSection])

  const fetchPlayers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setPlayers(data || [])
    setLoading(false)
  }

  const deletePlayer = async (id: string) => {
    if (!confirm('¿Seguro que quieres eliminar este jugador?')) return
    const { error } = await supabase.from('players').delete().eq('id', id)
    if (!error) fetchPlayers()
  }

  const filteredPlayers = players.filter(p => {
    const matchCat = filterCategoria ? p.categoria === filterCategoria : true
    const matchGen = filterGenero ? p.genero === filterGenero : true
    return matchCat && matchGen
  })

  const menuItems = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'players', icon: '👥', label: 'Jugadores' },
    { id: 'challenges', icon: '⚔️', label: 'Desafíos' },
    { id: 'results', icon: '🏆', label: 'Resultados' },
    { id: 'ladder', icon: '🎾', label: 'Escalafón' },
  ]

  const categorias = ['Sexta Novato', 'Sexta', 'Quinta', 'Cuarta']
  const generos = ['Masculino', 'Femenino']

  const getCategoriaColor = (cat: string) => {
    const colors: any = {
      'Sexta Novato': '#8B4513',
      'Sexta': '#1a472a',
      'Quinta': '#C0C0C0',
      'Cuarta': '#FFD700'
    }
    return colors[cat] || '#666'
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>

      {/* SIDEBAR */}
      <div style={{
        width: '220px',
        background: 'linear-gradient(180deg, #1a472a 0%, #2d5a27 100%)',
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ textAlign: 'center', padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
          <div style={{ fontSize: '36px' }}>🎾</div>
          <div style={{ color: 'white', fontWeight: 'bold', fontSize: '14px', marginTop: '8px' }}>HGV Tennis</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>Panel Admin</div>
        </div>

        <nav style={{ marginTop: '20px', flex: 1 }}>
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              style={{
                width: '100%',
                padding: '14px 20px',
                background: activeSection === item.id ? 'rgba(255,255,255,0.2)' : 'transparent',
                border: 'none',
                color: 'white',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '15px',
                borderLeft: activeSection === item.id ? '4px solid #FFD700' : '4px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </nav>

        <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
          <a href="/" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', textDecoration: 'none' }}>
            ← Volver al inicio
          </a>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <div style={{ flex: 1, background: '#f5f5f5', overflow: 'auto' }}>

        {/* HEADER */}
        <div style={{
          background: 'white',
          padding: '20px 30px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ margin: 0, color: '#1a472a', fontSize: '24px' }}>
            {menuItems.find(m => m.id === activeSection)?.icon}{' '}
            {menuItems.find(m => m.id === activeSection)?.label}
          </h1>
          <span style={{ color: '#888', fontSize: '14px' }}>
            🕐 {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>

        <div style={{ padding: '30px' }}>

          {/* DASHBOARD */}
          {activeSection === 'dashboard' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                {[
                  { icon: '👥', label: 'Jugadores', value: players.length || '—', color: '#1a472a' },
                  { icon: '⚔️', label: 'Desafíos Activos', value: '—', color: '#e67e22' },
                  { icon: '🏆', label: 'Partidos Jugados', value: '—', color: '#3498db' },
                  { icon: '📅', label: 'Este Mes', value: '—', color: '#9b59b6' },
                ].map((card, i) => (
                  <div key={i} style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '24px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                    borderTop: `4px solid ${card.color}`
                  }}>
                    <div style={{ fontSize: '32px' }}>{card.icon}</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: card.color, margin: '8px 0' }}>{card.value}</div>
                    <div style={{ color: '#888', fontSize: '14px' }}>{card.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                <h3 style={{ color: '#1a472a', marginTop: 0 }}>👋 Bienvenido al Panel de Administración</h3>
                <p style={{ color: '#666' }}>Desde aquí puedes gestionar jugadores, desafíos, resultados y el escalafón del club.</p>
                <button
                  onClick={() => setActiveSection('players')}
                  style={{
                    background: '#1a472a', color: 'white', border: 'none',
                    padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
                  }}
                >
                  👥 Ver Jugadores
                </button>
              </div>
            </div>
          )}

          {/* JUGADORES */}
          {activeSection === 'players' && (
            <div>
              {/* Filtros */}
              <div style={{
                background: 'white', borderRadius: '12px', padding: '20px',
                marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap'
              }}>
                <span style={{ fontWeight: 'bold', color: '#333' }}>🔍 Filtrar:</span>

                <select
                  value={filterGenero}
                  onChange={(e) => setFilterGenero(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px' }}
                >
                  <option value="">👥 Todos los géneros</option>
                  <option value="Masculino">♂️ Masculino</option>
                  <option value="Femenino">♀️ Femenino</option>
                </select>

                <select
                  value={filterCategoria}
                  onChange={(e) => setFilterCategoria(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px' }}
                >
                  <option value="">🏆 Todas las categorías</option>
                  {categorias.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <button
                  onClick={fetchPlayers}
                  style={{
                    background: '#1a472a', color: 'white', border: 'none',
                    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
                  }}
                >
                  🔄 Actualizar
                </button>

                <span style={{ marginLeft: 'auto', color: '#888', fontSize: '14px' }}>
                  Total: <strong>{filteredPlayers.length}</strong> jugadores
                </span>
              </div>

              {/* Tabla */}
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>⏳ Cargando jugadores...</div>
              ) : (
                <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#1a472a', color: 'white' }}>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>#</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>👤 Nombre</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>📧 Email</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>📱 Teléfono</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>👥 Género</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>🏆 Categoría</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>📅 Registro</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center' }}>⚙️ Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlayers.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                            😔 No hay jugadores registrados aún
                          </td>
                        </tr>
                      ) : (
                        filteredPlayers.map((player, index) => (
                          <tr key={player.id} style={{
                            borderBottom: '1px solid #f0f0f0',
                            background: index % 2 === 0 ? 'white' : '#fafafa'
                          }}>
                            <td style={{ padding: '12px 16px', color: '#888', fontSize: '14px' }}>{index + 1}</td>
                            <td style={{ padding: '12px 16px', fontWeight: '600', color: '#333' }}>{player.name}</td>
                            <td style={{ padding: '12px 16px', color: '#555', fontSize: '14px' }}>{player.email}</td>
                            <td style={{ padding: '12px 16px', color: '#555', fontSize: '14px' }}>{player.phone}</td>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{
                                background: player.genero === 'Masculino' ? '#dbeafe' : '#fce7f3',
                                color: player.genero === 'Masculino' ? '#1e40af' : '#9d174d',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                fontWeight: '600'
                              }}>
                                {player.genero === 'Masculino' ? '♂️' : '♀️'} {player.genero}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{
                                background: getCategoriaColor(player.categoria),
                                color: 'white',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                fontWeight: '600'
                              }}>
                                {player.categoria}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', color: '#888', fontSize: '13px' }}>
                              {player.created_at ? new Date(player.created_at).toLocaleDateString('es-ES') : '—'}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <button
                                onClick={() => deletePlayer(player.id)}
                                style={{
                                  background: '#fee2e2', color: '#dc2626', border: 'none',
                                  padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px'
                                }}
                              >
                                🗑️ Eliminar
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* DESAFÍOS */}
          {activeSection === 'challenges' && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: '60px' }}>⚔️</div>
              <h2 style={{ color: '#1a472a' }}>Gestión de Desafíos</h2>
              <p style={{ color: '#888' }}>Próximamente disponible</p>
            </div>
          )}

          {/* RESULTADOS */}
          {activeSection === 'results' && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: '60px' }}>🏆</div>
              <h2 style={{ color: '#1a472a' }}>Resultados de Partidos</h2>
              <p style={{ color: '#888' }}>Próximamente disponible</p>
            </div>
          )}

          {/* ESCALAFÓN */}
          {activeSection === 'ladder' && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: '60px' }}>🎾</div>
              <h2 style={{ color: '#1a472a' }}>Escalafón del Club</h2>
              <p style={{ color: '#888' }}>Próximamente disponible</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}