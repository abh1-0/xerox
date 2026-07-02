import React, { createContext, useState, useEffect } from 'react';
import { db, isFirebaseActive } from '../firebase';
import { 
  collection, doc, onSnapshot, setDoc, updateDoc, getDoc 
} from 'firebase/firestore';

export const AppContext = createContext();

const DEFAULT_RATES = {
  bw_a4_single: 2,
  bw_a4_double: 3,
  bw_a3_single: 5,
  bw_a3_double: 8,
  color_a4_single: 10,
  color_a4_double: 15,
  color_a3_single: 20,
  color_a3_double: 30,
};

const INITIAL_ORDERS = [
  {
    id: 'ORD-8201',
    customerName: 'Aarav Sharma',
    fileName: 'resume.pdf',
    fileSize: '412 KB',
    fileType: 'application/pdf',
    printType: 'bw',
    paperSize: 'a4',
    sides: 'double',
    copies: 2,
    pages: 4,
    cost: 12,
    status: 'pending',
    upiTxnId: 'TXN89123891823',
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: 'ORD-8202',
    customerName: 'Priya Patel',
    fileName: 'visa_photo.png',
    fileSize: '1.2 MB',
    fileType: 'image/png',
    printType: 'color',
    paperSize: 'a4',
    sides: 'single',
    copies: 5,
    pages: 1,
    cost: 50,
    status: 'processing',
    upiTxnId: 'TXN89123891825',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  }
];

const INITIAL_SERVICES = [
  {
    id: 'SRV-101',
    serviceType: 'aadhaar_update',
    customerName: 'Rajesh Kumar',
    details: 'Mobile number and address correction request',
    status: 'pending',
    token: 'TKN-A402',
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: 'SRV-102',
    serviceType: 'pan_apply',
    customerName: 'Ananya Sen',
    details: 'New physical PAN card application request',
    status: 'completed',
    token: 'TKN-P110',
    timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
  }
];

export const AppProvider = ({ children }) => {
  const [orders, setOrders] = useState([]);
  const [services, setServices] = useState([]);
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [upiId, setUpiId] = useState('digicenter@paytm');

  // --- MODE 1: FIREBASE ACTIVE CONTEXT ---
  useEffect(() => {
    if (!isFirebaseActive) return;

    // Listen to orders
    const unsubscribeOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const docs = snapshot.docs.map(doc => doc.data());
      // Sort newest first
      docs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setOrders(docs.length ? docs : INITIAL_ORDERS);
    }, (error) => {
      console.error("Firestore Orders Subscription Error:", error);
    });

    // Listen to services
    const unsubscribeServices = onSnapshot(collection(db, 'services'), (snapshot) => {
      const docs = snapshot.docs.map(doc => doc.data());
      docs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setServices(docs.length ? docs : INITIAL_SERVICES);
    }, (error) => {
      console.error("Firestore Services Subscription Error:", error);
    });

    // Fetch Rates Settings
    const fetchSettings = async () => {
      try {
        const ratesDoc = await getDoc(doc(db, 'settings', 'rates'));
        if (ratesDoc.exists()) {
          setRates(ratesDoc.data());
        } else {
          // Initialize in DB
          await setDoc(doc(db, 'settings', 'rates'), DEFAULT_RATES);
        }

        const upiDoc = await getDoc(doc(db, 'settings', 'upi'));
        if (upiDoc.exists()) {
          setUpiId(upiDoc.data().upiId);
        } else {
          await setDoc(doc(db, 'settings', 'upi'), { upiId: 'digicenter@paytm' });
        }
      } catch (err) {
        console.error("Firestore Fetch Settings Error:", err);
      }
    };
    fetchSettings();

    // Listen to rates / upi changes in real-time
    const unsubscribeRates = onSnapshot(doc(db, 'settings', 'rates'), (snapshot) => {
      if (snapshot.exists()) setRates(snapshot.data());
    });
    const unsubscribeUpi = onSnapshot(doc(db, 'settings', 'upi'), (snapshot) => {
      if (snapshot.exists()) setUpiId(snapshot.data().upiId);
    });

    return () => {
      unsubscribeOrders();
      unsubscribeServices();
      unsubscribeRates();
      unsubscribeUpi();
    };
  }, [isFirebaseActive]);

  // --- MODE 2: LOCAL STORAGE FALLBACK CONTEXT ---
  useEffect(() => {
    if (isFirebaseActive) return;

    const localOrders = localStorage.getItem('digicenter_orders');
    setOrders(localOrders ? JSON.parse(localOrders) : INITIAL_ORDERS);

    const localServices = localStorage.getItem('digicenter_services');
    setServices(localServices ? JSON.parse(localServices) : INITIAL_SERVICES);

    const localRates = localStorage.getItem('digicenter_rates');
    setRates(localRates ? JSON.parse(localRates) : DEFAULT_RATES);

    const localUpi = localStorage.getItem('digicenter_upi');
    setUpiId(localUpi || 'digicenter@paytm');
  }, [isFirebaseActive]);

  // Write triggers for Local Mode only
  useEffect(() => {
    if (isFirebaseActive || orders.length === 0) return;
    localStorage.setItem('digicenter_orders', JSON.stringify(orders));
  }, [orders, isFirebaseActive]);

  useEffect(() => {
    if (isFirebaseActive || services.length === 0) return;
    localStorage.setItem('digicenter_services', JSON.stringify(services));
  }, [services, isFirebaseActive]);

  useEffect(() => {
    if (isFirebaseActive) return;
    localStorage.setItem('digicenter_rates', JSON.stringify(rates));
  }, [rates, isFirebaseActive]);

  // Pricing engine
  const calculateCost = (printType, paperSize, sides, copies, pages, paperQuality = 'standard', binding = 'none') => {
    const key = `${printType}_${paperSize}_${sides}`;
    const ratePerPage = rates[key] || 2;
    
    // Quality surcharge per page
    let qualitySurcharge = 0;
    if (paperQuality === 'premium') qualitySurcharge = 2;
    if (paperQuality === 'glossy') qualitySurcharge = 5;

    // Binding flat fee per copy
    let bindingFee = 0;
    if (binding === 'spiral') bindingFee = 50;
    if (binding === 'hardbound') bindingFee = 200;

    const costPerPage = ratePerPage + qualitySurcharge;
    const totalPagesCost = costPerPage * pages * copies;
    const totalBindingCost = bindingFee * copies;

    return totalPagesCost + totalBindingCost;
  };

  const addOrder = async (newOrder) => {
    const orderId = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    const orderWithMetadata = {
      ...newOrder,
      id: orderId,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };

    if (isFirebaseActive) {
      try {
        await setDoc(doc(db, 'orders', orderId), orderWithMetadata);
      } catch (err) {
        console.error("Firestore Add Order Error:", err);
      }
    } else {
      setOrders((prev) => [orderWithMetadata, ...prev]);
    }
    return orderWithMetadata;
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    if (isFirebaseActive) {
      try {
        await updateDoc(doc(db, 'orders', orderId), { status: newStatus });
      } catch (err) {
        console.error("Firestore Update Order Status Error:", err);
      }
    } else {
      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId ? { ...order, status: newStatus } : order
        )
      );
    }
  };

  const addServiceRequest = async (newService) => {
    const serviceId = `SRV-${Math.floor(100 + Math.random() * 900)}`;
    const serviceWithMetadata = {
      ...newService,
      id: serviceId,
      token: `TKN-${newService.serviceType === 'aadhaar_update' ? 'A' : newService.serviceType === 'pan_apply' ? 'P' : 'S'}${Math.floor(100 + Math.random() * 900)}`,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };

    if (isFirebaseActive) {
      try {
        await setDoc(doc(db, 'services', serviceId), serviceWithMetadata);
      } catch (err) {
        console.error("Firestore Add Service Request Error:", err);
      }
    } else {
      setServices((prev) => [serviceWithMetadata, ...prev]);
    }
    return serviceWithMetadata;
  };

  const updateServiceStatus = async (serviceId, newStatus) => {
    if (isFirebaseActive) {
      try {
        await updateDoc(doc(db, 'services', serviceId), { status: newStatus });
      } catch (err) {
        console.error("Firestore Update Service Status Error:", err);
      }
    } else {
      setServices((prev) =>
        prev.map((service) =>
          service.id === serviceId ? { ...service, status: newStatus } : service
        )
      );
    }
  };

  const updateRates = async (newRates) => {
    if (isFirebaseActive) {
      try {
        await setDoc(doc(db, 'settings', 'rates'), newRates);
      } catch (err) {
        console.error("Firestore Update Rates Error:", err);
      }
    } else {
      setRates(newRates);
    }
  };

  const handleUpdateUpiId = async (newUpi) => {
    if (isFirebaseActive) {
      try {
        await setDoc(doc(db, 'settings', 'upi'), { upiId: newUpi });
      } catch (err) {
        console.error("Firestore Update UPI Error:", err);
      }
    } else {
      setUpiId(newUpi);
      localStorage.setItem('digicenter_upi', newUpi);
    }
  };

  return (
    <AppContext.Provider
      value={{
        orders,
        services,
        rates,
        upiId,
        setUpiId: handleUpdateUpiId,
        calculateCost,
        addOrder,
        updateOrderStatus,
        addServiceRequest,
        updateServiceStatus,
        updateRates,
        isFirebaseActive,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
