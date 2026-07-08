import Link from 'next/link'

export default function Home() {
  console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log('KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a3a5c 0%, #0d5c2e 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Arial, sans-serif',
      padding: '20px'
    }}>

      {/* Logo y título */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{
          width: '120px',
          height: '120px',
          backgroundColor: '#f0c040',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '60px',
          margin: '0 auto 20px auto',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}>
          🎾
        </div>
        <h1 style={{
          color: '#f0c040',
          fontSize: '42px',
          margin: '0',
          textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
        }}>
          HGV Tennis Club
        </h1>
        <h2 style={{
          color: 'white',
          fontSize: '22px',
          margin: '10px 0 0 0',
          fontWeight: 'normal'
        }}>
          🏆 Challenger Ladder 2025
        </h2>
        <p style={{
          color: '#cce5ff',
          fontSize: '16px',
          marginTop: '10px'
        }}>
          Compite, sube posiciones y conviértete en el campeón del club
        </p>
      </div>

      {/* Tarjetas de información */}
      <div style={{
        display: 'flex',
        gap: '20px',
        marginBottom: '40px',
        flexWrap: 'wrap',
        justifyContent: 'center'
      }}>
        {[
          { icon: '👥', title: 'Jugadores', desc: 'Regístrate y únete a la escalera' },
          { icon: '⚔️', title: 'Desafíos', desc: 'Reta a jugadores sobre ti' },
          { icon: '📊', title: 'Ranking', desc: 'Sube posiciones ganando partidos' }
        ].map((card) => (
          <div key={card.title} style={{
            backgroundColor: 'rgba(255,255,255,0.1)',
            borderRadius: '12px',
            padding: '24px',
            width: '160px',
            textAlign: 'center',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.2)'
          }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>{card.icon}</div>
            <h3 style={{ color: '#f0c040', margin: '0 0 8px 0', fontSize: '16px' }}>{card.title}</h3>
            <p style={{ color: 'white', margin: '0', fontSize: '13px' }}>{card.desc}</p>
          </div>
        ))}
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/ladder" style={{
          backgroundColor: '#f0c040',
          color: '#1a3a5c',
          padding: '14px 32px',
          borderRadius: '8px',
          textDecoration: 'none',
          fontWeight: 'bold',
          fontSize: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          🏆 Ver Escalera
        </Link>

        <Link href="/register" style={{
          backgroundColor: 'transparent',
          color: 'white',
          padding: '14px 32px',
          borderRadius: '8px',
          textDecoration: 'none',
          fontWeight: 'bold',
          fontSize: '16px',
          border: '2px solid white'
        }}>
          📝 Registrarse
        </Link>

        <Link href="/login" style={{
          backgroundColor: 'transparent',
          color: '#f0c040',
          padding: '14px 32px',
          borderRadius: '8px',
          textDecoration: 'none',
          fontWeight: 'bold',
          fontSize: '16px',
          border: '2px solid #f0c040'
        }}>
          🔐 Admin
        </Link>
      </div>

      {/* Footer */}
      <p style={{
        color: 'rgba(255,255,255,0.5)',
        fontSize: '13px',
        marginTop: '50px'
      }}>
        © 2025 HGV Tennis Club · Todos los derechos reservados
      </p>

    </main>
  )
}