# Project Plan: WhatsApp League Assistant

Expansion plan for turning pick-ems-bot from a personal, one-shot prediction
script into a hosted assistant league members can query over WhatsApp, with
better tooling for the commissioner.

Status: **planning** — Meta Business Account verification in progress
(Phase 0). Nothing below is built yet.

## Where this stands today

pick-ems-bot is a one-shot CLI (`npm start`) that scrapes ESPN for the
current week's matchups, team stats, recent form, odds, injuries, and news,
then asks an LLM (Gemini primary, OpenAI fallback) to predict a winner for
each game. It has no server, no database, and no concept of league members,
picks, or standings — it only ever predicts winners for hypothetical use by
whoever runs it.

Key building blocks worth knowing about before extending this:

- **Data Mapper repos** (`src/repos/{teams,matches,stats,articles,games,injuries}`) —
  each pairs a `Repo` (scrapes + caches) with an `Entity`. All scraping
  shares a single Playwright browser page (`src/utils/browser.ts`), so
  scraping is inherently sequential, not concurrent.
- **Prompt/Schema/Tool pattern** (`src/tools/predict_winner/`,
  `src/tools/news_analyst/`) — the shape any new LLM-backed feature (like a
  chat router) should follow.
- **LLM provider abstraction** (`src/utils/llm/providers/`) — Gemini
  primary, OpenAI fallback on any error, optional consensus mode. Both API
  keys live in GCP Secret Manager under project `yahoo-fantasy-football` —
  the same GCP project as the separate `Yahoo_FantasyFootball` repo/league
  pipeline (see that repo's `CLAUDE.md` for how the two relate).
- **Persistence today is flat JSON files** (`predictions/*.json`), hand-edited
  to record actual game outcomes for accuracy backtesting. Not viable once
  multiple processes (a scheduled scraper, a chat webhook) need to read/write
  at once.
- Minimal test setup (2 test files, realistic ~50–65% coverage gate), no CI.

## 1. WhatsApp integration feasibility

**Recommendation: Meta's WhatsApp Cloud API directly (developers.facebook.com), not Twilio.**

- Twilio adds a per-message markup on top of Meta's own rates with no
  offsetting benefit here, since this project is already building custom
  LLM routing rather than leaning on Twilio's no-code tooling.
- At friend-league volume, almost all traffic is members asking questions —
  those replies fall inside WhatsApp's free 24-hour "service conversation"
  window. The only messages that cost anything and require a
  pre-approved **template** are commissioner-_initiated_ pings (e.g. "picks
  lock in 2 hours"), which is a small, bounded feature, not the bulk of
  the traffic.
- **Meta Business verification is the real bottleneck** (days to weeks,
  outside your control) — hence starting it in Phase 0, before any code.
  A free test number lets development proceed in parallel: up to 5
  allow-listed recipient phone numbers, no verification required.
- A round-trip requires: a public HTTPS webhook that (a) answers Meta's
  `GET` verification challenge, (b) validates `X-Hub-Signature-256` on
  inbound `POST`s, and (c) sends replies via a `POST` to
  `graph.facebook.com/v{version}/{phone-number-id}/messages`. The three
  secrets involved (access token, verify token, app secret) slot directly
  into the existing `secrets.ts` pattern, the same way Gemini/OpenAI keys
  already do.
- **Your personal WhatsApp number must never be registered with the Cloud
  API** — that would convert it into an API-only business number and break
  normal app access for everyone who messages you personally. Use the free
  Meta test number for development, and a separate dedicated number (e.g. a
  free Google Voice number) for production.

_Caveat: exact WhatsApp pricing/fine print shifts over time and wasn't
independently verified beyond general research — treat "near-free at this
volume" as directionally right, and sanity-check actual billing after the
first few weeks live._

## 2. The missing piece: league standings / pick tracking

This is the single biggest open question in the whole plan. There is
currently no data model anywhere in this codebase for "who's in the
league," "what did each member pick," or "what's the standings" — the bot
has never touched that side of ESPN's Pick'em product.

**Unresolved, and blocking Phase 2:** does ESPN's Pick'em group
leaderboard require an authenticated session to view? ESPN's other fantasy
products gate similar personal/group data behind session cookies
(`SWID`/`espn_s2`), so this is a real possibility, not just a scraping
inconvenience.

**Action needed (Phase 0, in parallel with Meta verification):** log into
the real ESPN Pick'em group in a browser and check:

1. Does the leaderboard/groups page load without a login prompt?
2. Does the browser's network tab show an underlying JSON API call
   powering it (much more robust to hit directly than scraping rendered
   DOM), or is it purely server-rendered HTML?

The answer determines which of two very different paths Phase 2 takes:

- **If scrapable** (with or without a login): build a `LeagueRepo` /
  `StandingsRepo` following the existing Data Mapper pattern, authenticated
  via a persisted Playwright `storageState` seeded with the owner's session
  cookies (these are long-lived but rotate on password change, so this
  needs occasional manual refresh).
- **If not reliably scrapable**: the bot becomes its own source of truth —
  members text their picks to the bot directly, and standings are computed
  from the bot's own data instead of ESPN's. **This is a real product
  decision, not a technical fallback** — it changes whether the bot
  reflects ESPN's official standings or replaces them. Worth deciding
  deliberately once the spike above answers the technical question, not
  assumed in advance.

## 3. Full feature set

### League-member-facing (via WhatsApp)

Already buildable from existing code, once exposed conversationally
instead of via console/JSON:

- This week's matchups and predictions (`predict_winner`, as-is)
- Team stat / injury lookups (`TeamStatsRepo`, `InjuryRepo`, as-is)
- Recent team news (`ArticleRepo` / `newsAnalyst`, as-is)
- "Why'd you pick that team" — **not fully available today**: both LLM
  providers currently discard their chain-of-thought reasoning and keep
  only the final answer. Small, concrete change needed to persist or
  re-derive it.

Genuinely new, and dependent on Section 2's outcome:

- "Who's leading the league," "what did [member] pick," past-week results
- Auto-scoring past results from ESPN's final scores (replacing the
  current manual JSON edit) — a smaller, independent win, since final
  scores are public regardless of how the standings question resolves.

### Commissioner-facing

Confirmed wants (from your own framing of the request):

- A log of what members are asking the bot
- Some visibility into engagement (message volume, active members)

Reasonable but unconfirmed ideas, flagged as assumptions rather than
committed scope:

- Reminders to members who haven't picked before lock (needs Section 2's
  data, plus a pre-approved WhatsApp template since it's
  commissioner-initiated)
- Dispute resolution via stats lookup ("did the Chiefs really cover")
- Explicitly **not** assumed: dues/payment tracking, prize management —
  nothing in the request suggests this is a real pain point.

## 4. Architecture implications

- **Scrape-on-demand can't serve chat.** A full run takes minutes today.
  Data collection needs to move to a **scheduled batch job** (Cloud
  Scheduler → Cloud Run job) writing to persistent storage; the chat
  webhook only ever reads from that store, never drives Playwright
  directly.
- **The single shared Playwright page is a hard constraint**, not a
  nice-to-have: the scheduled scrape job and the live webhook must be two
  separate deployables that never run concurrently.
- **Flat JSON files stop being viable** once a scheduled scraper, a chat
  webhook, and a chat log all need to read/write around the same time.
  **Firestore** is the pragmatic choice given the existing GCP project and
  small scale — serverless, pay-per-op, same auth pattern `secrets.ts`
  already uses.
- **The Prompt/Schema/Tool pattern extends naturally, but as a real
  variant**: today's `llm()` forces exactly one schema per call. Chat needs
  the model to _choose_ among several lookups based on free-form text —
  genuine multi-tool function-calling, which both providers already
  support at the API level, but which is new plumbing here, not a
  copy-paste of the existing tools.
- **Hosting**: both new pieces (webhook service, scheduled scrape job)
  belong in the existing `yahoo-fantasy-football` GCP project — the same
  project already running the Yahoo_FantasyFootball repo's ingestion
  pipeline (Cloud Functions, Cloud Scheduler, BigQuery) — Cloud
  Run for both (a service for the webhook, a job for scraping), Cloud
  Scheduler to trigger the job.
- **LLM cost/config for chat**: `CONSENSUS_MODE` and `PREDICTION_SAMPLES`
  exist to maximize quality for weekly batch predictions and multiply LLM
  calls accordingly — chat's tool-routing calls should default to a single
  fast/cheap provider with no ensembling, since interactive latency matters
  and batch-quality settings don't apply to "what's the Bengals' point
  differential."

## 5. Phased roadmap

**Phase 0 — de-risk (days, in progress)**

- ✅ Meta Business verification started
- ⬜ Manually check whether ESPN's group leaderboard is scrapable (see
  Section 2) — nothing in Phase 2 should start before this is answered

**Phase 1 — first genuinely useful milestone (biggest chunk of real engineering)**

- Cloud Run webhook: verification handshake, signature check, send/receive
  via the Graph API
- A `chat_router` tool answering everything the CLI already can: matchups,
  predictions, stats, injuries, news
- Move data collection from scrape-per-run to scrape-on-a-schedule into
  Firestore — expect this to be the larger half of Phase 1, not the
  WhatsApp plumbing itself
- Demoable on its own: any league member can WhatsApp the bot about this
  week's games, no standings needed yet

**Phase 2 — standings / pick tracking (gated on Phase 0's spike result)**

- Scrapable path: `LeagueRepo`/`StandingsRepo`, authenticated session,
  scheduled alongside the other scrapers
- Not scrapable path: bot-native pick submission + bot-computed standings
  (explicit product decision, not a fallback to slide past unnoticed)

**Phase 3 — commissioner tooling**

- Chat-question logging + engagement summary
- Reminders for members who haven't picked (needs Phase 2 + an approved
  WhatsApp template)
- Dispute-resolution lookups (cheap — reuses Phase 1's routing)

**Phase 4 — optional**

- A companion read-only web view of standings/predictions, parallel to
  WhatsApp, only if it earns its place — could be as light as a static
  page regenerated on the same schedule as the scrape job

## Ranked risks

1. Whether ESPN group standings/picks are actually and reliably scrapable —
   genuinely unknown until the Phase 0 spike
2. WhatsApp Business verification timeline — outside our control
3. The persistence/scheduling architecture change being a bigger lift than
   the WhatsApp integration itself (this is a shift from "script" to
   "service," not just a new endpoint)
4. The commissioner-vs-ESPN source-of-truth fork in Phase 2 — a product
   decision disguised as a technical one

## Critical files for implementation

- `src/utils/browser.ts` — the single shared Playwright page constraint
- `src/utils/llm/llm.ts` / `src/utils/llm/providers/types.ts` — provider
  abstraction to extend for multi-tool chat routing
- `src/utils/secrets.ts` — pattern for adding WhatsApp secrets
- `src/repos/matches/repo.ts` — reference for how a new `LeagueRepo` would
  be shaped
- `src/config.ts` — env-driven config, where new toggles belong
