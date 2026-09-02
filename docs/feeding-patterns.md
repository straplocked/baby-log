# Feeding & sleep patterns, birth to 3 years

Reference for the age-aware pieces of Baby Log — the `WAKE_NORMS` / `FEED_NORMS` tables in [src/App.jsx](../src/App.jsx) are distilled from this document. All numbers are population-typical guidance from the cited sources, **not medical advice**, and the app must always phrase them as context ("typical at 7 wks"), never as targets. Where sources disagree, both figures are given and flagged with ⚠.

Compiled 2026-09-02 from CDC, AAP/healthychildren.org, AASM, WIC/USDA, La Leche League, KellyMom, Nemours KidsHealth, Huckleberry, and Taking Cara Babies (full URLs at the bottom).

## 1. Feeding frequency, intervals, and volumes by age

| Age | Feeds / 24h (breastfed) | Feeds / 24h (formula) | Interval (breastfed) | Interval (formula) |
|---|---|---|---|---|
| 0–4 wks | 8–12+ | 8–12 first days, then 6–8 | 1–3 h (on demand) | 2–3 h first days, then 3–4 h |
| 1–3 mo | 7–9 | 6–8 | 2–4 h; occasional 4–5 h sleep stretch | 3–4 h |
| 3–6 mo | 6–8 | 5–6 | 2.5–4 h | 3–5 h |
| 6–9 mo | 4–6 milk feeds + solids | ~5–6 eating occasions (CDC) | 3–4 h | 3–5 h |
| 9–12 mo | 3–5 milk feeds + 3 meals | 3–4 bottles + 3 meals | 4–5 h between milk feeds | 4–6 h |
| 12–24 mo | nursing optional (WHO supports to 2 y+); milk becomes a beverage with meals | formula ends at 12 mo → whole cow's milk in a cup | 3 meals + 2–3 snacks, ~every 2–3 h awake | same |
| 2–3 y | 3 meals + 1–2 snacks (AAP); ~1,000–1,400 kcal/day at age 2 | — | every 2.5–3.5 h awake | — |

- Breastfed babies feed more often than formula-fed at every age in year one (breast milk digests faster). "Watch the baby, not the clock" is the consistent breastfeeding guidance (CDC, LLL).

### Bottle volumes (formula or expressed milk)

| Age | Oz per feed | Oz per day |
|---|---|---|
| First week | 1–2 | ~8–12 building up |
| 2–4 wks | 2–3 | 16–24 |
| 1 mo | 3–4 | up to ~32 max |
| 2 mo | 4–5 every 3–4 h | 24–32 |
| 4 mo | 4–6 | 24–32 |
| 6–12 mo (with solids) | 6–8 | 24–32, tapering as solids increase |

- AAP rule of thumb: ~2.5 oz formula per lb of body weight per day, capped ~32 oz/day.
- Exclusively breastfed intake is notably **flat: average ~25 oz/day (range 19–30) from 1 to 6 months** — intake does *not* rise with age in that window (KellyMom). Per-feed volume grows while frequency falls; totals stay level.

## 2. Cluster feeding & growth spurts

- Feeds bunch to **every 30–60 min for several hours**, overwhelmingly late afternoon/evening (~5 p.m.–midnight, the "witching hour") — WIC, Huckleberry. This is why the app folds feeds < 45 m apart into one session.
- Most intense the first ~3 weeks; common through the newborn period; generally slows after 2–3 months, returning briefly around growth spurts.
- Classic growth-spurt timing (LLL/WIC): **~2–3 wks, ~6 wks, ~3 mo, ~6 mo**, each lasting 2–3 days (up to a week). A short frequency spike at these ages is expected, not a supply problem.

## 3. Night feeds

| Age | Typical night feeds |
|---|---|
| 0–2 mo | 2–3+ (round-the-clock) |
| 3–4 mo | 1–3 ⚠ (AAP: most formula-fed babies need none by 2–4 mo; Huckleberry: many 4-mo-olds still need 2–3 — treat 0–3 as normal) |
| 4–6 mo | 1–2; a 5–6 h unfed stretch is typically manageable from ~5 mo |
| 6–9 mo | 0–1; average night-weaning age is 6–8 mo |
| 9–12 mo | 0 (some 1) |
| 12 mo+ | 0 — persistent night feeding is habit/comfort more often than nutrition |

⚠ Night-weaning a breastfed baby before ~12 mo can reduce supply; 25–50 % of babies over 6 mo still *wake* at night even when not fed.

## 4. Solids & transitions

- **Solids start ~6 months** (AAP/WHO/NHS aligned; never before 4 mo). Milk stays primary through 12 mo at 24–32 oz/day, tapering as solids ramp to 3 meals.
- **12 months:** formula → plain whole cow's milk (or fortified unsweetened soy) in a cup; wean off bottles by ~12–18 mo. Breastfeeding may continue as long as mutually desired.
- **Toddler milk cap: 16–24 oz/day.** More displaces food and drives iron deficiency, poor appetite, and constipation (AAP) — a genuinely useful future alert threshold.
- Toddler appetite is erratic — judge intake over a week, not a meal.

## 5. Wake windows, naps, and total sleep

Merged from Taking Cara Babies + Huckleberry (⚠ they differ at the newborn edge: TCB caps 0–4 wks at 60 m, Huckleberry allows 90 m — the app table uses the union, 30–90 m).

| Age | Wake window (app table) | Naps/day | Total sleep /24h |
|---|---|---|---|
| 0–4 wks | 30–90 m | 4–5+ irregular | ~15.5–17 h |
| 1–3 mo | 60–90 m | 4–5 | ~14.5–17 h |
| 3–4 mo | 75 m–2 h | 3–4 | ~14.5–15 h |
| 4–5 mo | 1.5–2.5 h | 3–4 | ~14.5 h |
| 5–7 mo | 2–3 h | 2–3 | ~14 h |
| 7–10 mo | 2.5–3.5 h | 2–3 | ~14 h |
| 10–14 mo | 3–4 h | 2 | 13–14 h |
| 14–24 mo | 4–6 h | 1–2 → 1 | ~12–13.25 h |
| 2–3 y | 5–6 h | 0–1 | ~11.5–12 h |

- Nap transitions (Huckleberry): 4→3 naps ~4–5 mo; 3→2 ~8–9 mo; 2→1 ~14–18 mo; nap dropping approaches at ~3 y.
- Official medical anchor (AASM, AAP-endorsed), total sleep incl. naps: 4–12 mo = 12–16 h; 1–2 y = 11–14 h; 3–5 y = 10–13 h. (No recommendation under 4 mo — normal variation is too wide.)

## 6. Trends & flags worth surfacing (softly)

**Expected trends — safe insight copy:**
- Interval lengthening is the norm: 2–3 h (newborn) → 3–4 h (1–3 mo) → 5–6 h night gaps by ~5 mo. "Every 3 hours" stops being the expectation once solids are established (~6–9 mo); by 9–12 mo milk anchors to meals.
- Rising per-feed oz with falling feed count is normal; a rising *total* well past 32 oz/day is worth a nudge.
- 2–3-day frequency spikes at ~2–3 wks / 6 wks / 3 mo / 6 mo = growth spurts, not regression.
- Evening cluster feeding in the first 8–12 weeks is normal.

**Broad "mention it to your pediatrician" flags (consumer app — never diagnose):**
- Newborn: < 8 feeds/24h, < ~6 wet diapers/day after day 5, birth weight not regained by ~2 wks.
- Any age: no wet diaper in 8 h (with fever/vomiting/diarrhea, sooner).
- Toddler: well over 24 oz milk/day (iron risk, appetite displacement).
- Sustained feeding refusal, or a sudden *sustained* drop in feed count outside growth-spurt windows; a newborn too sleepy to wake for feeds.

## Sources

- CDC — breastfeeding amounts: https://www.cdc.gov/infant-toddler-nutrition/breastfeeding/how-much-and-how-often.html
- CDC — formula amounts: https://www.cdc.gov/infant-toddler-nutrition/formula-feeding/how-much-and-how-often.html
- CDC — introducing solids: https://www.cdc.gov/infant-toddler-nutrition/foods-and-drinks/when-what-and-how-to-introduce-solid-foods.html
- AAP/HealthyChildren — formula schedule: https://www.healthychildren.org/English/ages-stages/baby/formula-feeding/Pages/amount-and-schedule-of-formula-feedings.aspx
- AAP/HealthyChildren — how often/how much: https://www.healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/how-often-and-how-much-should-your-baby-eat.aspx
- AAP/HealthyChildren — healthy sleep hours (AASM): https://www.healthychildren.org/English/healthy-living/sleep/Pages/healthy-sleep-habits-how-many-hours-does-your-child-need.aspx
- AAP/HealthyChildren — two-year-old menu: https://www.healthychildren.org/English/ages-stages/toddler/nutrition/Pages/Sample-One-Day-Menu-for-a-Two-Year-Old.aspx
- AASM — pediatric sleep consensus: https://aasm.org/resources/pdf/pediatricsleepdurationconsensus.pdf
- WIC/USDA — cluster feeding & growth spurts: https://wicbreastfeeding.fns.usda.gov/cluster-feeding-and-growth-spurts
- La Leche League — feeding frequency: https://llli.org/breastfeeding-info/frequency-feeding-frequently-asked-questions-faqs/
- La Leche League — is baby getting enough: https://llli.org/breastfeeding-info/is-baby-getting-enough/
- KellyMom — expressed milk intake: https://kellymom.com/bf/pumpingmoms/pumping/milkcalc/
- Huckleberry — first-year sleep: https://huckleberrycare.com/blog/first-year-of-sleep-expectations
- Huckleberry — sleep schedule by age: https://huckleberrycare.com/blog/baby-sleep-schedule-by-age-nap-and-sleep-chart
- Huckleberry — night weaning: https://huckleberrycare.com/blog/night-weaning-101-how-and-when-to-night-wean
- Huckleberry — cluster feeding: https://huckleberrycare.com/blog/cluster-feeding-schedule-newborn
- Huckleberry — toddler feeding: https://huckleberrycare.com/blog/toddler-feeding-schedule
- Taking Cara Babies — wake windows: https://www.takingcarababies.com/blogs/sleep-basics/wake-windows-and-baby-sleep
- Nemours KidsHealth — formula FAQs: https://kidshealth.org/en/parents/formulafeed-often.html
- Nemours KidsHealth — feeding 1–2 y: https://kidshealth.org/en/parents/feed12yr.html
- Nemours KidsHealth — poor weight gain: https://kidshealth.org/en/parents/failure-thrive.html
- Raising Children Network — night weaning: https://raisingchildren.net.au/babies/sleep/settling-routines/night-weaning
- Breastfeeding USA — diaper output: https://breastfeedingusa.org/diaper-output-and-milk-intake-in-the-early-weeks/
