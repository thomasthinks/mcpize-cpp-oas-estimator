# cpp-oas-estimator — Canadian CPP & OAS Benefit Estimator

MCP server for [MCPize](https://mcpize.com). Estimates Canada Pension Plan (CPP) retirement benefits and Old Age Security (OAS) pensions using verified 2026 figures from canada.ca. Original code.

> ## ⚠️ ESTIMATES ONLY — NOT FINANCIAL ADVICE
>
> This server runs a **simplified model** of CPP and OAS. Your actual benefits are determined by **Service Canada from your official contribution record** (Statement of Contributions) — they will differ from these estimates. Nothing here is financial, tax, or retirement advice; talk to a licensed professional before making retirement decisions.
>
> Reference: https://www.canada.ca/en/services/benefits/publicpensions/cpp.html

## What it does

| Tool | Description |
|---|---|
| `estimate_cpp` | Estimate a monthly CPP retirement benefit from average annual pensionable earnings (capped at YMPE), contributory years, and claim age (60–70). Applies the general 17% low-earnings dropout, the CPP age adjustments (−0.6%/month before 65, +0.7%/month after 65), and a simplified post-2019 enhancement add-on. |
| `estimate_oas` | Estimate a monthly OAS pension from Canadian residency years after age 18 (0–40), an optional deferral of 0–60 months past 65, and the age band (65–74 / 75+). |
| `clawback_check` | Compute the OAS pension recovery tax (clawback) for a net world income: 15% of income above the 2026 threshold, capped at the full OAS pension. |

Every result returns structured JSON (`content` + `structuredContent`), includes the full `assumptions` list and a `formula_note`, and is labeled with `figures_year`.

## Verified figures (2026) and sources

All figures below were verified against official canada.ca sources on **2026-10-04**. They are encoded in `src/figures.ts` with inline source comments.

| Figure | 2026 value | Source |
|---|---|---|
| YMPE (Year's Maximum Pensionable Earnings) | $74,600 | [CRA — CPP contribution rates, maximums and exemptions](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html) |
| YAMPE (CPP2, Year's Additional Maximum Pensionable Earnings) | $85,000 | [CRA — Second additional CPP contribution rates and maximums](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/calculating-deductions/making-deductions/second-additional-cpp-contribution-rates-maximums.html) |
| Maximum CPP retirement pension at 65 (new benefits, Jan 2026) | $1,507.65/month | [ESDC quarterly card — "Maximum benefit amounts and related figures — CPP, 2026 and OAS, July to September 2026" (PDF)](https://www.canada.ca/content/dam/canada/employment-social-development/migration/documents/assets/portfolio/docs/en/statistics/quarterly_report/isp-card-jul-sep-2026-en.pdf), p.1 |
| Maximum OAS pension, ages 65–74 | $751.97/month (Jul–Sep 2026) | Same ESDC quarterly card, p.2 |
| Maximum OAS pension, ages 75+ | $827.17/month (Jul–Sep 2026) | Same ESDC quarterly card, p.2 (includes the permanent 10% increase from the month after age 75) |
| OAS recovery-tax (clawback) threshold | $95,323 net world income | Same ESDC quarterly card, footnote 7 (repayment range $95,323–$155,109 for 65–74; upper ceiling $161,088 for 75+) |
| OAS deferral bonus | +0.6% per month deferred, up to +36% at 60 months (age 70) | Same ESDC quarterly card, footnote 8 |
| CPP early reduction | −0.6% per month before 65 (max −36% at 60) | [canada.ca — When to start your retirement pension](https://www.canada.ca/en/services/benefits/publicpensions/cpp/when-start.html) |
| CPP late increase | +0.7% per month after 65 (max +42% at 70) | Same canada.ca page |
| CPP enhancement (phased in from 2019) | up to +33.33% on the base for fully-enhanced years | Modeled as a simplified add-on: `base × 33.33% × (enhanced_years_since_2019 / contributory_years)` |

**OAS quarter note:** the Oct–Dec 2026 rate card had not been published on 2026-10-04 (only projected figures ~$762.50 / ~$838.75 existed), so the server uses the officially published **Jul–Sep 2026** quarterly maximums and labels them as such (`figures_quarter`). OAS amounts are indexed quarterly and will change.

## Simplified-model assumptions (spelled out)

`estimate_cpp` computes:

```
monthly = 0.25 × (min(avg_earnings, YMPE)/12) × dropout_factor × age_factor
          + enhancement_estimate

dropout_factor = min(1, contributory_years / (0.83 × contributory_period))
contributory_period = retirement_age − 18
age_factor = 1 − 0.006 × (65 − age) × 12   (age < 65)
           = 1 + 0.007 × (age − 65) × 12   (age > 65)
enhancement_estimate = base_at_65 × 33.33% × (enhanced_years_since_2019 / contributory_years)
```

- **Avg earnings** are a single flat figure capped at YMPE; the real formula indexes each year's earnings to that year's YMPE.
- **General dropout (17%)**: up to 17% of the contributory period may be excluded; the average is computed over the remaining 83%. Child-rearing and disability dropouts are **not** modeled.
- **Enhanced years** default to contributions in 2019–2026 (8 years); the 2019–2023 phase-in of additional contribution rates is not modeled, so the enhancement estimate runs slightly high. Override with `enhanced_years_since_2019`.
- **Not modeled**: post-retirement benefits, the CPP2 second tier (earnings YMPE→YAMPE), indexing after claim, tax treatment.
- With maximum inputs (YMPE earnings, full contributory period, age 65) the model returns ≈ $1,642/month vs the published $1,507.65 maximum (within 10%; the overshoot is the un-phased enhancement — documented above).

`estimate_oas` computes `full_amount × (residency_years/40, capped at 1) × (1 + 0.006 × deferral_months)`.

`clawback_check` computes `min(15% × max(0, net_income − $95,323), full annual OAS)`; the actual recovery is assessed by CRA on your tax return.

## Limitations

- **Estimates only.** Actual benefits are determined by Service Canada from your official contribution record. See the disclaimer at the top.
- **Simplified model.** Year-by-year wage indexation, dropouts beyond the general 17%, CPP2, post-retirement benefits, and quarterly OAS indexation are not modeled (see assumptions above).
- **Figures go stale.** Amounts are verified 2026 figures; OAS is re-indexed quarterly and CPP annually. Update `src/figures.ts` yearly (or quarterly for OAS) from the sources linked above.
- **Freemium quota is in-memory.** Usage counters reset when the process restarts; the monthly counter is keyed on the UTC calendar month.
- **Canada only.** This models CPP/OAS, not QPP (Quebec).

## Pricing

| Plan | Price (USD/month) | Quota |
|---|---|---|
| Free | $0 | 5 estimates/month |
| Pro | $12 | Unlimited |

Per-call x402 billing is **disabled**. The free quota is enforced in code via the `FREE_MONTHLY_LIMIT` environment variable (default `5`); on exhaustion the tools return an `isError` result: `"Free quota exceeded (5 estimates/month). Subscribe to Pro for unlimited access."`

## Local development

```bash
npm ci
npm run build
node dist/index.js          # PORT=8080 by default
npm test                    # vitest unit tests (22 tests)
bash test-mcp.sh            # MCP protocol smoke test (server must be running)
```

`GET /health` → `{"status":"healthy"}`. The MCP endpoint is `POST /mcp`.

## Project structure

```
├── src/
│   ├── index.ts        # Express + MCP server, tool registration, quota
│   ├── tools.ts        # Pure tool functions (testable, no MCP dependency)
│   ├── schemas.ts      # Shared Zod input schemas (registration + tests)
│   ├── figures.ts      # Verified 2026 figures with source URLs
│   └── quota.ts        # In-memory monthly freemium quota
├── tests/
│   └── tools.test.ts   # Unit tests
├── test-mcp.sh         # MCP protocol smoke test
├── pricing.json        # Free/Pro plans, x402 disabled
├── seo.json            # Marketplace listing metadata
├── mcpize.yaml         # MCPize deployment manifest
└── Dockerfile          # Container build
```

## Deployment

```bash
mcpize deploy
mcpize publish
```

`mcpize.yaml` uses `startCommand.type: http` and `configSchema.source: code`; no secrets section — the server is fully keyless.

## License

MIT
