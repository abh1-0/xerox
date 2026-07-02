import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import CustomerPortal from './components/CustomerPortal';
import ShopkeeperDashboard from './components/ShopkeeperDashboard';
import ShopkeeperLogin from './components/ShopkeeperLogin';
import { Printer, ShieldAlert, FileText, Smartphone, LayoutGrid, Layers } from 'lucide-react';

function MainApp() {
  const [view, setView] = useState('landing'); // 'landing' | 'customer' | 'shop_login' | 'shop'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {view === 'landing' && (
        <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
          
          {/* Brand/Hero Header */}
          <div style={{ marginBottom: '40px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-gradient)', padding: '16px', borderRadius: '24px', boxShadow: '0 8px 30px rgba(139, 92, 246, 0.4)', marginBottom: '20px' }}>
              <Printer size={48} color="#fff" />
            </div>
            <h1 style={{ fontSize: '48px', fontWeight: 800, fontFamily: 'var(--font-display)', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '8px' }}>
              DigiCenter
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '18px', maxWidth: '500px', margin: '0 auto', lineHeight: '1.6' }}>
              Next-generation digital workflow for Xerox, printing shops, and government service centers.
            </p>
          </div>

          {/* Mode Selection Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', width: '100%', maxWidth: '750px', marginBottom: '40px' }}>
            
            {/* Customer Portal Card */}
            <div 
              onClick={() => setView('customer')}
              className="glass-card" 
              style={{ 
                padding: '32px 24px', 
                cursor: 'pointer', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                gap: '16px',
                border: '1px solid rgba(255,255,255,0.06)'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.4)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
            >
              <div style={{ background: 'rgba(6, 182, 212, 0.1)', padding: '16px', borderRadius: '50%', color: 'var(--accent-secondary)' }}>
                <Smartphone size={32} />
              </div>
              <div>
                <h3 style={{ fontSize: '20px', color: '#fff', marginBottom: '6px' }}>Customer Portal</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  Upload documents, select B&W/color print properties, pay via UPI QR, and get instant digital tokens.
                </p>
              </div>
              <button className="btn-primary" style={{ marginTop: 'auto', width: '100%' }}>
                Enter Portal
              </button>
            </div>

            {/* Shopkeeper Dashboard Card */}
            <div 
              onClick={() => setView('shop_login')}
              className="glass-card" 
              style={{ 
                padding: '32px 24px', 
                cursor: 'pointer', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                gap: '16px',
                border: '1px solid rgba(255,255,255,0.06)'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
            >
              <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '16px', borderRadius: '50%', color: 'var(--accent-primary)' }}>
                <LayoutGrid size={32} />
              </div>
              <div>
                <h3 style={{ fontSize: '20px', color: '#fff', marginBottom: '6px' }}>Shopkeeper Dashboard</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  Manage printing queue in real-time, trigger desktop print client, update pricing sheets, and handle service requests.
                </p>
              </div>
              <button className="btn-primary" style={{ marginTop: 'auto', width: '100%', background: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)' }}>
                Open Dashboard
              </button>
            </div>

          </div>

          {/* Footer Info */}
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldAlert size={14} /> Educational prototype representing local Xerox digitizing system.
          </div>
        </div>
      )}

      {view === 'customer' && <CustomerPortal onBack={() => setView('landing')} />}
      {view === 'shop_login' && (
        <ShopkeeperLogin 
          onBack={() => setView('landing')} 
          onLoginSuccess={() => setView('shop')} 
        />
      )}
      {view === 'shop' && <ShopkeeperDashboard onBack={() => setView('landing')} />}

    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
