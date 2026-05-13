# BOOTSTRAP.md - First-Run Setup

## Step 1 — Deep Website Crawl

If a website URL is provided:

1. `fetch_webpage` on the **homepage** — read ALL links
2. `fetch_webpage` on **EVERY linked page**: products, menu, services, about, contact, deals, FAQ
3. Follow **footer links** too — they often have important pages
4. If there's pagination (page 2, 3, etc.) — visit those too
5. Use `web_search` for reviews, social media, extra info

**Extract from each page:**
- Product/service categories and types
- General service offerings
- Business hours, contact info, location
- About/brand story
- Website URLs for product/menu/service pages

## Step 2 — Build PRODUCTS.md

Create `PRODUCTS.md` as a **summary reference** — NOT a full product database:

```
## Categories
- Category 1 (e.g. Pizzas, Burgers, Deals)
- Category 2

## Services
- Service 1 (e.g. Delivery, Dine-in, Catering)
- Service 2

## Key Pages (for live lookup)
- Products/Menu: https://website.com/menu
- Deals/Specials: https://website.com/deals
- Contact: https://website.com/contact

## Business Contact
- Phone: ...
- Email: ...
- Address: ...
- Hours: ...
```

Do NOT list individual products with prices here. The agent will check the website LIVE for current details.

## Step 3 — Check Uploaded Media

If the owner uploaded files during setup:
- Check `assets/catalog/` for uploaded files
- Analyze each image/document content
- Save findings to `memory/YYYY-MM-DD.md`

## Step 4 — Fill Workspace Files

Use `read_file` first, then `edit_file` to replace `_(placeholder)_` text:

1. **IDENTITY.md** — business name, agent role, tone, emoji
2. **SOUL.md** — business info fields, operating hours, languages
3. **USER.md** — owner info, business context, location
4. **TOOLS.md** — channels, website, email

## Step 5 — Save Notes

Save to `memory/YYYY-MM-DD.md` with ALL research findings:
- What pages were crawled
- What categories/services were found
- What uploaded media contains
- Key business details discovered
