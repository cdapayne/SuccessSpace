SUCCESS Space — Website Scaffold

Overview
- Public-facing website for SUCCESS Space with two primary functions:
  - Cafe online ordering (lightweight POS queue)
  - Workspace/rooms scheduling requests with admin notification pipeline
- Built with zero external dependencies for easy local running. Static, accessible pages served by a small Node.js server.

Quick Start
1) Requirements: Node.js 18+
2) Env (optional): set `ADMIN_TOKEN` for admin views: `export ADMIN_TOKEN=changeme`
3) Run: `npm start`
4) Open: http://localhost:3000

Features in this scaffold
- Accessible, semantic HTML with keyboard support, skip link, ARIA labels, and good contrast.
- Cafe ordering flow: menu → cart → checkout → submit order.
- Workspace booking: date/time selector with purpose and size, submitted to admin queue.
- Admin queue (token-protected): view submitted orders and booking requests.
- Data persistence in local JSON files under `data/` (no external DB).

Structure
- `public/` — Static assets and pages (HTML/CSS/JS)
- `server/` — Minimal Node server with API routes
- `data/` — JSON storage for orders and bookings (created at runtime)

API routes (no external dependencies)
- `POST /api/order` — Submit cafe order
- `POST /api/booking` — Submit booking/scheduling request
- `GET /api/admin/orders?token=...` — List orders (requires `ADMIN_TOKEN`)
- `GET /api/admin/bookings?token=...` — List bookings (requires `ADMIN_TOKEN`)

What’s not implemented (yet)
- Payments (Stripe/Square), taxes, tips, refunds
- Realtime order screen / barista mode
- Inventory and menu management UI
- Calendar sync (Google/Outlook), double-booking prevention
- Email/SMS notifications (customer + admin)
- Authentication and roles (barista, community manager, owner)
- CDN, analytics, SEO polish, sitemap/robots
- Cookie consent + privacy policy + terms
- Hardened security headers and rate limiting

Recommended next steps
1) Payments and taxes: integrate Stripe (Payment Links or Checkout) in checkout.
2) Calendar: integrate Google Calendar with service account; add availability and collision checks.
3) Notifications: add email (e.g., SMTP or transactional provider) for order/booking confirmations.
4) Admin auth: add login + roles; protect admin pages server-side.
5) POS flows: print tickets, in-store pickup timestamps, order status (received → in progress → ready).
6) Accessibility pass: run axe + keyboard-only walkthrough, improve focus order and labels.
7) Branding: logo, colors, imagery, copy edits.
8) Hosting: containerize, set up HTTPS, CI/CD, backups, and monitoring.

Test Logins (for demo)
- Admin
  - Email: admin@success.space
  - Password: admin123
- Staff (Cafe Worker)
  - Email: staff@success.space
  - Password: staff123
- Customer
  - Email: customer@success.space
  - Password: customer123
  - Membership: Gold (10% discount applied in checkout summary)

Role Capabilities (scaffold)
- Admin: manage branding (name/color/logo/menu images), view bookings on a calendar, add events, view incoming orders, edit inventory counts.
- Staff: view incoming orders, edit inventory counts.
- Customer: view membership and their bookings; discount shown at checkout.
