'use client'
import { useState } from 'react'

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Arial' }}>
      
      {/* Sidebar */}
      <div style={{ 
        width: '220px', 
        backgroundColor: '#1a3a5c', 
        color: 'white',
        padding: '20px'
      }}>
        <h2 style={{ color: '#f0c040', marginBottom: '30px' }}>🎾 HGV Admin</h2>
        
        {['dashboard', 'players', 'challenges', 'results', 'ladder'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px',
              marginBottom: '8px',
              backgroundColor: activeTab === tab ? '#f0c040' : 'transparent',
              color: activeTab === tab ? '#1a3a5c' : 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left',
              textTransform: 'capitalize'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: '30px', backgroundColor: '#f5f5f5' }}>
        <h1 style={{ textTransform: 'capitalize' }}>📊 {activeTab}</h1>
        <p>Sección: {activeTab}</p>
      </div>

    </div>
  )
}