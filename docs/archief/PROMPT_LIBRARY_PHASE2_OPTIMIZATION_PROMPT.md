# 🏛️ Nederlandse Overheid Prompt Library - Phase 2 Implementatie

## PROJECT OVERZICHT

**Doel:** Uitbreiden van Phase 1 MVP met geavanceerde features, alle optimalisatietechnieken, en admin-funcionaliteiten.

**Build upon:** Bestaande Phase 1 codebase (React + Vite + TypeScript + Supabase)

**Phase 2 Scope:** 
- 5 extra optimalisatietechnieken (totaal 9)
- Admin Panel voor beheer
- Geavanceerde zoeken/filteren
- Email share functionaliteit
- User analytics & dashboards

**Geschatte Timeline:** 4-5 weken

---

## TECHNISCHE STACK (Uitgebreid)

### Frontend (Aanvullingen)
- **Admin Dashboard UI:** Tabellencomponenten, modals
- **Email Integration:** React-email of template builder
- **Analytics:** Chart.js of Recharts voor visualisaties
- **Advanced Forms:** React Hook Form voor complexe admin forms

### Backend (Aanvullingen)
- **Supabase Functions:** Extra functions voor admin operations
- **Email Service:** SendGrid of Supabase Realtime voor notificaties
- **Analytics Tracking:** Event logging in database

### Database (Aanvullingen)
- **Nieuwe Tabellen:** analytics_events, email_shares, technique_templates
- **Aanpassingen:** Rollen + categorieën + technieken = mutable (admin panel)

---

## FASE 2 NIEUWE TECHNIEKEN (5 Extra)

### 5. MULTI-PERSONA PROMPTING
**Doel:** Prompt aanpassen voor meerdere stakeholders tegelijk

**Vervolgvragen:**
- Wie zijn de belanghebbenden? (bijv. projectleider, tester, manager)
- Wat zijn hun individuele belangen/prioriteiten?
- Hoe verschilt wat ze willen weten?

**Template (gegenereerd output):**
```
Je gaat deze tekst schrijven voor meerdere doelgroepen:

PERSONA 1 - [NAAM/ROL]:
- Belang: [BELANG 1]
- Wil weten: [INTERESSE 1]
- Prioriteit: [PRIORITEIT 1]

PERSONA 2 - [NAAM/ROL]:
- Belang: [BELANG 2]
- Wil weten: [INTERESSE 2]
- Prioriteit: [PRIORITEIT 2]

[MEER PERSONA'S...]

Gegeven deze verschillende perspectieven, beantwoord:
[ORIGINELE PROMPT]

Zorg dat elke persona hun waarde krijgt.
```

---

### 6. SOCRATIC PROMPTING
**Doel:** AI stelt vragen in plaats van antwoorden geven (Socratische methode)

**Vervolgvragen:**
- Wat zijn de kern-aannames in deze mail/document/input?
- Wat wil je eigenlijk ontdekken?

**Template (gegenereerd output):**
```
Haal en analyseer de aannames in deze tekst:

[ORIGINELE PROMPT]

Ga als volgt te werk:
1. Identificeer alle impliciete en expliciete aannames
2. Stel vragen die deze aannames in twijfel trekken
3. Onderzoek alternatieve perspectieven
4. Leid de gebruiker naar nieuwe inzichten via vragen

Stijl: Interview-achtig, Socratisch, stellingen ter discussie.
```

---

### 7. META PROMPTING
**Doel:** AI analyzeert en optimaliseert haar eigen prompting approach

**Vervolgvragen:**
- (Geen vervolgvragen - template analyzeert automatisch)

**Template (gegenereerd output):**
```
Je gaat je eigen prompting-benadering analyseren en verbeteren.

ORIGINELE PROMPT:
[ORIGINELE PROMPT]

Doe het volgende:
1. Analyseer: Wat werkt goed in deze prompt? Wat niet?
2. Identificeer: Welke aannames maak ik?
3. Optimaliseer: Hoe zou ik dit anders formuleren voor beter resultaat?
4. Reflecteer: Wat heb ik geleerd over prompting?

Geef een meta-analyse van je eigen aanpak.
```

---

### 8. CRISP (CONTEXT, RULES, Instructions, Specifics, Pattern)
**Doel:** Structured prompting met expliciete onderdelen

**Vervolgvragen:**
- Controleer: Is de CONTEXT duidelijk?
- Controleer: Zijn de RULES gespecificeerd?
- Controleer: Zijn de INSTRUCTIONS helder?
- Controleer: Zijn de SPECIFICS ingevuld?
- Controleer: Is het PATTERN duidelijk?

**Template (gegenereerd output):**
```
# CONTEXT:
[CONTEXT_HERE]

# RULES:
[RULES_HERE]

# INSTRUCTIONS:
[INSTRUCTIONS_HERE]

# SPECIFICS:
[SPECIFICS_HERE]

# PATTERN:
[PATTERN_HERE]

---

Gegeven bovenstaande structuur, antwoord op:
[ORIGINELE PROMPT]
```

---

### 9. CARE (CONTEXT, ASK, RULES, EXAMPLES)
**Doel:** Comprehensive prompting met voorbeelden

**Vervolgvragen:**
- Controleer: Is de CONTEXT compleet?
- Controleer: Is ASK (de vraag) duidelijk?
- Controleer: Zijn RULES gespecificeerd?
- Controleer: Zijn EXAMPLES gegeven?

**Template (gegenereerd output):**
```
# CONTEXT:
[CONTEXT_HERE]

# ASK:
[ASK_HERE]

# RULES:
[RULES_HERE]

# EXAMPLES:
[EXAMPLES_HERE]

---

Gegeven bovenstaande CARE-structuur, genereer:
[ORIGINELE PROMPT]
```

---

## DATABASE SCHEMA AANVULLINGEN

```sql
-- Analytics Events (tracking)
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,  -- 'prompt_created', 'search', 'optimization', 'share', etc.
  user_identifier TEXT,  -- user name (no auth in Phase 1/2)
  prompt_id UUID REFERENCES prompts(id),
  technique_id UUID REFERENCES techniques(id),
  metadata JSONB,  -- extra data (filter used, search query, etc.)
  created_at TIMESTAMP DEFAULT NOW()
);

-- Email Shares (tracking shared links)
CREATE TABLE email_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID REFERENCES prompts(id) ON DELETE CASCADE,
  share_token TEXT UNIQUE NOT NULL,  -- unique token for shareable link
  shared_by TEXT NOT NULL,
  shared_at TIMESTAMP DEFAULT NOW(),
  view_count INT DEFAULT 0,
  expires_at TIMESTAMP  -- optional expiration
);

-- Technique Templates (admin configurable)
CREATE TABLE technique_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technique_id UUID REFERENCES techniques(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  template_content TEXT NOT NULL,  -- the actual template
  follow_up_questions JSONB,
  version INT DEFAULT 1,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- Admin Audit Log
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT,
  action TEXT NOT NULL,  -- 'create_technique', 'update_category', etc.
  entity_type TEXT,  -- 'technique', 'category', 'role', etc.
  entity_id UUID,
  changes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indices
CREATE INDEX idx_analytics_user ON analytics_events(user_identifier);
CREATE INDEX idx_analytics_event ON analytics_events(event_type);
CREATE INDEX idx_shares_token ON email_shares(share_token);
CREATE INDEX idx_technique_templates_active ON technique_templates(is_active);
```

---

## FEATURE REQUIREMENTS - PHASE 2

### 1. ADMIN PANEL - DASHBOARD
**Wat te doen:**
- [ ] Admin login/authentication (optioneel, kan ook met token)
- [ ] Overview dashboard met:
  - Totaal prompts (count)
  - Totaal users (unique user_identifiers)
  - Meest gebruikte technieken (chart)
  - Meest gebruikte categorieën (chart)
  - Recent activity log
- [ ] Navigation naar admin sections

---

### 2. ADMIN PANEL - TECHNIEKEN BEHEER
**Wat te doen:**
- [ ] Tabel van alle 9 technieken
- [ ] Edit techniek: naam, beschrijving, vervolgvragen (JSON editor)
- [ ] Edit template: template content, syntax highlighting
- [ ] Create nieuwe techniek (future-proof)
- [ ] Delete techniek (soft delete?)
- [ ] Preview: hoe ziet de gegenereerde output eruit

**UI Elements:**
- Tabellen component (sorteerbaar, filterbaar)
- Modal voor edit
- JSON editor voor vervolgvragen
- Template editor met syntax highlighting

---

### 3. ADMIN PANEL - ROLLEN & CATEGORIEËN
**Wat te doen:**
- [ ] CRUD voor Rollen (Create, Read, Update, Delete)
- [ ] CRUD voor Categorieën
- [ ] Bulkimport (CSV upload)
- [ ] Drag-to-reorder (prioriteit)
- [ ] Audit log: wie heeft wat gewijzigd

---

### 4. EMAIL SHARE FUNCTIONALITEIT
**Workflow:**
1. Gebruiker klikt "Share via Email" op prompt
2. Generate unique share token (UUID)
3. Create shareable link: `yoursite.nl/share/[TOKEN]`
4. Show QR code + link
5. Optional: Email template om naar collega te sturen
6. Track views in analytics

**Backend:**
- [ ] Function: `generate-share-link`
- [ ] Function: `track-share-view`
- [ ] Endpoint: `GET /share/[TOKEN]` → show prompt read-only

**Frontend:**
- [ ] Share modal with link + QR code
- [ ] Copy-to-clipboard for link
- [ ] Optional: pre-filled email template

---

### 5. ALLE 9 TECHNIEKEN INTEGRATIEF
**Wat te doen:**
- [ ] Database populated met alle 9 technieken
- [ ] UI updated: 9 technique options (not just 4)
- [ ] Wszystkie vervolgvragen werken correct
- [ ] Alle templates correct geconfigureerd in Supabase Functions
- [ ] Testing: elke techniek test met voorbeeld-input

---

### 6. GEAVANCEERDE ZOEKEN
**Wat te doen:**
- [ ] Full-text search (titel + beschrijving + content)
- [ ] Filters gecombineerd:
  - Techniek (multi-select)
  - Categorie (multi-select)
  - Rol (multi-select)
  - Sharing level (multi-select)
  - Datum range (created_at)
  - Sorteer opties (relevance, newest, most shared)
- [ ] Saved searches (optioneel: slaat filter combinatie op)
- [ ] Search suggestions/autocomplete

**Backend:**
- [ ] Improve search query in Supabase (RLS, performance)
- [ ] Implement full-text search index

---

### 7. USER ANALYTICS
**Wat te doen:**
- [ ] Dashboard: "Your Activity"
  - Prompts created (count)
  - Optimizations run (count)
  - Most used technique
  - Shares received
- [ ] Trending page: populairste prompts, technieken, etc.
- [ ] Export analytics (CSV)

**Tracking:**
- [ ] Event logging in `analytics_events` table
- [ ] Track: prompt_created, optimization_run, share_clicked, etc.

---

### 8. IMPROVED UI/UX
**Wat te doen:**
- [ ] Responsive admin panel (mobile-friendly)
- [ ] Dark mode toggle (optional)
- [ ] Better loading states
- [ ] Error boundaries
- [ ] Toast notifications for actions
- [ ] Confirm dialogs for destructive actions (delete, etc.)

---

## API INTEGRATIE - Supabase Functions (Aanvullingen)

### Function: `generate-share-link`
**Input:**
```json
{
  "promptId": "uuid",
  "sharedBy": "string"
}
```

**Output:**
```json
{
  "shareToken": "uuid",
  "shareUrl": "https://yoursite.nl/share/[TOKEN]",
  "qrCode": "data:image/png;base64,..."
}
```

---

### Function: `admin-create-technique`
**Input:**
```json
{
  "name": "string",
  "description": "string",
  "followUpQuestions": [],
  "template": "string"
}
```

**Output:**
```json
{
  "technique_id": "uuid",
  "success": boolean
}
```

---

### Function: `analytics-track-event`
**Input:**
```json
{
  "eventType": "string",
  "userIdentifier": "string",
  "promptId": "uuid (optional)",
  "metadata": {}
}
```

**Output:**
```json
{
  "success": boolean
}
```

---

## FILE STRUCTURE AANVULLINGEN

```
src/
├── components/
│   ├── Admin/
│   │   ├── AdminDashboard.tsx
│   │   ├── AdminLayout.tsx
│   │   ├── TechniqueManager.tsx
│   │   ├── RoleManager.tsx
│   │   ├── CategoryManager.tsx
│   │   ├── AnalyticsDashboard.tsx
│   │   └── AuditLog.tsx
│   ├── Share/
│   │   ├── ShareModal.tsx
│   │   ├── QRCodeDisplay.tsx
│   │   └── SharePreview.tsx
│   ├── Analytics/
│   │   ├── UserActivityCard.tsx
│   │   ├── TrendingPrompts.tsx
│   │   └── Charts/ (various chart components)
│   └── ... (rest from Phase 1)
├── pages/
│   ├── AdminDashboard.tsx
│   ├── AdminTechniques.tsx
│   ├── AdminRoles.tsx
│   ├── AdminCategories.tsx
│   ├── SharePreview.tsx
│   ├── TrendingPage.tsx
│   └── ... (rest from Phase 1)
├── hooks/
│   ├── useAdmin.ts
│   ├── useAnalytics.ts
│   ├── useShare.ts
│   └── ... (rest from Phase 1)
├── services/
│   ├── adminService.ts
│   ├── shareService.ts
│   ├── analyticsService.ts
│   └── ... (rest from Phase 1)
├── utils/
│   ├── qrCodeGenerator.ts
│   ├── analyticsHelpers.ts
│   └── ... (rest from Phase 1)
└── ... (rest from Phase 1)
```

---

## IMPLEMENTATION ORDER - PHASE 2

### Week 1: Admin Panel Foundation
1. [ ] Admin authentication/access control
2. [ ] Admin layout + navigation
3. [ ] Admin dashboard (overview stats)
4. [ ] Technique manager (CRUD + template editor)

### Week 2: Admin Continued + 5 New Techniques
1. [ ] Role manager (CRUD)
2. [ ] Category manager (CRUD)
3. [ ] Database: populate all 9 techniques
4. [ ] Update optimizer: 9 techniques instead of 4
5. [ ] Test all 9 techniques

### Week 3: Share & Email
1. [ ] Share modal with QR code
2. [ ] Share link generation (Supabase Function)
3. [ ] Share preview page (`/share/[TOKEN]`)
4. [ ] Email share template (optional)
5. [ ] Track share views

### Week 4: Analytics
1. [ ] Analytics tracking (event logging)
2. [ ] User activity dashboard
3. [ ] Trending page
4. [ ] Admin analytics view
5. [ ] Export functionality

### Week 5: Polish & Testing
1. [ ] Advanced search/filtering
2. [ ] UI improvements
3. [ ] Mobile responsiveness (admin panel)
4. [ ] Performance optimization
5. [ ] Testing all features
6. [ ] Deployment preparation

---

## ACCEPTANCE CRITERIA - PHASE 2 COMPLETE

- ✅ Admin panel volledig functioneel
- ✅ Alle 9 optimalisatietechnieken werken
- ✅ Technieken kunnen in admin panel worden geconfigureerd
- ✅ Rollen en categorieën kunnen worden beheerd
- ✅ Email share links werken
- ✅ QR codes gegenereerd
- ✅ Share views tracked
- ✅ Analytics events logged
- ✅ User activity dashboard werkt
- ✅ Trending page toont populaire prompts
- ✅ Advanced search met multiple filters
- ✅ Audit log tracked admin actions
- ✅ Admin panel responsive + usable
- ✅ Performance: queries geoptimaliseerd
- ✅ Deployment: Phase 2 live

---

## AUTHENTICATION STRATEGY (FOR PHASE 2)

**Option 1: Token-based (Lighter)**
- Admin generert een token (eenmalig)
- Opgeslagen in `localStorage`
- Eenvoudig, geen 3rd-party auth nodig

**Option 2: Supabase Auth (Recommended)**
- Supabase Authentication (magic links of email+password)
- RLS policies in database
- Meer secure

**Recommendation:** Start met Token-based voor speed, upgrade to Supabase Auth later if needed.

---

## PERFORMANCE CONSIDERATIONS

- **Search:** Implement PostgreSQL full-text search (tsvector indexes)
- **Analytics:** Consider archiving old events (keep last 6 months)
- **Admin Panel:** Paginate large tables (100 rows per page)
- **Share Links:** Cache share previews (5 min TTL)

---

## SECURITY CONSIDERATIONS

- **Admin Access:** Verify token/credentials on every admin request (RLS)
- **Share Links:** Generate random tokens (UUID v4)
- **Audit Log:** Log all admin actions for compliance
- **Input Validation:** Sanitize all user inputs (templates, descriptions, etc.)
- **Rate Limiting:** Limit API calls per user/IP

---

## NOTES VOOR IMPLEMENTATIE

1. **Backwards Compatibility:** Phase 2 moet werken met Phase 1 data
2. **Data Migration:** Scripts om bestaande prompts te migreren (indien nodig)
3. **Feature Flags:** Optioneel: admin panel als toggle (rollout strategy)
4. **Testing:** Unit + integration tests voor admin functions
5. **Documentation:** Update docs voor admin panel usage

---

## LIBRARIES AANVULLINGEN

**Admin UI:**
- `react-table` (complex tables)
- `react-hook-form` (admin forms)
- `zod` (schema validation)

**Analytics:**
- `recharts` (charts/graphs)
- `qrcode.react` (QR code generation)

**Email:**
- `nodemailer` (server-side, optional)
- `react-email` (email templates)

**Utilities:**
- `date-fns` (date handling)
- `uuid` (token generation)

---

## DEPLOYMENT CONSIDERATIONS

### Frontend Updates
- [ ] New routes for admin panel
- [ ] Env var for admin token (if token-based)
- [ ] Build succeeds without errors

### Backend Updates
- [ ] New database tables created
- [ ] New Supabase Functions deployed
- [ ] Secrets set (if needed)
- [ ] Migrations run

### Testing
- [ ] Admin functions test
- [ ] Share links work
- [ ] Analytics tracking verified
- [ ] Email shares work
- [ ] All 9 techniques tested

---

## CONTACT & SUPPORT

Voor vragen over Phase 2 requirements, refér terug naar dit document.
Voor technische vragen during implementation, use claude.ai's Context.

**Phase 2: Let's make it powerful! 🚀**
