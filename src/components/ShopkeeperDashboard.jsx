import React, { useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { 
  Printer, CheckCircle, XCircle, ChevronLeft, Settings, 
  Layers, Users, TrendingUp, IndianRupee, Eye, RefreshCw, Smartphone
} from 'lucide-react';

export default function ShopkeeperDashboard({ onBack }) {
  const { 
    orders, services, rates, upiId, setUpiId, 
    updateOrderStatus, updateServiceStatus, updateRates 
  } = useContext(AppContext);

  const [selectedItem, setSelectedItem] = useState(null); // { type: 'order'|'service', data: ... }
  const [activeQueue, setActiveQueue] = useState('orders'); // 'orders' | 'services'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'processing' | 'completed' | 'rejected'
  
  // Rate Editing state
  const [showSettings, setShowSettings] = useState(false);
  const [tempRates, setTempRates] = useState({ ...rates });
  const [tempUpi, setTempUpi] = useState(upiId);

  // Printing simulation state
  const [isSimulatingPrint, setIsSimulatingPrint] = useState(false);

  // Dashboard Stats Calculations
  const stats = React.useMemo(() => {
    const totalOrders = orders.length;
    const completedOrders = orders.filter(o => o.status === 'completed');
    const revenue = completedOrders.reduce((sum, o) => sum + o.cost, 0);
    const activeQueueCount = orders.filter(o => o.status === 'pending' || o.status === 'processing').length;
    return { totalOrders, completedOrdersCount: completedOrders.length, revenue, activeQueueCount };
  }, [orders]);

  // Filter Logic
  const filteredOrders = orders.filter(order => {
    if (statusFilter === 'all') return true;
    return order.status === statusFilter;
  });

  const filteredServices = services.filter(srv => {
    if (statusFilter === 'all') return true;
    return srv.status === statusFilter;
  });

  const handleUpdateStatus = (id, newStatus) => {
    updateOrderStatus(id, newStatus);
    // Sync current detail view
    if (selectedItem && selectedItem.type === 'order' && selectedItem.data.id === id) {
      setSelectedItem(prev => ({
        ...prev,
        data: { ...prev.data, status: newStatus }
      }));
    }
  };

  const handleUpdateServiceStatus = (id, newStatus) => {
    updateServiceStatus(id, newStatus);
    if (selectedItem && selectedItem.type === 'service' && selectedItem.data.id === id) {
      setSelectedItem(prev => ({
        ...prev,
        data: { ...prev.data, status: newStatus }
      }));
    }
  };

  // Trigger real Windows Print Client locally
  const handlePrintTrigger = async (order) => {
    setIsSimulatingPrint(true);
    handleUpdateStatus(order.id, 'processing');
    
    try {
      const response = await fetch('http://localhost:3001/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl: order.fileUrl,
          orderDetails: {
            printType: order.printType,
            paperSize: order.paperSize,
            copies: order.copies,
            sides: order.sides
          }
        })
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        handleUpdateStatus(order.id, 'completed');
      } else {
        alert('Print failed: ' + (data.error || 'Unknown error'));
        handleUpdateStatus(order.id, 'rejected'); // or back to pending
      }
    } catch (err) {
      console.error("Local print client error:", err);
      alert('Could not connect to local print client. Make sure the worker is running on port 3001.');
      handleUpdateStatus(order.id, 'pending'); // Revert
    } finally {
      setIsSimulatingPrint(false);
    }
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    updateRates(tempRates);
    setUpiId(tempUpi);
    setShowSettings(false);
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'pending': return { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' };
      case 'processing': return { bg: 'rgba(6, 182, 212, 0.1)', border: 'rgba(6, 182, 212, 0.3)', text: '#06b6d4' };
      case 'completed': return { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', text: '#10b981' };
      case 'rejected': return { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' };
      default: return {};
    }
  };

  return (
    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn-secondary" onClick={onBack}>
          <ChevronLeft size={16} /> Exit Dashboard
        </button>
        <h2 style={{ fontSize: '24px', letterSpacing: '1px', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Shopkeeper Dashboard
        </h2>
        <button className="btn-secondary" onClick={() => setShowSettings(!showSettings)}>
          <Settings size={16} /> Rates & Settings
        </button>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'rgba(6,182,212,0.1)', padding: '12px', borderRadius: '12px' }}>
            <Layers size={24} color="var(--accent-secondary)" />
          </div>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Active Queue</span>
            <h2 style={{ fontSize: '28px' }}>{stats.activeQueueCount}</h2>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'rgba(16,185,129,0.1)', padding: '12px', borderRadius: '12px' }}>
            <CheckCircle size={24} color="var(--success)" />
          </div>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Completed Today</span>
            <h2 style={{ fontSize: '28px' }}>{stats.completedOrdersCount}</h2>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(6,182,212,0.15) 100%)', padding: '12px', borderRadius: '12px' }}>
            <IndianRupee size={24} color="var(--accent-primary)" />
          </div>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Today's Revenue</span>
            <h2 style={{ fontSize: '28px', color: 'var(--success)' }}>₹{stats.revenue}</h2>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '12px' }}>
            <Users size={24} color="var(--text-primary)" />
          </div>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Jobs Logged</span>
            <h2 style={{ fontSize: '28px' }}>{stats.totalOrders}</h2>
          </div>
        </div>
      </div>

      {/* RATES EDITOR SETTINGS POPUP */}
      {showSettings && (
        <div className="glass-card animate-fade-in" style={{ padding: '24px', border: '1px solid var(--accent-secondary)' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={18} /> Update Pricing Rates & Shop UPI ID</h3>
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Shop VPA/UPI ID (Where customer payment QR directs)</label>
              <input 
                type="text" 
                value={tempUpi} 
                onChange={e => setTempUpi(e.target.value)} 
                required 
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              {Object.keys(tempRates).map((rateKey) => (
                <div key={rateKey} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {rateKey.toUpperCase().replace(/_/g, ' ')} (₹)
                  </label>
                  <input 
                    type="number" 
                    step="0.5" 
                    min="0"
                    value={tempRates[rateKey]} 
                    onChange={e => setTempRates({ ...tempRates, [rateKey]: parseFloat(e.target.value) || 0 })} 
                    required 
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px', alignSelf: 'flex-start' }}>
              <button type="submit" className="btn-primary">Save Rates</button>
              <button type="button" className="btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Split Dashboard Area */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', minHeight: '550px' }}>
        
        {/* Left Side: Queues List */}
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Queue Selector & Filter Tabs */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <button 
              onClick={() => { setActiveQueue('orders'); setSelectedItem(null); }}
              style={{ flex: 1, padding: '10px', background: activeQueue === 'orders' ? 'rgba(6,182,212,0.15)' : 'transparent', color: activeQueue === 'orders' ? 'var(--accent-secondary)' : 'var(--text-secondary)' }}
            >
              Print Queue ({filteredOrders.length})
            </button>
            <button 
              onClick={() => { setActiveQueue('services'); setSelectedItem(null); }}
              style={{ flex: 1, padding: '10px', background: activeQueue === 'services' ? 'rgba(139,92,246,0.15)' : 'transparent', color: activeQueue === 'services' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
            >
              Services Token Queue ({filteredServices.length})
            </button>
          </div>

          {/* Queue Status Filter pills */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['all', 'pending', 'processing', 'completed', 'rejected'].map(filter => (
              <button 
                key={filter} 
                onClick={() => setStatusFilter(filter)}
                style={{
                  fontSize: '11px', 
                  padding: '6px 12px', 
                  borderRadius: '20px',
                  background: statusFilter === filter ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: statusFilter === filter ? '#fff' : 'var(--text-muted)',
                  border: '1px solid',
                  borderColor: statusFilter === filter ? 'rgba(255,255,255,0.2)' : 'transparent'
                }}
              >
                {filter.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Render Queue Lists */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', maxHeight: '420px', paddingRight: '4px' }}>
            {activeQueue === 'orders' ? (
              filteredOrders.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No print orders found.</p>
              ) : (
                filteredOrders.map(order => {
                  const s = getStatusStyle(order.status);
                  return (
                    <div 
                      key={order.id}
                      onClick={() => setSelectedItem({ type: 'order', data: order })}
                      style={{
                        background: selectedItem?.type === 'order' && selectedItem?.data.id === order.id ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.15)',
                        border: '1px solid',
                        borderColor: selectedItem?.type === 'order' && selectedItem?.data.id === order.id ? 'var(--accent-secondary)' : 'var(--border-color)',
                        borderRadius: '12px',
                        padding: '14px',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{order.id}</span>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: s.bg, border: `1px solid ${s.border}`, color: s.text }}>
                          {order.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <p><strong>Cust:</strong> {order.customerName}</p>
                        <p><strong>File:</strong> {order.fileName}</p>
                        <p style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          <span>{order.printType.toUpperCase()} • {order.paperSize.toUpperCase()}</span>
                          <span style={{ color: 'var(--success)', fontWeight: 600 }}>₹{order.cost}</span>
                        </p>
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              filteredServices.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No service requests found.</p>
              ) : (
                filteredServices.map(srv => {
                  const s = getStatusStyle(srv.status);
                  return (
                    <div 
                      key={srv.id}
                      onClick={() => setSelectedItem({ type: 'service', data: srv })}
                      style={{
                        background: selectedItem?.type === 'service' && selectedItem?.data.id === srv.id ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.15)',
                        border: '1px solid',
                        borderColor: selectedItem?.type === 'service' && selectedItem?.data.id === srv.id ? 'var(--accent-primary)' : 'var(--border-color)',
                        borderRadius: '12px',
                        padding: '14px',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--accent-primary)' }}>{srv.token}</span>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: s.bg, border: `1px solid ${s.border}`, color: s.text }}>
                          {srv.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <p><strong>Cust:</strong> {srv.customerName}</p>
                        <p><strong>Service:</strong> {srv.serviceType.replace('_', ' ').toUpperCase()}</p>
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>

        {/* Right Side: Active Details View */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '400px' }}>
          {!selectedItem ? (
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '12px' }}>
              <Eye size={40} />
              <p>Select an item from the queue to view details and perform actions</p>
            </div>
          ) : (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Detail Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
                <div>
                  <h3 style={{ fontSize: '20px', color: 'var(--text-primary)' }}>
                    {selectedItem.type === 'order' ? selectedItem.data.id : selectedItem.data.token}
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Received: {new Date(selectedItem.data.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: getStatusStyle(selectedItem.data.status).bg,
                    border: `1px solid ${getStatusStyle(selectedItem.data.status).border}`,
                    color: getStatusStyle(selectedItem.data.status).text
                  }}>
                    {selectedItem.data.status.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Detail Body */}
              {selectedItem.type === 'order' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>CUSTOMER NAME</span>
                      <strong style={{ color: '#fff' }}>{selectedItem.data.customerName}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>UPI TXN ID (PROOF)</span>
                      <strong style={{ color: 'var(--accent-secondary)' }}>{selectedItem.data.upiTxnId || 'N/A'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>PRINT CONFIGURATION</span>
                      <strong style={{ color: '#fff' }}>
                        {selectedItem.data.printType.toUpperCase()} ({selectedItem.data.paperSize.toUpperCase()}) • {selectedItem.data.sides.toUpperCase()}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>TOTAL PAGES × COPIES</span>
                      <strong style={{ color: '#fff' }}>
                        {selectedItem.data.pages} pages × {selectedItem.data.copies} copies
                      </strong>
                    </div>
                  </div>

                  {/* Simulated File Preview Screen */}
                  <div style={{ background: '#07080c', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px', marginBottom: '10px' }}>
                      <Printer size={16} color="var(--accent-secondary)" />
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Document Viewer (Simulated)</span>
                    </div>
                    <div style={{ height: '140px', background: '#fff', color: '#000', padding: '16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: '11px' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ddd', paddingBottom: '4px', marginBottom: '8px' }}>
                          <strong>{selectedItem.data.fileName}</strong>
                          <span>Page 1 of {selectedItem.data.pages}</span>
                        </div>
                        <p style={{ color: '#666', lineHeight: '1.4' }}>
                          [PDF Binary Document Preview Mode]<br />
                          File metadata loaded. Printing layout verified for {selectedItem.data.paperSize.toUpperCase()}.
                        </p>
                      </div>
                      <div style={{ fontSize: '9px', color: '#999', textAlign: 'right' }}>
                        Size: {selectedItem.data.fileSize}
                      </div>
                    </div>
                  </div>

                  {selectedItem.data.fileUrl && (
                    <a 
                      href={selectedItem.data.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="btn-secondary" 
                      style={{ textDecoration: 'none', justifyContent: 'center', width: '100%', display: 'inline-flex', gap: '8px' }}
                    >
                      📁 Open Uploaded Document ({selectedItem.data.fileName})
                    </a>
                  )}

                  {/* Order Actions */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                    {selectedItem.data.status !== 'completed' && selectedItem.data.status !== 'rejected' && (
                      <>
                        <button 
                          className="btn-primary" 
                          onClick={() => handlePrintTrigger(selectedItem.data)}
                          disabled={isSimulatingPrint}
                          style={{ flex: 2 }}
                        >
                          {isSimulatingPrint ? (
                            <>Sending to Printer... <RefreshCw size={16} className="pulse-status" /></>
                          ) : (
                            <>Approve & Print <Printer size={16} /></>
                          )}
                        </button>
                        <button 
                          className="btn-danger" 
                          onClick={() => handleUpdateStatus(selectedItem.data.id, 'rejected')}
                          disabled={isSimulatingPrint}
                          style={{ flex: 1 }}
                        >
                          <XCircle size={16} /> Reject
                        </button>
                      </>
                    )}
                    {selectedItem.data.status === 'completed' && (
                      <p style={{ color: 'var(--success)', fontWeight: 600, fontSize: '14px', width: '100%', textAlign: 'center' }}>
                        🎉 Job completed & document printed!
                      </p>
                    )}
                    {selectedItem.data.status === 'rejected' && (
                      <p style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '14px', width: '100%', textAlign: 'center' }}>
                        ❌ Job has been rejected.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px' }}>
                    <p><strong>Customer Name:</strong> {selectedItem.data.customerName}</p>
                    <p><strong>Service Requested:</strong> {selectedItem.data.serviceType.replace('_', ' ').toUpperCase()}</p>
                    <p><strong>Service Token:</strong> <code style={{ color: 'var(--accent-primary)', fontSize: '15px' }}>{selectedItem.data.token}</code></p>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>REQUEST DETAILS</span>
                      <p style={{ marginTop: '4px', fontSize: '13px' }}>{selectedItem.data.details}</p>
                    </div>
                  </div>

                  {/* Service Actions */}
                  <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '10px' }}>
                    {selectedItem.data.status === 'pending' && (
                      <>
                        <button 
                          className="btn-success" 
                          onClick={() => handleUpdateServiceStatus(selectedItem.data.id, 'processing')}
                          style={{ flex: 1 }}
                        >
                          Process Request
                        </button>
                        <button 
                          className="btn-danger" 
                          onClick={() => handleUpdateServiceStatus(selectedItem.data.id, 'rejected')}
                          style={{ flex: 1 }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {selectedItem.data.status === 'processing' && (
                      <button 
                        className="btn-primary" 
                        onClick={() => handleUpdateServiceStatus(selectedItem.data.id, 'completed')}
                        style={{ flex: 1 }}
                      >
                        Mark Completed & Call Token
                      </button>
                    )}
                    {selectedItem.data.status === 'completed' && (
                      <p style={{ color: 'var(--success)', fontWeight: 600, fontSize: '14px', width: '100%', textAlign: 'center' }}>
                        ✅ Service request finalized. Customer called.
                      </p>
                    )}
                    {selectedItem.data.status === 'rejected' && (
                      <p style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '14px', width: '100%', textAlign: 'center' }}>
                        ❌ Request rejected.
                      </p>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

      </div>

    </div>
  );
}
