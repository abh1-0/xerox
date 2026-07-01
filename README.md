# 🖨️ DigiCenter — Smart Xerox & Digital Service Hub

DigiCenter is a modern web-based digital service system made for millions of Xerox & printing shops in India. 

It replaces manual queues, slow internet, and messaging apps (WhatsApp) with a fully digital workflow.

---

## 🚀 Features

### 📱 Customer Side
- QR code-based access
- Upload documents (PDF, images)
- Select print options:
  - Color / B&W
  - A4 / A3
  - Single / Double-sided
  - Number of copies
- Live price calculation
- UPI payment support (intent-based, no payment gateway (I'm not that rich, duh))
- Order tracking system
- Token generation for service requests (PAN/Aadhar/Certificates)

---

### 🏢 Shopkeeper Dashboard
- Live order queue
- Accept / Reject requests
- Auto file preview
- Service management system:
  - Aadhaar updates
  - PAN applications
  - Birth certificates
  - Other government services
- Token-based queue system
- Status updates (Pending → Processing → Completed)

---

### 🧠 System Features
- Firebase backend (serverless architecture)
- Real-time updates
- Secure file storage
- Role-based access control
- Scalable architecture for multiple shops

---

## 🧱 Tech Stack

- Frontend: HTML / CSS / JavaScript (or React optional)
- Backend: Firebase
  - Firestore (Database)
  - Storage (File uploads)
  - Authentication (User roles)
  - Hosting (Web deployment)
- Optional Worker: Python / Node.js (Windows print client)

---

## 🔥 System Architecture

Customer Phone → Web App → Firebase → Shop Dashboard → Windows Print Client → Printer

---

## 💡 Future Improvements

- Multi-shop network system
- WhatsApp notifications
- SMS alerts
- AI document validation
- Auto UPI verification
- Mobile app version

---

## ⚠️ Disclaimer

Educational prototype for learning and development purposes. Real deployment may require compliance, security hardening, and payment gateway integration.

---

## ⭐ Vision

Transform local Xerox & service centers into digital, queue-less service hubs.
