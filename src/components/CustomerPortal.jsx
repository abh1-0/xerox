import React, { useState, useContext, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  Upload, FileText, CheckCircle, QrCode, Printer, 
  Search, FileSpreadsheet, ChevronLeft, Award, Landmark, ClipboardList, Clock, RefreshCw 
} from 'lucide-react';

export default function CustomerPortal({ onBack }) {
  const { calculateCost, addOrder, addServiceRequest, orders, services, upiId, isFirebaseActive } = useContext(AppContext);
  const [activeTab, setActiveTab] = useState('print'); // 'print' | 'services' | 'track'

  // Print Form States
  const [customerName, setCustomerName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [printType, setPrintType] = useState('bw');
  const [paperSize, setPaperSize] = useState('a4');
  const [sides, setSides] = useState('single');
  const [copies, setCopies] = useState(1);
  const [pages, setPages] = useState(1);
  const [paperQuality, setPaperQuality] = useState('standard');
  const [binding, setBinding] = useState('none');
  
  // Payment Flow States
  const [showPayment, setShowPayment] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [upiTxnId, setUpiTxnId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successOrder, setSuccessOrder] = useState(null);

  // Government Service Form States
  const [serviceCustomerName, setServiceCustomerName] = useState('');
  const [serviceType, setServiceType] = useState('aadhaar_update');
  const [serviceDetails, setServiceDetails] = useState('');
  const [successService, setSuccessService] = useState(null);

  // Search/Track States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [customerHistory, setCustomerHistory] = useState([]);

  // Fetch local history
  useEffect(() => {
    const localHistory = localStorage.getItem('customer_submitted_ids');
    if (localHistory) {
      setCustomerHistory(JSON.parse(localHistory));
    }
  }, [successOrder, successService]);

  const saveToHistory = (type, id) => {
    const current = localStorage.getItem('customer_submitted_ids');
    const list = current ? JSON.parse(current) : [];
    const updated = [{ type, id, time: new Date().toISOString() }, ...list];
    localStorage.setItem('customer_submitted_ids', JSON.stringify(updated));
    setCustomerHistory(updated);
  };

  // Handle file drop
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Mock page count detection: PDF typically has multiple pages, others 1
      const mockPages = file.type === 'application/pdf' ? Math.floor(Math.random() * 5) + 2 : 1;
      setSelectedFile(file);
      setPages(mockPages);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const mockPages = file.type === 'application/pdf' ? Math.floor(Math.random() * 5) + 2 : 1;
      setSelectedFile(file);
      setPages(mockPages);
    }
  };

  // Cost calculation
  const totalCost = calculateCost(printType, paperSize, sides, copies, pages, paperQuality, binding);

  // Print Order Flow
  const handleInitOrder = (e) => {
    e.preventDefault();
    if (!selectedFile || !customerName) return;

    const newOrderTemp = {
      customerName,
      fileName: selectedFile.name,
      fileSize: `${(selectedFile.size / 1024).toFixed(1)} KB`,
      fileType: selectedFile.type,
      printType,
      paperSize,
      sides,
      copies,
      pages,
      paperQuality,
      binding,
      cost: totalCost,
    };
    setCurrentOrder(newOrderTemp);
    setShowPayment(true);
  };

  const handleCompleteOrder = async (e) => {
    e.preventDefault();
    if (!upiTxnId) return;

    setIsSubmitting(true);
    try {
      let fileUrl = '';
      if (isFirebaseActive && selectedFile) {
        const fileRef = ref(storage, `documents/${Date.now()}_${selectedFile.name}`);
        await uploadBytes(fileRef, selectedFile);
        fileUrl = await getDownloadURL(fileRef);
      }

      const saved = await addOrder({
        ...currentOrder,
        fileUrl,
        upiTxnId,
      });

      saveToHistory('order', saved.id);
      setSuccessOrder(saved);
      setShowPayment(false);
      // Reset Print Form
      setCustomerName('');
      setSelectedFile(null);
      setCopies(1);
      setPages(1);
      setUpiTxnId('');
    } catch (error) {
      console.error("Error submitting print order:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Service Request Flow
  const handleServiceSubmit = (e) => {
    e.preventDefault();
    if (!serviceCustomerName || !serviceDetails) return;

    const saved = addServiceRequest({
      customerName: serviceCustomerName,
      serviceType,
      details: serviceDetails,
    });
    saveToHistory('service', saved.id);
    setSuccessService(saved);
    // Reset Form
    setServiceCustomerName('');
    setServiceDetails('');
  };

  // Search Track Order/Token
  const handleSearch = (e) => {
    e.preventDefault();
    const cleanQuery = searchQuery.trim().toUpperCase();
    if (!cleanQuery) return;

    const foundOrder = orders.find(o => o.id === cleanQuery);
    if (foundOrder) {
      setSearchResult({ type: 'order', data: foundOrder });
      return;
    }

    const foundService = services.find(s => s.id === cleanQuery || s.token === cleanQuery);
    if (foundService) {
      setSearchResult({ type: 'service', data: foundService });
      return;
    }

    setSearchResult({ type: 'not_found' });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="pulse-status" style={{ color: 'var(--warning)', fontWeight: 600 }}>⏳ Pending Approval</span>;
      case 'processing':
        return <span className="pulse-status" style={{ color: 'var(--accent-secondary)', fontWeight: 600 }}>⚙️ Printing / Processing</span>;
      case 'completed':
        return <span style={{ color: 'var(--success)', fontWeight: 600 }}>✅ Ready for Pickup</span>;
      case 'rejected':
        return <span style={{ color: 'var(--danger)', fontWeight: 600 }}>❌ Rejected</span>;
      default:
        return status;
    }
  };

  // Generate UPI QR Code url via qrserver api
  const upiQrUrl = currentOrder 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=0f172a&data=${encodeURIComponent(
        `upi://pay?pa=${upiId}&pn=DigiCenter&am=${currentOrder.cost}&cu=INR&tn=${encodeURIComponent(`Order ${currentOrder.fileName}`)}`
      )}`
    : '';

  return (
    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', padding: '24px 16px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <button className="btn-secondary" onClick={onBack}>
          <ChevronLeft size={16} /> Exit
        </button>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ fontSize: '24px', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            DigiCenter Self-Service
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Instant Queue & Print Portal</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'rgba(255,255,255,0.03)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <button 
          onClick={() => setActiveTab('print')}
          style={{ flex: 1, padding: '12px', background: activeTab === 'print' ? 'var(--accent-gradient)' : 'transparent', color: '#fff', borderRadius: '8px' }}
        >
          <Printer size={16} /> Instant Print
        </button>
        <button 
          onClick={() => setActiveTab('services')}
          style={{ flex: 1, padding: '12px', background: activeTab === 'services' ? 'var(--accent-gradient)' : 'transparent', color: '#fff', borderRadius: '8px' }}
        >
          <Landmark size={16} /> Govt & Digital Services
        </button>
        <button 
          onClick={() => setActiveTab('track')}
          style={{ flex: 1, padding: '12px', background: activeTab === 'track' ? 'var(--accent-gradient)' : 'transparent', color: '#fff', borderRadius: '8px' }}
        >
          <ClipboardList size={16} /> Track Status
        </button>
      </div>

      {/* SUCCESS CONFIRMATION OVERLAYS */}
      {successOrder && (
        <div className="glass-card animate-fade-in" style={{ padding: '32px', textAlign: 'center', marginBottom: '24px', border: '1px solid var(--success)' }}>
          <CheckCircle size={56} color="var(--success)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '22px', marginBottom: '8px' }}>Order Submitted Successfully!</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>Your document is in the shop queue. Please note your Order ID for pickup.</p>
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '12px', display: 'inline-block', marginBottom: '20px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Order ID:</span>
            <h2 style={{ fontSize: '28px', color: 'var(--accent-secondary)', letterSpacing: '2px', marginTop: '4px' }}>{successOrder.id}</h2>
          </div>
          <div>
            <button className="btn-primary" onClick={() => setSuccessOrder(null)}>Create Another Order</button>
          </div>
        </div>
      )}

      {successService && (
        <div className="glass-card animate-fade-in" style={{ padding: '32px', textAlign: 'center', marginBottom: '24px', border: '1px solid var(--success)' }}>
          <Award size={56} color="var(--success)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '22px', marginBottom: '8px' }}>Service Request Registered!</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>Your service token has been generated. Show this token at the counter when called.</p>
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '12px', display: 'inline-block', marginBottom: '20px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Service Token:</span>
            <h2 style={{ fontSize: '28px', color: 'var(--accent-primary)', letterSpacing: '1px', marginTop: '4px' }}>{successService.token}</h2>
          </div>
          <div>
            <button className="btn-primary" onClick={() => setSuccessService(null)}>Submit Another Request</button>
          </div>
        </div>
      )}

      {/* PRINT SUBMISSION FORM */}
      {activeTab === 'print' && !successOrder && !showPayment && (
        <form onSubmit={handleInitOrder} className="glass-card animate-fade-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}><Printer size={20} /> Print Your Document</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>Your Name</label>
            <input 
              type="text" 
              placeholder="Enter your full name" 
              value={customerName} 
              onChange={e => setCustomerName(e.target.value)} 
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>Upload Document (PDF, Images)</label>
            <div 
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              style={{
                border: '2px dashed rgba(255,255,255,0.15)',
                borderRadius: '12px',
                padding: '30px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: selectedFile ? 'rgba(6, 182, 212, 0.03)' : 'transparent',
                borderColor: selectedFile ? 'var(--accent-secondary)' : 'rgba(255,255,255,0.15)',
              }}
              onClick={() => document.getElementById('file-upload-input').click()}
            >
              <input 
                id="file-upload-input" 
                type="file" 
                style={{ display: 'none' }} 
                accept="application/pdf,image/*" 
                onChange={handleFileChange}
              />
              <Upload size={32} style={{ color: selectedFile ? 'var(--accent-secondary)' : 'var(--text-muted)', marginBottom: '10px' }} />
              {selectedFile ? (
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedFile.name}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {(selectedFile.size / 1024).toFixed(1)} KB • Detected Pages: {pages}
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ fontWeight: 500 }}>Click to browse or drag & drop files here</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>PDF, PNG, JPG accepted</p>
                </div>
              )}
            </div>
          </div>

          {selectedFile && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', background: 'rgba(0,0,0,0.15)', padding: '16px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Print Color</label>
                <select value={printType} onChange={e => setPrintType(e.target.value)}>
                  <option value="bw">Black & White (B&W)</option>
                  <option value="color">Color Print</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Paper Size</label>
                <select value={paperSize} onChange={e => setPaperSize(e.target.value)}>
                  <option value="a4">A4 (Standard)</option>
                  <option value="a3">A3 (Large)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Sides</label>
                <select value={sides} onChange={e => setSides(e.target.value)}>
                  <option value="single">Single Sided</option>
                  <option value="double">Double Sided (Duplex)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>No. of Copies</label>
                <input 
                  type="number" 
                  min="1" 
                  max="100" 
                  value={copies} 
                  onChange={e => setCopies(parseInt(e.target.value) || 1)} 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Pages (Detected)</label>
                <input 
                  type="number" 
                  min="1" 
                  value={pages} 
                  onChange={e => setPages(parseInt(e.target.value) || 1)} 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Paper Quality</label>
                <select value={paperQuality} onChange={e => setPaperQuality(e.target.value)}>
                  <option value="standard">Standard (75gsm)</option>
                  <option value="premium">Premium (100gsm)</option>
                  <option value="glossy">Glossy Photo</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Binding</label>
                <select value={binding} onChange={e => setBinding(e.target.value)}>
                  <option value="none">None (Loose/Stapled)</option>
                  <option value="spiral">Spiral Binding</option>
                  <option value="hardbound">Hardbound</option>
                </select>
              </div>
            </div>
          )}

          {/* Pricing Estimation Banner */}
          {selectedFile && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'linear-gradient(90deg, rgba(139,92,246,0.1) 0%, rgba(6,182,212,0.1) 100%)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Estimated Cost</span>
                <h2 style={{ fontSize: '28px', color: 'var(--accent-secondary)' }}>₹{totalCost.toFixed(2)}</h2>
              </div>
              <button type="submit" className="btn-primary">
                Proceed to Pay <QrCode size={16} />
              </button>
            </div>
          )}
        </form>
      )}

      {/* PAYMENT MODAL/PANEL */}
      {showPayment && currentOrder && (
        <form onSubmit={handleCompleteOrder} className="glass-card animate-fade-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ textAlign: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
            <h3 style={{ fontSize: '20px' }}>Scan & Pay with UPI</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>Pay ₹{currentOrder.cost} to place your order</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{ background: '#fff', padding: '12px', borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', display: 'inline-block' }}>
              <img src={upiQrUrl} alt="UPI Payment QR Code" style={{ display: 'block' }} />
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
              Or pay to UPI: <code style={{ color: 'var(--accent-secondary)' }}>{upiId}</code>
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600 }}>Enter UPI Transaction Ref No. (Required)</label>
            <input 
              type="text" 
              placeholder="e.g. 12-digit transaction ID or Ref ID" 
              value={upiTxnId} 
              onChange={e => setUpiTxnId(e.target.value)} 
              required 
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Enter the transaction number from your GPay, PhonePe, or Paytm app screen.</p>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowPayment(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={isSubmitting}>
              {isSubmitting ? (
                <>Verifying payment... <RefreshCw size={16} className="pulse-status" /></>
              ) : (
                'Submit Order'
              )}
            </button>
          </div>
        </form>
      )}

      {/* GOVERNMENT / DIGITAL SERVICES */}
      {activeTab === 'services' && !successService && (
        <form onSubmit={handleServiceSubmit} className="glass-card animate-fade-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}><Landmark size={20} /> Register service / Digital requests</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>Full Name</label>
            <input 
              type="text" 
              placeholder="As per Government documents" 
              value={serviceCustomerName} 
              onChange={e => setServiceCustomerName(e.target.value)} 
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>Service Type</label>
            <select value={serviceType} onChange={e => setServiceType(e.target.value)}>
              <option value="aadhaar_update">Aadhaar Card Updates (Address/Mobile/DOB)</option>
              <option value="pan_apply">New PAN Card Application</option>
              <option value="birth_cert">Birth/Death Certificate Copy</option>
              <option value="other">Other Online Applications & Certificate Work</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>Details of Service</label>
            <textarea 
              rows="4" 
              placeholder="Describe what needs correction or details about your application..." 
              value={serviceDetails} 
              onChange={e => setServiceDetails(e.target.value)} 
              required
            />
          </div>

          <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start', marginTop: '10px' }}>
            Generate Service Token <Award size={16} />
          </button>
        </form>
      )}

      {/* TRACKING PORTAL */}
      {activeTab === 'track' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Search Card */}
          <form onSubmit={handleSearch} className="glass-card" style={{ padding: '20px', display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              placeholder="Search Order ID or Token (e.g. ORD-8201)" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn-primary">
              <Search size={16} /> Track
            </button>
          </form>

          {/* Search Result display */}
          {searchResult && (
            <div className="glass-card animate-fade-in" style={{ padding: '20px' }}>
              {searchResult.type === 'not_found' ? (
                <p style={{ textAlign: 'center', color: 'var(--danger)' }}>No order or token matched. Please double-check your ID.</p>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ID / Token</span>
                      <h4 style={{ fontSize: '18px', color: 'var(--accent-secondary)' }}>
                        {searchResult.type === 'order' ? searchResult.data.id : searchResult.data.token}
                      </h4>
                    </div>
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', textAlign: 'right' }}>Status</span>
                      {getStatusBadge(searchResult.data.status)}
                    </div>
                  </div>

                  {searchResult.type === 'order' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                      <p><strong>Customer:</strong> {searchResult.data.customerName}</p>
                      <p><strong>File Name:</strong> {searchResult.data.fileName}</p>
                      <p><strong>Format:</strong> {searchResult.data.paperSize.toUpperCase()} ({searchResult.data.printType === 'bw' ? 'B&W' : 'Color'}) • {searchResult.data.sides === 'single' ? 'Single Sided' : 'Double Sided'}</p>
                      <p><strong>Pages:</strong> {searchResult.data.pages} × {searchResult.data.copies} copies</p>
                      <p><strong>Price Paid:</strong> ₹{searchResult.data.cost}</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                      <p><strong>Customer:</strong> {searchResult.data.customerName}</p>
                      <p><strong>Service Type:</strong> {searchResult.data.serviceType.replace('_', ' ').toUpperCase()}</p>
                      <p><strong>Details:</strong> {searchResult.data.details}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Device Submit History */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <h4 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={16} /> Recent Submissions on this Device</h4>
            {customerHistory.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>No recent orders found on this browser.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {customerHistory.slice(0, 5).map((hist, i) => (
                  <div 
                    key={i} 
                    onClick={() => {
                      setSearchQuery(hist.id);
                      const foundOrder = orders.find(o => o.id === hist.id);
                      if (foundOrder) {
                        setSearchResult({ type: 'order', data: foundOrder });
                        return;
                      }
                      const foundService = services.find(s => s.id === hist.id || s.token === hist.id);
                      if (foundService) {
                        setSearchResult({ type: 'service', data: foundService });
                        return;
                      }
                      setSearchResult({ type: 'not_found' });
                    }}
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      background: 'rgba(255,255,255,0.02)', 
                      padding: '12px 16px', 
                      borderRadius: '8px', 
                      cursor: 'pointer',
                      border: '1px solid transparent'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                  >
                    <div>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{hist.id}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                        {hist.type === 'order' ? 'Print Order' : 'Govt Service'}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--accent-secondary)' }}>Click to Track</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
