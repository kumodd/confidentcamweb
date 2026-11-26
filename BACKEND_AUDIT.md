# Backend & Architecture Audit — Confident Creator

**Audit Date:** November 26, 2026  
**Website:** `https://confidentcreator.app/` (Repository: `kumodd/confidentcamweb`, deployed via GitHub Pages with Fastly CDN)  
**Android Package:** `com.confidentcam.confident_cam` (`Confident Creator` on Google Play)  
**Supabase Project:** `ConfidentCam` (Reference ID: `govbpayonsbfwrfxzbgq`, Region: `ap-northeast-1` / Northeast Asia Tokyo)

> **Scope & Safety Note:** All Supabase inspections were performed read-only via the Supabase CLI (`supabase projects list`, `supabase functions list`, `supabase functions download`, `supabase migration list --linked`, `supabase db advisors --linked`, `supabase db query --linked`). No production rows were modified or deleted, no credentials or API keys were exposed, and no PII was extracted.

---

## 1. Executive Summary

Confident Creator operates across two client surfaces backed by a single Supabase project (`govbpayonsbfwrfxzbgq`):

1. **Public Website & Creator Web Portal** (this static HTML/CSS/JS repository hosted on GitHub Pages at `https://confidentcreator.app/`):
   - Public marketing landing page (`index.html`), legal pages (`privacy-policy.html`, `terms-of-service.html`), and internal admin panel (`admin/`).
   - Authenticated Web Portal (`login.html`, `dashboard.html`, `scripts.html`, `generator.html`, `teleprompter.html`) communicating directly with Supabase PostgREST, Realtime, Auth, and Edge Functions.
2. **Android Mobile Application** (`com.confidentcam.confident_cam`, currently v1.1.4 shown in Play Store screenshots; `app_version` remote config = `1.0.3`; Flutter app based on `prompt_templates` references to `.dart` services):
   - Guided onboarding, 3 pre-challenge warmups, 30-day camera confidence challenge, in-app lens teleprompter with camera recording (stored locally on-device), AI script generator, Creator's Guide chapters, and QR code pairing to the Web Portal.

### Key Architectural & Compliance Takeaways

- **Unverified / Outdated Claims on Website vs Backend & Play Store:** The existing `index.html` and Supabase `landing_content` / `landing_testimonials` tables display `"10k+ Creators Transformed"`, `"4.9/5 App Store Rating"`, `AggregateRating (4.9 / 10000)`, iOS availability, `https://confidentcreator.com` canonical URLs, and 3 unverified seed testimonials (`Sarah Jenkins`, `Marcus T.`, `Elena Rodriguez` with null social URLs). In reality, Google Play shows **10+ downloads**, **no public rating/reviews**, iOS (`app_store_url`) is empty/unreleased, and `auth.users` has **15 registered accounts**.
- **Privacy Policy & Google Play Data Safety Discrepancy (Critical):** Google Play currently declares **"No data collected"** and **"No data shared with third parties"**, and points to `https://kumodd.github.io/Web-Policy/privacy_policy.html` (branded `ConfidentCam`, `35-day challenge`, `support@confidentcam.app`). In reality, Supabase collects and stores personal profile details, authentication identifiers, scripts, challenge completion records, notification settings, and QR session metadata, and sends script-generation inputs to **OpenAI** (`api.openai.com/v1`).
- **Critical Backend Security Findings (Require Manual Remediation):**
  1. `public.content_scripts` has **RLS disabled** (`rls_enabled = false`) and contains a permissive `SELECT` policy (`qual = true`) and `INSERT` policy (`user_id IS NOT NULL`).
  2. `public.app_config` has a `Public read app_config` (`qual = true`) policy while storing `openai_api_key` in the table, exposing it to anonymous PostgREST reads via the public publishable key.
  3. Edge Function `qr-sync-user` (`save-script`) uses `SUPABASE_SERVICE_ROLE_KEY` without verifying any JWT or session token and trusts a client-supplied `user_id`.
  4. QR Web Portal authentication (`js/qr-auth.js`, `js/auth.js`) stores `userId` in `localStorage` (`cc_qr_auth`) instead of issuing a real Supabase Auth JWT session, and `public.web_sessions` allows public `SELECT` (`qual = true`).
  5. Only 4 foreign key constraints exist in `public`, so deleting an account via `delete_account` leaves orphaned records in `user_profiles`, `content_scripts`, `daily_completions`, `daily_scripts`, `ai_feedback`, `achievements`, `challenge_extensions`, `notification_settings`, and `premium_status`.

---

## 2. Supabase Project & CLI Audit

| Check | Result |
|---|---|
| Supabase CLI Version | `2.84.2` |
| Linked Project Ref | `govbpayonsbfwrfxzbgq` (`ConfidentCam`, Northeast Asia Tokyo) |
| Local `supabase/` directory in repo | None (frontend repo contains no migrations or function source) |
| `supabase migration list --linked` | Empty (`0` tracked CLI migrations; schema managed via SQL Editor/dashboard) |
| Storage Buckets (`storage.buckets`) | `0` buckets (`storage.objects` unused; zero server-side video/media uploads) |
| Database Views (`information_schema.views`) | `0` views in `public` |
| Database Triggers | `4` triggers (`on_auth_user_created`, `update_users_updated_at`, `trg_user_profiles_updated_at`, `update_user_progress_updated_at`) |
| Database Functions (`public`) | `4` functions (`handle_new_user`, `expire_old_web_sessions`, `update_user_profiles_updated_at`, `update_updated_at_column`) |
| Edge Functions (`supabase functions list`) | `4` active functions (`create-user`, `qr-sync-user`, `delete_account`, `generate-script`) |
| Edge Function Secrets (`supabase secrets list`) | `OPENAI_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` |

---

## 3. Database Schema, Relationships & Row Counts

All `23` tables live in the `public` schema (`relkind = 'r'`). Aggregate row counts reflect live production usage at audit time:

### 3.1 User Identity, Profile & Auth Tables

| Table | Purpose | Key Columns | RLS Enabled | Row Count |
|---|---|---|---|---|
| `auth.users` | Supabase Auth accounts | `id`, `email`, `phone`, `created_at`, `email_confirmed_at`, `phone_confirmed_at` | Managed by Supabase | 15 (`4` email, `11` phone, `1` google identity) |
| `public.users` | App user mirror synced on auth insert | `id` (FK -> `auth.users.id` ON DELETE CASCADE), `email`, `phone`, `display_name`, `created_at`, `updated_at` | Yes | 15 |
| `public.user_profiles` | Onboarding & personalization data | `user_id`, `first_name`, `age`, `location`, `goal`, `custom_goal`, `goal_category`, `niche`, `fear`, `experience`, `timezone`, `onboarding_answers` (`jsonb`), `language_preference`, `created_at`, `updated_at` | Yes | 13 |
| `public.admin_users` | Admin dashboard allowlist | `user_id` (FK -> `auth.users.id` ON DELETE CASCADE), `email`, `role`, `created_at` | Yes | 1 |
| `public.web_sessions` | QR-code web portal pairing sessions | `id`, `session_token`, `user_id` (FK -> `users.id` ON DELETE CASCADE), `status`, `device_info` (`jsonb`), `created_at`, `expires_at`, `authenticated_at` | Yes | 172 |

### 3.2 Training Progress, Scripts & Content Creation Tables

| Table | Purpose | Key Columns | RLS Enabled | Row Count |
|---|---|---|---|---|
| `public.user_progress` | Challenge day, warmups, and streak tracking | `user_id` (FK -> `users.id` ON DELETE CASCADE), `current_day`, `total_days_completed`, `streak_count`, `longest_streak`, `last_completion_date`, `warmup_0_done`, `warmup_1_done`, `warmup_2_done`, `challenge_started_at`, `created_at`, `updated_at` | Yes | 15 (max `current_day = 2`, max `total_days_completed = 0`) |
| `public.daily_scripts` | Personalized daily challenge scripts | `id`, `user_id`, `day_number`, `script_type` (`segmented` days 1–5, `full` days 6–7), `script_json` (`jsonb`), `created_at` | Yes | 70 (`day_number` 1–7) |
| `public.daily_completions` | Completed daily video practice metadata | `id`, `user_id`, `day_number`, `video_filename`, `duration_seconds`, `checklist_responses` (`ARRAY`), `completed_at` | Yes | 5 |
| `public.content_scripts` | Creator Studio / Web Portal scripts (Hook/Body/Close) | `id`, `user_id` (`text`), `title`, `part1`, `part2`, `part3`, `prompt_template`, `questionnaire` (`jsonb`), `is_recorded`, `created_at`, `updated_at` | **No (`false`)** | 35 |
| `public.ai_feedback` | AI speech/video feedback JSON (behind disabled flag) | `id`, `user_id`, `day_number`, `feedback_json` (`jsonb`), `created_at` | Yes | 0 |
| `public.achievements` | Unlocked achievement milestones | `id`, `user_id`, `achievement_key`, `unlocked_at` | Yes | 0 |
| `public.challenge_extensions` | Post-30-day extension packs (15 days/pack) | `id`, `user_id`, `extension_number`, `start_day`, `end_day`, `scripts` (`jsonb`), `created_at` | Yes | 0 |
| `public.notification_settings` | Reminder schedule preferences | `user_id`, `daily_reminder`, `reminder_time`, `streak_alerts`, `weekly_summary` | Yes | 0 |
| `public.premium_status` | Subscription / IAP status (RevenueCat receipts) | `user_id`, `is_premium`, `subscription_type`, `expires_at`, `purchased_at`, `receipt_data` | Yes | 0 |

### 3.3 Public Reference, Remote Config & CMS Tables

| Table | Purpose | Key Columns | RLS Enabled | Row Count / Contents |
|---|---|---|---|---|
| `public.app_config` | Key-value remote config for mobile & Edge Functions | `key`, `value`, `value_type`, `category`, `description`, `is_active`, `updated_at` | Yes (Public `SELECT`) | 49 keys across `ai`, `app_info`, `auth`, `billing`, `cache`, `challenge`, `developer`, `network`, `splash`, `theme`, `video` |
| `public.feature_flags` | Feature toggles | `flag_key`, `is_enabled`, `description`, `updated_at` | Yes (Public `SELECT`) | 5 flags (`content_creator_enabled=true`, `extensions_enabled=true`, `qr_login_enabled=true`, `ai_feedback_enabled=false`, `maintenance_mode=false`) |
| `public.prompt_templates` | Versioned AI prompts used by Flutter app | `id`, `prompt_key`, `version`, `system_prompt`, `user_prompt_template`, `description`, `is_active` | Yes (Public `SELECT`) | 7 templates (`content_generation`, `extension_script`, `full_30day_script`, `system_content_creator`, `system_scriptwriter`, `warmup_script`, `weekly_script`) |
| `public.guides` | Creator's Guide chapters in mobile app | `id`, `guide_key`, `order_index`, `title`, `emoji`, `summary`, `content` (`ARRAY`), `youtube_url`, `youtube_title`, `action_route`, `action_title`, `is_active` | Yes (Public `SELECT`) | 4 chapters (`overcoming_fear`, `consistency`, `no_one_is_watching`, `social_media_tips`) |
| `public.goal_options` | Onboarding goal presets | `id`, `goal_text`, `goal_key`, `description`, `order_index`, `is_active` | Yes (Public `SELECT`) | 7 goals (10K IG followers, ₹1L/mo IG, ₹1L/mo editing, personal brand, YouTube, coaching, custom) |
| `public.language_options` | Supported script languages | `id`, `language_code`, `language_name`, `native_name`, `is_bilingual`, `primary_language`, `secondary_language`, `order_index`, `is_active` | Yes (Public `SELECT`) | 12 options (`en`, `hi`, `hinglish`, `ta`, `te`, `tanglish`, `mr`, `bn`, `gu`, `kn`, `ml`, `pa`) |
| `public.onboarding_questions` | Multi-step onboarding survey options | `id`, `question_key`, `question_text`, `options` (`jsonb`), `is_multi_select`, `order_index`, `is_active` | Yes (Public `SELECT`) | 4 questions (`challenges`, `content_style`, `platform`, `time_commitment`) |
| `public.landing_content` | Landing page JSON copy managed by `/admin` | `section_key`, `content` (`jsonb`), `updated_at` | Yes (Public `SELECT`) | 8 sections (`seo`, `hero`, `features_header`, `portal`, `testimonials_header`, `cta`, `footer`, `modal`) |
| `public.landing_features` | Landing page feature cards | `id`, `icon`, `title`, `description`, `sort_order`, `is_active`, `updated_at` | Yes (Public `SELECT`) | 3 cards |
| `public.landing_testimonials` | Landing page testimonials | `id`, `quote`, `stars`, `author_name`, `author_role`, `author_initial`, `is_verified`, `is_featured`, `is_active`, social URLs | Yes (Public `SELECT`) | 3 placeholder entries (`Sarah Jenkins`, `Marcus T.`, `Elena Rodriguez`) |

---

## 4. Database Functions, Triggers & Indexes

### 4.1 Triggers & PL/pgSQL Functions
- `public.handle_new_user()` (`SECURITY DEFINER`, `SET search_path TO 'public'`): Attached `AFTER INSERT ON auth.users` (reported under `users` trigger lookup) to upsert `public.users` and initialize `public.user_progress`.
- `public.expire_old_web_sessions()` (`SECURITY DEFINER`, mutable `search_path`): Marks `web_sessions` older than `expires_at` (`now() + 5m`) as `'expired'`. Currently no trigger is attached, and `anon` / `authenticated` have `EXECUTE` privilege via PostgREST RPC.
- `public.update_updated_at_column()` & `public.update_user_profiles_updated_at()`: `BEFORE UPDATE` triggers keeping `updated_at` fresh on `users`, `user_progress`, and `user_profiles`.

### 4.2 Indexes
- Primary key unique indexes on all 23 tables.
- Composite unique constraints: `(user_id, achievement_key)` on `achievements`, `(user_id, day_number)` on `ai_feedback`, `daily_completions`, and `daily_scripts`, `(user_id, extension_number)` on `challenge_extensions`, plus unique index on `guides.guide_key`, `goal_options.goal_key`, and `web_sessions.session_token`.
- Lookup indexes: `idx_content_scripts_user`, `idx_daily_completions_user_day`, `idx_daily_scripts_user_day`, `idx_achievements_user`, `idx_challenge_extensions_user`, `idx_language_options_active`, `idx_web_sessions_status`, `idx_web_sessions_user`, `idx_app_config_category`.

---

## 5. Edge Functions Audit

| Function Slug | Version | Auth Enforcement | External Services | Role & Findings |
|---|---|---|---|---|
| `create-user` | v5 | Verifies Bearer JWT via `supabaseAdmin.auth.getUser(token)` | None | Creates `public.users` + `public.user_progress` rows idempotently using `SUPABASE_SERVICE_ROLE_KEY`. |
| `delete_account` | v6 | Verifies Bearer JWT via `supabaseAdmin.auth.getUser(token)` | None | Deletes from `user_progress`, `users`, then calls `auth.admin.deleteUser(user.id)`. **Gap:** Because `content_scripts`, `user_profiles`, `daily_completions`, `daily_scripts`, `ai_feedback`, `achievements`, `challenge_extensions`, `notification_settings`, and `premium_status` lack `ON DELETE CASCADE` foreign keys, rows in those 9 tables remain orphaned after account deletion. |
| `generate-script` | v8 | Checks presence of `Authorization` header (does **not** validate JWT via `auth.getUser()`, allowing the `anon` key alone to pass the header check!) | `https://api.openai.com/v1/chat/completions` (`gpt-4o-mini`) | Reads OpenAI key from `public.app_config` (`key = 'openai_api_key'`) with `OPENAI_API_KEY` env fallback. Generates `title`, `part1` (Hook), `part2` (Body), `part3` (Close) JSON. **Finding:** CORS defaults to `*`, and `Authorization` header is not verified as an authenticated user JWT. |
| `qr-sync-user` (Name: `save-script`) | v8 | **None** (no JWT verification) | None | Accepts `{ user_id, title, part1, part2, part3, ... }` and inserts into `content_scripts` with `SUPABASE_SERVICE_ROLE_KEY`. Any caller who knows or guesses a `user_id` can insert scripts into that user's account. |

---

## 6. Security & RLS Audit (`supabase db advisors`)

`supabase db advisors --linked --level info` surfaced the following security and performance findings:

### 6.1 Critical (`ERROR` / High-Severity) Security Findings
1. **RLS Disabled on `public.content_scripts` (`0013_rls_disabled_in_public` & `0007_policy_exists_rls_disabled`):**
   - `relrowsecurity` is `false` even though 5 RLS policies exist. Any client using the public `anon` key can read, insert, update, or delete **any user's scripts** via PostgREST.
   - Furthermore, the existing dormant policies include `Users can read own scripts` with `qual = true` and `Anyone can insert scripts` with `with_check = (user_id IS NOT NULL)` — so simply enabling RLS without dropping those permissive policies would still leave reads/inserts wide open!
2. **Sensitive Secret Exposed in Publicly Readable `public.app_config`:**
   - Policy `Public read app_config` has `qual = true` for `{public}`.
   - Row `key = 'openai_api_key'` resides inside `public.app_config` and is `is_active = true`, exposing the OpenAI API key to unauthenticated PostgREST reads via the public publishable key. *(No key values were read or logged during this audit.)*
3. **Unauthenticated QR Login Spoofing & Session Exposure:**
   - `web_sessions` has `Allow reading sessions by token` (`qual = true` for `anon, authenticated`) and `Allow authenticated users to update pending sessions` (`qual = (status = 'pending')`, without checking `user_id = auth.uid()`).
   - `js/qr-auth.js` writes `cc_qr_auth` into `localStorage` containing `{ userId, email, displayName }` and runs all `content_scripts` queries as an unauthenticated `anon` client without a Supabase Auth JWT.
4. **Unverified Caller in `generate-script` and `qr-sync-user` Edge Functions:**
   - `generate-script` checks `req.headers.get('Authorization')` truthiness rather than verifying a valid user session JWT (meaning an anonymous caller passing the public anon key can invoke OpenAI completions at the project's expense).
   - `qr-sync-user` validates neither JWT nor QR session token.

### 6.2 Warnings & Performance Findings (`WARN` / `INFO`)
- **Leaked Password Protection Disabled** (`auth_leaked_password_protection`).
- **Mutable `search_path`** on `expire_old_web_sessions`, `update_user_profiles_updated_at`, `update_updated_at_column`.
- **`SECURITY DEFINER` RPCs executable by `anon`/`authenticated`** (`handle_new_user`, `expire_old_web_sessions`).
- **`auth_rls_initplan` (25+ policies):** RLS policies call `auth.uid()` directly instead of `(select auth.uid())`.
- **`multiple_permissive_policies`:** Duplicate overlapping `SELECT`/`INSERT`/`UPDATE` policies on `users`, `user_progress`, `web_sessions`, `guides`, `landing_content`, `landing_features`, `landing_testimonials`, `content_scripts`.
- **Admin Dashboard Schema Mismatch (`admin/index.html` & `js/admin-dashboard.js`):** The admin UI expects `guides.markdown_body`, `guides.cover_emoji_bg`, and `guides.estimated_read_min`, which do **not** exist in `public.guides` (`id, guide_key, order_index, title, emoji, summary, content, youtube_url, youtube_title, action_route, action_title, is_active, created_at`).

---

## 7. Feature Verification Matrix (Frontend + Mobile + Backend)

| Feature | Status | Evidence & Notes |
|---|---|---|
| **30-Day Camera Confidence Challenge** | Implemented (with config mismatch) | Play Store screenshots show 30-day grid; `daily_scripts` has days 1–7 (`70` rows) and `user_progress` tracks `current_day` / `streak_count`. **Warning:** `app_config.total_days` is currently set to `3` (likely test/dev setting) and `privacy-policy.html` / `terms-of-service.html` inaccurately mention `35-day`. |
| **Pre-Challenge Warmups** | Implemented | Play Store screenshots show 3 guided 60-second warmups (e.g., Deep Breathing, Genuine Smile); `user_progress` tracks `warmup_0_done`, `warmup_1_done`, `warmup_2_done`. (`app_config.total_warmups` is currently `1`.) |
| **Smart Lens Teleprompter (Mobile)** | Implemented | Play Store screenshots confirm lens-aligned teleprompter overlay with scroll speed (`0.5x–3.0x`), display height, background opacity, font size, text color, and front/back camera selection. |
| **Web Portal Teleprompter** | Implemented | `teleprompter.html` + `js/teleprompter.js` supports Auto-Scroll, **Voice Sync** (Web Speech API word-matching + Web Audio Mic VAD fallback for Brave/Firefox), Mirror Mode (`M`), Countdown (`0/3/5/10s`), Eye-Line position (`20–60%`), Font family/size/width/colors, Jump to Hook/Body/Close (`1/2/3`), Screen Wake Lock, Fullscreen (`F`), and Mark as Recorded. |
| **AI Script Generator** | Implemented | `generator.html` + Edge Function `generate-script` (`gpt-4o-mini`) supports 6 templates (`educational`, `story`, `tips`, `review`, `dayinlife`, `custom`), 4 tones, 3 lengths, Markdown toggle, 12 languages (including Hinglish & Tanglish), plus "Write Your Own" unified editor. |
| **Desktop-to-Mobile Cloud Sync & QR Login** | Implemented | `content_scripts` syncs via Supabase Realtime (`js/realtime.js`); `web_sessions` powers QR pairing (`js/qr-auth.js`). |
| **Creator's Guide** | Implemented | 4 chapters in `public.guides` (`Overcoming Fear`, `Consistency > Perfection`, `No One Is Watching`, `Social Media Tips`) with links to external educational YouTube videos. |
| **Local On-Device Video Recording** | Implemented | `0` Supabase Storage buckets exist; Play Store settings screenshot confirms local storage tracking (`Clear All Videos`). Videos are not uploaded to Supabase. |
| **Email & Google Sign-In (Web Portal)** | Partially Disabled / Broken Links | Backend supports Email, Phone, and Google (`auth.identities`), and `app_config` has `enable_email_auth=true`, `enable_google_auth=true`. Web Portal `js/config.js` sets `enableEmailLogin: false` (QR-only active), while `login.html` linked to non-existent `signup.html` and `js/auth.js` references non-existent `/reset-password.html`. |
| **AI Video/Speech Feedback** | Disabled / Planned | `ai_feedback` table has `0` rows and `feature_flags.ai_feedback_enabled` is `false`. Must NOT be advertised as live. |
| **Challenge Extensions (Post-30-Day)** | Backend Ready / Unused | `challenge_extensions` has `0` rows; `feature_flags.extensions_enabled=true` (`15` days/pack, max `4`). |
| **Subscriptions / Paid Tiers** | Backend Configured / Currently Free | `app_config` has RevenueCat identifiers (`premium` / `default`) and `premium_status` table exists (`0` rows). Play Store listing is currently free (`$0`). |
| **iOS Mobile App** | Unavailable / Planned | `app_config.app_store_url` is empty `""`; homepage iOS button is a "Coming Soon" modal. Must NOT be listed as available in JSON-LD `operatingSystem` or download CTAs. |
| **Web Analytics & Conversion Tracking** | Previously Missing | No analytics scripts (GA4, Plausible, PostHog, etc.) existed in the repository prior to this audit. |

---

## 8. Environment Variables & Configuration Audit

Static site configuration in `js/config.js` contains only:
- `SUPABASE_CONFIG.url`: `https://govbpayonsbfwrfxzbgq.supabase.co` (public project endpoint)
- `SUPABASE_CONFIG.anonKey`: Supabase publishable key (`sb_publishable_...`, intended for browser clients)
- `APP_CONFIG`: UI feature flags (`enableQRLogin: true`, `enableEmailLogin: false`, `howToUseVideoUrl: ''`)

Edge Functions reference environment secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, optional `ALLOWED_ORIGINS`) stored securely in Supabase Edge Function secrets, **except** for the critical misconfiguration where `openai_api_key` is also stored in `public.app_config`.

---

## 9. Recommended Manual Remediation Steps (For Backend Owner)

These changes modify production database/auth state and **were not executed automatically**:

1. **Immediately remove `openai_api_key` from `public.app_config`** (rotate the key in OpenAI first, rely exclusively on the `OPENAI_API_KEY` Supabase Edge Function secret, and update the Flutter app to call `generate-script` instead of reading `app_config` directly).
2. **Enable RLS on `public.content_scripts` and clean up permissive policies:**
   ```sql
   ALTER TABLE public.content_scripts ENABLE ROW LEVEL SECURITY;
   DROP POLICY IF EXISTS "Users can read own scripts" ON public.content_scripts;
   DROP POLICY IF EXISTS "Anyone can insert scripts" ON public.content_scripts;
   ```
   *(Note: Ensure QR web login issues a real Supabase Auth custom/magic/OTP session token via an Edge Function before enforcing `(auth.uid())::text = user_id` on `content_scripts`, otherwise QR-logged-in web users will lose script access.)*
3. **Require valid JWT verification inside `generate-script` and `qr-sync-user`**, and restrict `ALLOWED_ORIGINS` to `https://confidentcreator.app`.
4. **Update `delete_account` Edge Function (or add cascading FKs)** so deleting a user also deletes rows in `user_profiles`, `content_scripts`, `daily_completions`, `daily_scripts`, `ai_feedback`, `achievements`, `challenge_extensions`, `notification_settings`, and `premium_status`.
5. **Verify remote config values in `public.app_config`:** Confirm whether `total_days = 3` and `total_warmups = 1` were left from testing and restore `30` and `3` if production users rely on them.
6. **Clean up stale CMS content in Supabase (`/admin` -> Landing Page):** Replace `confidentcreator.com`, `"4.9/5"`, `"10k+"`, and unverified seed testimonials in `landing_content` and `landing_testimonials` with verified copy matching `https://confidentcreator.app/`.
7. **Enable Leaked Password Protection** in Supabase Auth settings and set `SET search_path = public` on `expire_old_web_sessions`, `update_user_profiles_updated_at`, and `update_updated_at_column`.
8. **Update Google Play Console Data Safety & Privacy Policy URL:** Change the Play Console privacy policy link from `https://kumodd.github.io/Web-Policy/privacy_policy.html` to `https://confidentcreator.app/privacy-policy.html`, set the Store support website to `https://confidentcreator.app/`, and update Data Safety to disclose collected account/profile/app activity data and OpenAI script-generation data sharing.
