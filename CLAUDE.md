# Zoiten ERP

Корпоративная мини-ERP система для компании Zoiten (торговля на маркетплейсах).

## Домен & Хостинг

- **Домен**: zoiten.pro (пока не привязан)
- **VPS**: root@85.198.97.89 (key-based SSH auth)
- **Слоган**: "Время для жизни, свобода от рутины"

## Stack

- **Framework**: Next.js 14 (App Router, TypeScript)
- **Database**: PostgreSQL + Prisma ORM
- **UI**: shadcn/ui + Tailwind CSS + Framer Motion
- **Auth**: NextAuth.js (credentials provider)
- **Deploy**: systemd + nginx reverse proxy на VPS

## Аутентификация

- Суперадмин: sergey.fyodorov@gmail.com / stafurovonet
- Суперадмин создаёт пользователей, назначает логин/пароль, даёт доступ к разделам
- RBAC — ролевой доступ к разделам

## Разделы ERP

1. **Товары** (MVP — первый модуль)
2. Управление ценами
3. Недельные карточки
4. Управление остатками
5. Себестоимость партий
6. План закупок
7. План продаж
8. Служба поддержки (из https://github.com/safyodorov/ai-cs-zoiten)

## Модель данных — Товары

- Наименование (строка до 100 символов)
- Фото (одно, вертикальное 3:4, JPEG/PNG, до 2К)
- Артикулы маркетплейсов (WB, Ozon, ДМ, ЯМ + кастомные, до 10 на маркетплейс)
- Штрих-коды (1-20 на товар)
- Характеристики: вес кг, габариты (В×Ш×Г см), объём (авто из габаритов)
- Бренд (по умолчанию Zoiten)
- Категория/подкатегория (настраиваются per бренд, CRUD)
  - Zoiten: Дом, Кухня, Красота и здоровье
- ABC-статус (A, B, C)
- Наличие (есть / out of stock / выведен из ассортимента)
- Мягкое удаление (статус "удалено", физ. удаление через 30 дней)

## Маркетплейсы

- Wildberries (основной)
- Ozon
- ДМ (Детский Мир)
- ЯМ (Яндекс Маркет)
- Возможность добавлять новые

## Бренды компании

- Zoiten (основной)

## VPS заметки

- На VPS также работает CantonFairBot (/opt/CantonFairBot/)
- PostgreSQL нужно установить на VPS
- Nginx будет проксировать zoiten.pro → localhost:3000

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Zoiten ERP**

Корпоративная мини-ERP система для компании Zoiten — торговля на маркетплейсах (Wildberries, Ozon, Детский Мир, Яндекс Маркет). Веб-приложение на zoiten.pro для управления товарами, ценами, остатками, закупками и службой поддержки. Целевая аудитория — команда из 10+ сотрудников компании.

**Core Value:** Единая база товаров компании, от которой зависят все остальные процессы ERP — цены, закупки, остатки, поддержка.

### Constraints

- **Tech stack**: Next.js 15 (App Router, TypeScript, React 19), PostgreSQL + Prisma 6, shadcn/ui v4 + Tailwind v4 + motion, Auth.js v5
- **Hosting**: Один VPS (85.198.97.89), нужно не мешать CantonFairBot
- **Storage**: Фото на VPS filesystem, не в облаке
- **Security**: bcrypt для паролей, HTTPS/SSL через Let's Encrypt, CSRF protection
- **Deploy**: systemd + nginx reverse proxy → localhost:3000
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Summary Verdict
## Recommended Stack
### Core Framework
| Technology | Version to Use | Purpose | Why |
|------------|----------------|---------|-----|
| Next.js | **15.2.4** (not 14) | Fullstack framework | Current stable. App Router is mature. Turbopack stable. React 19 required. Starting on 14 today is a deliberate downgrade. |
| React | **19.x** (required by Next.js 15) | UI runtime | Next.js 15 requires React 19 minimum. Not optional. |
| TypeScript | **5.x** | Type safety | Ships with Next.js. Use strict mode. |
- `cookies()`, `headers()` are now async — must be awaited in server components/actions.
- GET Route Handlers no longer cached by default — explicitly set `cache: 'force-cache'` where needed.
- React 19 minimum — `useFormState` renamed to `useActionState`.
### Database
| Technology | Version to Use | Purpose | Why |
|------------|----------------|---------|-----|
| PostgreSQL | **16.x** | Primary database | Battle-tested, JSONB for flexible article data, supports partial indexes. Install on VPS. |
| Prisma ORM | **6.x** (NOT 7.x) | Database access, migrations | v6 is stable and has wide Next.js compatibility. v7 introduces breaking driver adapter requirement — unnecessary complexity for this project size. |
### Authentication
| Technology | Version to Use | Purpose | Why |
|------------|----------------|---------|-----|
| Auth.js (NextAuth.js) | **5.x (beta, stable enough)** | Session + RBAC | The v4 → v5 rename to Auth.js is complete. v5 has deep Next.js 15 App Router integration, middleware-based route protection, and JWT/database sessions. Credentials provider works for username/password. |
| bcryptjs | **^2.4.3** | Password hashing | Pure JS implementation, no native bindings. Safer than `bcrypt` (native) for VPS deploy where Node.js version may vary. |
### UI Framework
| Technology | Version to Use | Purpose | Why |
|------------|----------------|---------|-----|
| shadcn/ui | **CLI v4 (March 2026)** | Component library | Not a package — components are copied into the project. CLI v4 supports Tailwind v4, React 19, and Next.js 15. Copy-ownership model means no upstream breaking changes. |
| Tailwind CSS | **v4.x** | Styling | shadcn/ui now requires Tailwind v4. CSS-first configuration (no `tailwind.config.js`). All config in the main CSS file. |
| tw-animate-css | **^1.x** | Animation utilities | Replaces `tailwindcss-animate`. New shadcn/ui projects install this by default as of March 2025. |
### Animations
| Technology | Version to Use | Purpose | Why |
|------------|----------------|---------|-----|
| motion (formerly framer-motion) | **12.x** | Page transitions, UI animations | Package renamed from `framer-motion` to `motion`. Both package names work but `motion` is the canonical current name. |
### Form Handling & Validation
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| react-hook-form | **^7.x** | Form state management | De facto standard. Minimal re-renders. Works with shadcn/ui Form components out of the box. |
| zod | **^3.x** | Schema validation | TypeScript-first. One schema used for both client validation and server action input validation. Integrates with react-hook-form via `@hookform/resolvers`. |
| @hookform/resolvers | **^3.x** | Bridge between RHF and Zod | Required to use Zod schemas as react-hook-form validators. |
### File Upload (Product Photos)
### Deployment
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | **22.x LTS** | Runtime | Current LTS. Next.js 15 supports Node.js 18.18+. |
| systemd | system | Process manager | Already chosen. Simpler than PM2 for single-app VPS, no extra daemon. |
| nginx | **1.24+** | Reverse proxy + static files | Handles SSL termination, static file serving, upload directory. |
| Let's Encrypt / certbot | latest | TLS certificates | Standard for VPS HTTPS. |
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Framework | Next.js 15 | Remix, Nuxt | Stack is pre-decided. Remix lacks ecosystem breadth. Nuxt is Vue. |
| ORM | Prisma 6 | Drizzle ORM, Prisma 7, TypeORM | Drizzle is faster but requires raw SQL mental model; overkill for this scale. Prisma 7 has documented Next.js 15 issues. TypeORM is dated. |
| Auth | Auth.js v5 | Lucia Auth, custom JWT | Lucia is lower-level — more setup. Custom JWT is a security liability. Auth.js v5 handles edge cases correctly. |
| Animation | motion (Framer Motion) | CSS animations, React Spring | CSS animations lack the Spring physics model for premium feel. React Spring is viable but smaller community. motion is the most widely documented. |
| Password hashing | bcryptjs | bcrypt (native), argon2 | `bcrypt` (native) requires build tools matching VPS Node.js version. `argon2` is stronger but overkill for internal ERP. `bcryptjs` is pure JS, zero native dependency risk. |
| Process manager | systemd | PM2 | PM2 adds a daemon that needs management. systemd is already on every Linux server and handles restarts, logging, and boot starts natively. |
| Photo storage | VPS filesystem | S3, Cloudinary | 50-200 products = ~200 photos. S3 adds cost and complexity. VPS is sufficient and already paid for. |
## Full Installation
# Create project
# Database
# Auth
# UI (shadcn init handles Tailwind v4 configuration)
# Forms & validation
# shadcn components you'll need
## Environment Variables
# .env.local
## Sources
- [Next.js 15 Release Blog](https://nextjs.org/blog/next-15)
- [Next.js Current Version March 2026](https://www.abhs.in/blog/nextjs-current-version-march-2026-stable-release-whats-new)
- [Next.js Version 15 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-15)
- [Prisma ORM 7 Release Announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0)
- [Prisma Releases on GitHub](https://github.com/prisma/prisma/releases)
- [Auth.js RBAC Guide](https://authjs.dev/guides/role-based-access-control)
- [Auth.js Credentials Provider](https://authjs.dev/getting-started/providers/credentials)
- [shadcn/ui Tailwind v4 Docs](https://ui.shadcn.com/docs/tailwind-v4)
- [shadcn/ui CLI v4 Changelog](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4)
- [Framer Motion + Next.js Server Components](https://www.hemantasundaray.com/blog/use-framer-motion-with-nextjs-server-components)
- [Next.js Self-Hosting Guide](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js File Upload Server Actions](https://akoskm.com/file-upload-with-nextjs-14-and-server-actions/)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
