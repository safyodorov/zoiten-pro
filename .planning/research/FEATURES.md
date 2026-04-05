# Feature Landscape

**Domain:** Marketplace Seller ERP — Product Catalog Management
**Project:** Zoiten ERP (zoiten.pro)
**Researched:** 2026-04-05
**Scope:** Product management module for internal team of 10+, selling on WB, Ozon, DM, YM

---

## Table Stakes

Features users expect in any internal product catalog tool. Missing = product feels broken or teams revert to spreadsheets.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Product list with pagination | The most basic view — can't work without seeing what you have | Low | Grid or table view, both are valid |
| Create / Edit / Delete product | Core CRUD. Absence makes the tool useless | Low | Delete = soft delete for safety |
| Product name field | Identifies the product internally | Low | 100 char limit per spec |
| Single product photo upload | Visual identification — critical for team to distinguish products | Medium | 3:4 ratio, JPEG/PNG, up to 2K resolution per spec |
| Marketplace article numbers (multi-value) | Teams constantly reference WB/Ozon nmID. Without this, the catalog has no connection to reality | Medium | Up to 10 per marketplace, per spec. WB nmID is mandatory first |
| Barcode storage (multi-value) | Barcodes link catalog to warehouse operations and fulfillment. 1-20 per product per spec | Low | Store-only at MVP, no barcode scanner needed |
| Physical dimensions: weight, W×H×D | Required for WB/Ozon FBO/FBS logistics cards. Calculated volume is expected | Low | Auto-compute volume from dimensions |
| Brand field | Multi-brand companies need this. Zoiten is default | Low | CRUD brands, one per product |
| Category / subcategory | Standard hierarchy. Users filter and report by category constantly | Medium | Per-brand configuration. Inline add is differentiating |
| Product availability status | Stock state drives decisions across all ERP modules (prices, purchase plan) | Low | 3 states: in stock / out of stock / discontinued |
| Text search / filter by status | With 50-200 products, search is immediate need; without it users scroll manually | Low | At minimum: filter by availability status |
| Copy product | Teams duplicate similar products frequently. Absent = manual re-entry | Low | Deep copy of all fields except photo |
| Soft delete with retention | Prevents accidental permanent loss. Standard in any tool managing business data | Medium | Mark as deleted, auto-purge after 30 days |
| RBAC: role-based access | Team of 10+ = different people need different permissions. Shared accounts = chaos | Medium | Superadmin creates users, assigns section access |
| Login / logout with session management | Auth is non-negotiable | Medium | Credentials provider. bcrypt passwords |
| Superadmin user management | Someone has to provision users. Superadmin-only CRUD on user accounts | Medium | Create user, set login/password, assign sections |

**Confidence:** HIGH — these are the irreducible minimum for any internal catalog tool used by a team.

---

## Differentiators

Features that create competitive advantage or meaningfully improve UX. Not expected by default, but valued by teams.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| ABC status on product | Maps Pareto principle to catalog. A-products get attention, C-products get reviewed. Drives purchasing and pricing focus | Low | Manual assignment (A/B/C). Future: auto-compute from sales data |
| Inline category / subcategory creation | Teams hate leaving context. "Add new category" inside the product form vs. going to settings | Low | shadcn Combobox with creatable option |
| Per-brand category taxonomy | Brands may have different category structures. Prevents cross-contamination | Low | Category tree scoped to brand |
| Multiple marketplace support | WB-only tools break the moment you add Ozon. Supporting up to 10 article slots per marketplace future-proofs growth | Medium | Extensible marketplace list: WB, Ozon, DM, YM + custom |
| Volume auto-calculation | Saves repetitive math. V = W×H×D — trivial to implement, but users appreciate it | Low | Computed field, read-only |
| Landing page with brand & navigation | For a team tool, a polished home page signals this is a real product not a prototype | Medium | Framer Motion animations, slogan, section nav |
| Placeholder tabs for future modules | Shows the roadmap, reduces "when is pricing coming?" questions | Low | Static tabs: pricing, stock, purchase plan, etc. |
| Animated UI (Framer Motion) | Reduces perceived load time, improves perceived quality. Not expected in internal tools — so it stands out | Medium | Page transitions, list animations |

**Confidence:** MEDIUM — based on common patterns in PIM tools and the specific context of this team.

---

## Anti-Features

Features to deliberately NOT build in the MVP milestone. Either too complex, out of scope, or actively harmful to initial momentum.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| WB / Ozon API sync | API integration with WB/Ozon requires OAuth, rate limit handling, error recovery, and schema mapping. High risk, not in MVP scope | Manual entry of article numbers. API sync is next milestone |
| Multiple product photos / gallery | Adds storage complexity, UI complexity, and photo ordering logic. One photo is enough for internal catalog at 50-200 SKUs | Single photo per product. Expand later if needed |
| Cloud / S3 image storage | Unnecessary complexity for 50-200 products. VPS filesystem is simpler, cheaper, and sufficient | Store photos on VPS filesystem at `/uploads/` |
| AI-powered catalog health scoring | Useful at 5,000+ SKUs. Overkill at 50-200 | Manual data entry discipline is sufficient at this scale |
| Barcode scanner / camera capture | Adds mobile-first complexity. Team works on desktop | Store barcodes as text input |
| Audit log / change history | Valuable for compliance at enterprise scale. Adds schema complexity (separate log table, UI for history) | Soft delete already covers the main safety concern. Add audit log in a future milestone |
| Product variants / SKU matrix | Marketplace products in RU often have separate nmIDs per variant, not a parent-child tree | Treat each nmID as a separate product for now |
| Bulk CSV import / export | Needed eventually, not for MVP. Adds schema validation, error handling complexity | Manual entry for initial 50-200 products. Bulk import = next milestone |
| Automated ABC classification | Requires sales data which doesn't exist yet. Manual ABC is correct for MVP | Manual A/B/C assignment on each product |
| Multi-brand permissions | Scoping user access by brand (user can see Zoiten but not OtherBrand) adds non-trivial RBAC complexity | All users with section access see all brands. Restrict by section, not by brand |
| Real-time collaboration / locking | Conflict resolution when two users edit the same product. Overkill for a 10-person team | Last-write-wins. Team coordinates informally |

**Confidence:** HIGH — these are deliberate scope decisions based on team size (50-200 SKUs), timeline, and explicit project out-of-scope markers.

---

## Feature Dependencies

```
Auth (login/session) → RBAC (user roles) → All protected sections

Brand CRUD → Category/Subcategory CRUD (categories are per-brand)
           → Product form (brand field pulls from brand list)

Marketplace list → Product form (article number fields are per-marketplace)

Category/Subcategory CRUD → Product form (category dropdown)

Product CRUD → Product photo upload (photo belongs to product)
             → Barcode management (barcodes belong to product)
             → Article numbers (articles belong to product)

Product dimensions → Auto-volume calculation (derived field)

Soft delete → Auto-purge job (30-day cleanup, background task)
```

---

## MVP Recommendation

The MVP is the Products module. Prioritize in this order:

**Must ship:**
1. Auth + RBAC (superadmin creates users, assigns section access)
2. Brand CRUD (unblocks categories and products)
3. Category/Subcategory CRUD per brand (unblocks product form)
4. Marketplace list management (unblocks article fields)
5. Product CRUD — full form: name, photo, articles, barcodes, dimensions, brand, category, ABC, availability
6. Product list with filter by availability status and text search
7. Copy product from list
8. Soft delete with 30-day auto-purge

**Ship as part of MVP (low complexity):**
9. Volume auto-calculation from dimensions
10. Landing page with navigation and Framer Motion animations
11. Placeholder tabs for future modules

**Defer explicitly:**
- WB/Ozon API integration (next milestone)
- Bulk import/export (next milestone)
- Audit log / change history (future milestone)
- Multiple photos per product (future milestone)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Photo upload | File size limits, aspect ratio enforcement, storage path collisions | Validate on server, store with UUID filename, serve via Next.js API route |
| RBAC section access | Over-engineering roles vs. keep it simple | Two role levels: superadmin (all) + user (assigned sections only). Don't build per-resource permissions in MVP |
| Category per brand | Orphaned categories if brand is deleted | Soft-delete brand, not hard-delete. Warn if categories exist |
| Marketplace articles | Up to 10 per marketplace, variable number of marketplaces | Store as JSON array or separate `marketplace_articles` table. Separate table is safer for querying |
| Barcodes | 1-20 per product, need uniqueness | Unique constraint on barcode value across all products |
| Soft delete cleanup | 30-day auto-purge needs a cron/background job | Next.js API route + cron (node-cron or Vercel cron). On VPS use system cron |
| Photo storage path | Files on VPS persist across deployments only if stored outside app directory | Store at `/var/zoiten/uploads/`, not inside `/opt/zoiten-pro/` |

---

## Sources

- [WB API — Product Cards (official)](https://dev.wildberries.ru/en/openapi/work-with-products) — barcode/nmID constraints
- [Ecommerce Catalog Management Guide 2026 — OdooPIM](https://odoopim.com/blog/ecommerce-catalog-management/) — catalog management patterns
- [PIM Features Overview 2025 — Micropole](https://www.micropole.com/en/enjeux/pim-definition-enjeux/) — table stakes identification
- [ABC Analysis for eCommerce — Sumtracker](https://www.sumtracker.com/blog/what-is-abc-analysis-in-inventory-management-and-how-it-helps-you-reorder-smarter) — ABC classification rationale
- [RBAC in ERP Systems — Procuzy](https://procuzy.com/blog/role-based-access-control-in-erp-systems/) — RBAC pattern for small teams
- [Ecommerce Image Standards — Squareshot](https://www.squareshot.com/post/e-commerce-image-standards-to-improve-sales-and-engagement) — photo format guidance
- [Marketplace Product Image Guidelines 2025 — Pixofix](https://www.pixofix.com/blog/marketplace-product-image-guidelines-ecommerce) — aspect ratio standards
- [SKU Best Practices — Linnworks](https://www.linnworks.com/blog/how-to-create-sku-numbers-for-your-inventory/) — SKU vs barcode distinction
- [Audit Trails in ERP — Yodaplus](https://yodaplus.com/blog/audit-trails-in-erp-how-to-design-them-right/) — audit log design guidance

**Overall Confidence:** HIGH for table stakes and anti-features (drawn from explicit spec + domain standards). MEDIUM for differentiators (inferred from team context and PIM ecosystem patterns).
