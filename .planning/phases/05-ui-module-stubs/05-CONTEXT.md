# Phase 5: UI & Module Stubs - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Landing page (public, unauthenticated) with branding, animations, and navigation. Six "coming soon" stub pages for future ERP modules. Support section integration from ai-cs-zoiten project.

</domain>

<decisions>
## Implementation Decisions

### Landing Page
- **D-01:** Full-screen hero section: Zoiten logo centered, slogan "Время для жизни, свобода от рутины" below.
- **D-02:** Below hero: grid of section cards showing all ERP modules (Товары, Управление ценами, etc.) — visual overview of the system.
- **D-03:** Login button in top-right corner of the page header.
- **D-04:** Route: / (root page, public, no auth required).
- **D-05:** motion (framer-motion) animations: fade-in on hero, stagger on section cards, smooth scroll.
- **D-06:** Dark theme preferred for landing (professional ERP feel). Dashboard stays light.
- **D-07:** Responsive: desktop-first, mobile acceptable.

### Module Stubs
- **D-08:** Single reusable ComingSoon component for all 6 stub pages.
- **D-09:** ComingSoon shows: section icon, section name, "В разработке" message, estimated timeline (optional).
- **D-10:** Stub routes under (dashboard) layout, protected by RBAC:
  - /prices — Управление ценами
  - /weekly-cards — Недельные карточки
  - /stock — Управление остатками
  - /cost — Себестоимость партий
  - /procurement — План закупок
  - /sales — План продаж
- **D-11:** Each stub page uses requireSection() for its respective ERP_SECTION.

### Support Integration
- **D-12:** Check if ai-cs-zoiten is deployed somewhere accessible. If yes → iframe. If no → placeholder page with link to GitHub repo and "Интеграция в процессе" message.
- **D-13:** Route: /support under (dashboard) layout, protected by RBAC (SUPPORT section).
- **D-14:** For MVP: placeholder with description of future AI support bot functionality. Full integration deferred until ai-cs-zoiten is deployed.

### Claude's Discretion
- Exact animation timings and easing
- Section card icons (can use Lucide icons)
- Color scheme for landing page
- ComingSoon component styling

</decisions>

<canonical_refs>
## Canonical References

### Prior Code
- `components/layout/Sidebar.tsx` — Navigation, section filtering
- `components/layout/NavLinks.tsx` — Active link highlighting
- `lib/sections.ts` — ERP_SECTION to URL mapping
- `lib/section-labels.ts` — Russian labels for sections
- `lib/rbac.ts` — requireSection()
- `app/(dashboard)/layout.tsx` — Dashboard layout

### External
- `https://github.com/safyodorov/ai-cs-zoiten` — Support bot project

### Project Specs
- `.planning/REQUIREMENTS.md` — LAND-01..04, STUB-01..06, SUPP-01..02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- motion (framer-motion) already in package.json
- All shadcn/ui components available
- NavLinks with active state highlighting
- Sidebar with section filtering by role
- lib/section-labels.ts with Russian names

### Established Patterns
- RSC pages with requireSection()
- "use client" for interactive components (motion needs this)
- Dashboard layout with Sidebar + Header

### Integration Points
- Root page app/page.tsx — currently Next.js default, replace with landing
- app/(dashboard)/ — add 6 stub pages + support page
- Sidebar already has section mapping

</code_context>

<specifics>
## Specific Ideas

- motion package installed as "motion" (v12.x), import as `import { motion } from "motion/react"`
- Landing page is the ONLY public page (no auth). Everything else is behind login.
- Logo — use text "Zoiten" in a distinctive font or SVG if available

</specifics>

<deferred>
## Deferred Ideas

- Full ai-cs-zoiten integration (requires deployment of support bot)

</deferred>

---

*Phase: 05-ui-module-stubs*
*Context gathered: 2026-04-06*
