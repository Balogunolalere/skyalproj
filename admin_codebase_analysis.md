# Admin Codebase Analysis Summary
## Skyal Laser Services - Admin Dashboard (fixed-code(3))

### Overview
This is a Next.js 14+ admin dashboard for managing laser cutting services across two brands: SKYAL and PABERIN. It features a comprehensive admin panel with order management, customer tracking, analytics, production workflow, and escalation handling.

### Technology Stack
- **Framework**: Next.js 14+ (App Router, Server Components)
- **Language**: TypeScript
- **Database**: Prisma with LibSQL (Turso) adapter
- **Auth**: JWT-based with refresh tokens, TOTP support for OWNER role
- **UI**: Radix UI primitives + Lucide icons
- **State Management**: Zustand (brand filter, sidebar collapse)
- **Form Handling**: React Hook Form (implied by dependencies)
- **Drag & Drop**: DND Kit (for Kanban board)
- **Payment**: Paystack integration
- **Email**: Email campaign system with templates

### Core Architecture

#### 1. Authentication System
- **AdminAuthProvider** (client): Context-based auth with sessionStorage persistence
- **useAdminFetch**: Auto-attaches auth headers, handles brand filtering, token refresh on 401
- **admin-auth.ts**: Server-side JWT verification, rate limiting, TOTP enforcement for OWNER
- Token blacklist stored in localStorage for logout invalidation
- Roles: OWNER (full access), STAFF (limited access)

#### 2. Database Schema (Prisma)
Key models:
- **Order**: Central model with state machine (11 states), audit flags, notifications
- **Service**: Catalog with pricing, lead times, express options per brand
- **AdminUser**: Staff accounts with role-based access
- **Escalation**: Customer support ticket system with message threads
- **Inventory**: Stock tracking with reorder thresholds
- **Notification**: Multi-channel (email, in-app, WhatsApp) system
- **CustomQuote**: Pre-order quote system
- **Promotion**: Discount campaigns
- **Referral**: Customer referral program

#### 3. Order State Machine
Valid transitions enforced in `transitionOrder()`:
```
QUOTING → PAYMENT_PENDING
PAYMENT_PENDING → PAYMENT_SUCCESS | CANCELLED | ON_HOLD
PAYMENT_SUCCESS → IN_QUEUE | REFUNDED | ON_HOLD
IN_QUEUE → IN_PRODUCTION | ON_HOLD | CANCELLED
IN_PRODUCTION → READY | ON_HOLD
READY → DISPATCHED | DELIVERED | ON_HOLD
DISPATCHED → DELIVERED | CANCELLED
DELIVERED → (terminal)
ON_HOLD → PAYMENT_PENDING | PAYMENT_SUCCESS | IN_QUEUE | CANCELLED
CANCELLED → REFUNDED
REFUNDED → (terminal)
```
Special gate: `PAYMENT_SUCCESS → IN_QUEUE` requires `auditPassed = true`

#### 4. Pricing Engine
- Flat-rate service catalog pricing (no VAT)
- Supports express surcharge (50% default)
- Add-on services with separate pricing
- First-time customer discounts
- Delivery fee calculation (local: ₦500 min + ₦150/km; nationwide: ₦3,500)
- Minimum charge enforcement per service

#### 5. Admin Routes Structure
```
/admin
├── page.tsx              # Dashboard
├── layout.tsx            # Auth provider wrapper
├── login/page.tsx        # Login page
├── orders/               # Order management
│   ├── page.tsx          # List with pagination/sorting
│   └── [id]/page.tsx     # Detail view
├── customers/            # Customer management
├── production/           # Production queue/Kanban
├── analytics/            # Reports/charts
├── inventory/            # Stock management
├── suppliers/            # Supplier management
├── staff/                # User management
├── settings/             # Brand/settings config
├── invoices/             # Invoice generation
├── email-campaigns/      # Marketing emails
├── promotions/           # Discount campaigns
├── referrals/            # Referral program
├── escalations/          # Support tickets
├── custom-quotes/        # Quote management
├── event-quotes/         # Event-specific quotes
├── kanban/               # Visual production board
├── chats/                # Customer chat interface
├── notifications/        # Notification center
├── reports/              # Analytics reports
├── audit/                # Admin activity logs
├── state-machine/        # Order state transition tool
└── batch/                # Bulk operations
```

#### 6. API Routes
- `/api/admin/login` - JWT authentication with TOTP
- `/api/admin/logout` - Invalidate token
- `/api/admin/customers/` - CRUD customers
- `/api/admin/orders/` - List, search, paginate orders
- `/api/admin/orders/[id]/route.ts` - Single order operations
- `/api/admin/service-performance/` - Service analytics
- `/api/payment/verify/initialize/webhook/` - Paystack integration

### Key Features

1. **Multi-brand support** - Filter by SKYAL or PABERIN globally
2. **Real-time notifications** - Polling-based bell badge with toast alerts
3. **Command palette** - Cmd+K global command interface
4. **Kanban board** - Drag-and-drop order management via DND Kit
5. **CSV import/export** - Bulk order operations
6. **Audit logging** - Track all admin actions
7. **Escalation tracking** - Customer support ticket system
8. **Production workflow** - State machine with audit gates
9. **Pricing calculator** - Dynamic price breakdown with notes
10. **Email campaigns** - Segmented marketing communications

### Comparison with Public Website (skyalproj)

| Aspect | Admin Codebase | Public Website |
|--------|---------------|----------------|
| Route structure | `/admin/*` | Root (`/`) |
| Auth | JWT admin session | Magic link / customer session |
| DB schema | Extended (admin users, audits, escalations, etc.) | Minimal (orders, services, customers) |
| UI framework | Radix UI + admin components | Radix UI + skyal-specific components |
| Focus | Operational dashboard | Customer-facing storefront |
| State management | Zustand (brand, sidebar) | Hash-based routing |
| Payment | Paystack webhooks | Paystack initialization |
| Chat | Admin chat interface | LLM-powered customer chat |

### Notable Patterns

1. **Proxy-based db singleton** - Lazy-initialized Prisma client with Proxy for tree-shaking in dev
2. **useAdminFetch hook** - Centralized fetch wrapper with auth + brand param injection
3. **ADMIN_COPY constant** - Centralized string literals for labels/messages
4. **Skeleton components** - Loading states for KPI rows, tables, cards
5. **Brand filter sync** - Brand selection persists in URL and Zustand store

### Security Considerations

- Rate limiting on login (10 attempts/5min, 15min lock)
- TOTP required for OWNER role
- JWT short expiry (15min access, 7day refresh)
- CORS whitelist for admin origins
- Token blacklist on logout
- Role-based navigation (OWNER-only routes)
