# Nexus

A full-scale premium real-time chat and communication platform combining WhatsApp + Telegram + Discord + Slack into one product.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — JWT signing secret

## Demo Accounts

All passwords are `password123`.

| Email | Role |
|---|---|
| admin@nexus.app | admin |
| alice@nexus.app | user |
| bob@nexus.app | user |
| carol@nexus.app | moderator |
| dave@nexus.app | user |

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Auth: JWT (jsonwebtoken + bcryptjs), token stored in localStorage as `nexus_token`
- Frontend: React + Vite + Wouter + shadcn/ui + TanStack Query

## Where things live

- `lib/api-spec/openapi.yaml` — Full OpenAPI contract (source of truth)
- `lib/api-zod/src/generated/api.ts` — Zod schemas generated from OpenAPI
- `lib/api-client-react/src/generated/api.ts` — React Query hooks generated from OpenAPI
- `lib/db/src/schema/` — Drizzle ORM schema files (users, conversations, messages, channels, notifications, reports, settings)
- `artifacts/api-server/src/routes/` — Express route handlers (auth, users, conversations, messages, groups, channels, notifications, admin, dashboard)
- `artifacts/api-server/src/lib/auth.ts` — JWT signing, verification, requireAuth/requireAdmin middleware
- `artifacts/nexus/src/pages/` — Frontend pages (login, chat, channels, starred, notifications, admin, settings)

## Architecture decisions

- Contract-first API: OpenAPI spec → Zod schemas + React Query hooks via Orval codegen.
- JWT auth stored in localStorage (`nexus_token`); `setAuthTokenGetter` wires it into every API call via the custom fetch wrapper.
- Conversations are unified: direct, group, and channel types all use the `conversations` table with `conversation_members` for membership/settings per user (pinned, muted, archived, unread).
- Message reactions stored as JSONB array on the messages table for simplicity.
- Admin role checked server-side via `requireAdmin` middleware; `role` field in JWT payload.

## Product

- **Direct messaging** — 1:1 conversations with online presence indicators
- **Group chats** — multi-member groups with role-based permissions (owner, admin, member)
- **Broadcast channels** — public channels users can subscribe to
- **Starred messages** — save important messages across all conversations
- **Notifications** — per-user notification feed with read/unread tracking
- **Admin panel** — platform stats, user management (suspend/ban/activate), reports queue, settings, broadcast announcements
- **Profile & settings** — display name, bio, avatar, presence status, password change

## User preferences

- Do not use emojis in the UI.

## Gotchas

- Run codegen after any OpenAPI spec change: `pnpm --filter @workspace/api-spec run codegen`
- Always run `pnpm --filter @workspace/db run push` after schema changes
- Admin endpoints require JWT with `role: "admin"` — update role in DB manually or via admin panel
- `bcryptjs` catalog entry exists in pnpm-workspace.yaml via `artifacts/api-server`, but scripts package must add it as a direct dep

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
