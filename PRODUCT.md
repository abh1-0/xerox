# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

- Customers in a neighborhood print or document-services shop, typically on a phone, in a hurry, and without a Sprint account.
- Merchants operating a shop counter and its Windows-connected printers.
- Restricted abh1 operations staff who need operational metadata without casual access to documents.

## Product Purpose

Sprint digitizes a neighborhood shop counter. A customer scans a shop QR code, creates one unified request for printing or a merchant-assisted service, follows its live status, and collects the result. The merchant receives, processes, prints, and completes that same request in one Windows work tool.

## Positioning

Sprint combines a customer’s no-install, QR-first request flow with a securely registered local Windows device that can carry authorized documents through to installed printers, while retaining one canonical request lifecycle for print and services.

## Operating Context

Customers may have slow mobile data and may handle sensitive documents. Shop staff need an at-a-glance queue, a reliable printer bridge, safe recovery from network interruption, durable printing state, and actual Windows print execution. Merchant-assisted government-related services must never impersonate an authority or collect credentials, OTPs, PINs, passwords, or biometrics.

## Capabilities and Constraints

- A single Request model covers PRINT, COPY, SCAN, and SERVICE requests.
- Backend-enforced request state transitions, idempotent mutations, authorization boundaries, audit events, temporary attachment storage, cleanup, and authoritative pricing are required.
- Customer access uses a secure anonymous session; documents must never be public URLs.
- The merchant client is a native Windows application with printer discovery, printer mappings, test prints, queue controls, diagnostics, and durable local execution state.
- Payments use an abstraction; development payment mode must be isolated from verified production providers.
- Customer application is mobile-first web/PWA; merchant is Windows-native; admin is a restrained web surface.

## Brand Commitments

Product name: **sprint**, presented as **sprint by abh1**. It is fast, calm, practical, trustworthy, non-governmental, and not overly futuristic. Customer-facing language is direct and understandable. The shop identity is prominent.

## Evidence on Hand

- Existing Vite/Firebase prototype and Node print helper in this repository are replacement evidence only; their disconnected mock behavior must not be preserved.
- No verified production payment credentials, cloud object-storage credentials, or physical printer are available in the repository.

## Product Principles

1. A customer should understand the next action immediately after scanning a shop QR.
2. One request model and one lifecycle keep print and services coherent.
3. Physical printing is an irreversible action and must be idempotent, durable, and honest about uncertainty.
4. Documents and customer data receive least-privilege access and minimum retention.
5. Complexity belongs behind the interface; the customer sees a clear request and the merchant sees a clear queue.

## Accessibility & Inclusion

Keyboard navigation, semantic controls, visible focus, accessible labels, readable contrast, reduced-motion support, responsive touch targets, and understandable validation/recovery states are required.
