import React, { useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Lock, ChevronLeft, ShieldAlert } from 'lucide-react';

export default function ShopkeeperLogin({ onBack, onLoginSuccess }) {
  const { isFirebaseActive } = useContext(AppContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isFirebaseActive) {
        // Use Firebase Auth
        await signInWithEmailAndPassword(auth, email, password);
        onLoginSuccess();
      } else {
        // Local Mock Mode: Hardcoded password
        if (password === 'admin123') {
          onLoginSuccess();
        } else {
          setError('Invalid mock password. Try "admin123".');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(isFirebaseActive ? 'Invalid email or password.' : 'Login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <button className="btn-secondary" onClick={onBack} style={{ marginBottom: '24px' }}>
          <ChevronLeft size={16} /> Back to Home
        </button>

        <div className="glass-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139, 92, 246, 0.1)', padding: '16px', borderRadius: '50%', color: 'var(--accent-primary)', marginBottom: '16px' }}>
              <Lock size={32} />
            </div>
            <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Shopkeeper Access</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {isFirebaseActive ? 'Sign in with your admin account' : 'Local Mock Mode: Enter PIN'}
            </p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {isFirebaseActive && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Email</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                />
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{isFirebaseActive ? 'Password' : 'PIN / Password'}</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required 
              />
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '13px' }}>
                <ShieldAlert size={16} /> {error}
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={isLoading} style={{ marginTop: '8px' }}>
              {isLoading ? 'Authenticating...' : 'Secure Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
