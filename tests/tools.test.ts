import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { estimateCpp, estimateOas, clawbackCheck } from "../src/tools.js";
import { consumeEstimate, quotaStatus, _resetUsage } from "../src/quota.js";
import {
  estimateCppInputSchema,
  estimateOasInputSchema,
  clawbackCheckInputSchema,
} from "../src/schemas.js";
import {
  CPP_MAX_MONTHLY_2026,
  YMPE_2026,
  OAS_MAX_MONTHLY_65_74_2026,
  OAS_MAX_MONTHLY_75_PLUS_2026,
  OAS_CLAWBACK_THRESHOLD_2026,
} from "../src/figures.js";

// ============================================================================
// estimate_cpp
// ============================================================================

describe("estimate_cpp", () => {
  it("lands within 10% of the published 2026 max CPP at 65 with max inputs", () => {
    // Expected: $1,507.65/month — ESDC quarterly card "Maximum benefit amounts
    // and related figures — CPP, 2026 and OAS, July to September 2026":
    // "Maximum amount of new CPP benefits, month of January 2026 —
    //  Retirement pension (at age 65): $1,507.65"
    expect(CPP_MAX_MONTHLY_2026).toBe(1507.65);

    const r = estimateCpp({
      avg_pensionable_earnings: YMPE_2026,
      contributory_years: 47, // full contributory period 18 -> 65
      retirement_age: 65,
    });
    expect(r.figures_year).toBe(2026);
    const pct = Math.abs(r.monthly_benefit - CPP_MAX_MONTHLY_2026) / CPP_MAX_MONTHLY_2026;
    expect(pct).toBeLessThan(0.1);
    // Document the actual estimate for the record:
    console.log(`max-input estimate: $${r.monthly_benefit}/mo vs published $${CPP_MAX_MONTHLY_2026}/mo (${(pct * 100).toFixed(2)}% off)`);
  });

  it("applies exact early/late actuarial factors: 0.64 at 60, 1.42 at 70", () => {
    const at60 = estimateCpp({
      avg_pensionable_earnings: YMPE_2026,
      contributory_years: 47,
      retirement_age: 60,
      enhanced_years_since_2019: 8,
    });
    const at70 = estimateCpp({
      avg_pensionable_earnings: YMPE_2026,
      contributory_years: 52,
      retirement_age: 70,
      enhanced_years_since_2019: 8,
    });
    // -0.6%/month x 60 months before 65 = -36% -> factor 0.64
    expect(at60.age_adjustment_factor).toBeCloseTo(0.64, 10);
    // +0.7%/month x 60 months after 65 = +42% -> factor 1.42
    expect(at70.age_adjustment_factor).toBeCloseTo(1.42, 10);
  });

  it("caps average earnings at YMPE", () => {
    const over = estimateCpp({
      avg_pensionable_earnings: 500_000,
      contributory_years: 47,
      retirement_age: 65,
    });
    const atMax = estimateCpp({
      avg_pensionable_earnings: YMPE_2026,
      contributory_years: 47,
      retirement_age: 65,
    });
    expect(over.monthly_benefit).toBe(atMax.monthly_benefit);
  });

  it("scales down for shorter careers (dropout credit)", () => {
    const short = estimateCpp({
      avg_pensionable_earnings: YMPE_2026,
      contributory_years: 20,
      retirement_age: 65,
    });
    const full = estimateCpp({
      avg_pensionable_earnings: YMPE_2026,
      contributory_years: 47,
      retirement_age: 65,
    });
    expect(short.monthly_benefit).toBeLessThan(full.monthly_benefit);
    expect(short.dropout_factor).toBeLessThan(1);
    expect(full.dropout_factor).toBe(1);
  });

  it("computes the enhancement estimate as base * 33.33% * enhanced-years fraction", () => {
    const r = estimateCpp({
      avg_pensionable_earnings: YMPE_2026,
      contributory_years: 47,
      retirement_age: 65,
      enhanced_years_since_2019: 8,
    });
    const expected = r.base_benefit_monthly * 0.3333 * (8 / 47);
    expect(r.enhancement_estimate).toBeCloseTo(expected, 2);
  });
});

// ============================================================================
// estimate_oas
// ============================================================================

describe("estimate_oas", () => {
  it("40 years, no deferral, 65-74 = full amount ($751.97)", () => {
    const r = estimateOas({ residency_years_18_65: 40, deferral_months: 0, age_band: "65-74" });
    expect(r.full_amount).toBe(OAS_MAX_MONTHLY_65_74_2026);
    expect(r.monthly_benefit).toBe(751.97);
    expect(r.residency_fraction).toBe(1);
    expect(r.deferral_bonus_pct).toBe(0);
  });

  it("75+ band = full 75+ amount ($827.17)", () => {
    const r = estimateOas({ residency_years_18_65: 40, deferral_months: 0, age_band: "75+" });
    expect(r.monthly_benefit).toBe(OAS_MAX_MONTHLY_75_PLUS_2026);
  });

  it("20 years = half the full amount", () => {
    const r = estimateOas({ residency_years_18_65: 20, deferral_months: 0, age_band: "65-74" });
    expect(r.residency_fraction).toBe(0.5);
    expect(r.monthly_benefit).toBeCloseTo(751.97 / 2, 2);
  });

  it("60 months deferral = +36% bonus", () => {
    const r = estimateOas({ residency_years_18_65: 40, deferral_months: 60, age_band: "65-74" });
    expect(r.deferral_bonus_pct).toBe(36);
    expect(r.monthly_benefit).toBeCloseTo(751.97 * 1.36, 2);
  });

  it("36 months deferral = +21.6% bonus", () => {
    const r = estimateOas({ residency_years_18_65: 40, deferral_months: 36, age_band: "65-74" });
    expect(r.deferral_bonus_pct).toBeCloseTo(21.6, 10);
    expect(r.monthly_benefit).toBeCloseTo(751.97 * 1.216, 2);
  });
});

// ============================================================================
// clawback_check
// ============================================================================

describe("clawback_check", () => {
  it("income below threshold = zero clawback", () => {
    const r = clawbackCheck({ net_income: OAS_CLAWBACK_THRESHOLD_2026 - 1 });
    expect(r.threshold).toBe(95323);
    expect(r.excess).toBe(0);
    expect(r.annual_clawback).toBe(0);
    expect(r.monthly_reduction).toBe(0);
  });

  it("income above threshold = 15% of excess", () => {
    const r = clawbackCheck({ net_income: 100_323 }); // excess = 5,000
    expect(r.excess).toBe(5000);
    expect(r.annual_clawback).toBe(750);
    expect(r.monthly_reduction).toBe(62.5);
  });

  it("caps the clawback at the full OAS pension", () => {
    const r = clawbackCheck({ net_income: 5_000_000 });
    const fullAnnual = Math.round(OAS_MAX_MONTHLY_65_74_2026 * 12 * 100) / 100;
    expect(r.annual_clawback).toBe(fullAnnual);
  });
});

// ============================================================================
// Input validation (Zod — same schemas registered on the MCP tools)
// ============================================================================

describe("input validation", () => {
  const cpp = z.object(estimateCppInputSchema);
  const oas = z.object(estimateOasInputSchema);
  const claw = z.object(clawbackCheckInputSchema);

  it("rejects retirement_age 59 (below minimum 60)", () => {
    const r = cpp.safeParse({ contributory_years: 40, retirement_age: 59 });
    expect(r.success).toBe(false);
  });

  it("rejects deferral_months 61 (above maximum 60)", () => {
    const r = oas.safeParse({ residency_years_18_65: 40, deferral_months: 61 });
    expect(r.success).toBe(false);
  });

  it("rejects residency_years 41 (above maximum 40)", () => {
    const r = oas.safeParse({ residency_years_18_65: 41 });
    expect(r.success).toBe(false);
  });

  it("rejects negative net_income", () => {
    const r = claw.safeParse({ net_income: -100 });
    expect(r.success).toBe(false);
  });

  it("rejects non-integer retirement_age", () => {
    const r = cpp.safeParse({ contributory_years: 40, retirement_age: 64.5 });
    expect(r.success).toBe(false);
  });

  it("accepts defaults (empty-ish valid input)", () => {
    const r = cpp.safeParse({ contributory_years: 40 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.retirement_age).toBe(65);
  });
});

// ============================================================================
// Freemium quota
// ============================================================================

describe("freemium quota", () => {
  beforeEach(() => {
    _resetUsage();
    delete process.env.FREE_MONTHLY_LIMIT;
  });

  it("allows the first 5 estimates per month, denies the 6th", () => {
    for (let i = 0; i < 5; i++) {
      expect(consumeEstimate().allowed).toBe(true);
    }
    const sixth = consumeEstimate();
    expect(sixth.allowed).toBe(false);
    expect(sixth.used).toBe(5);
    expect(sixth.limit).toBe(5);
  });

  it("respects the FREE_MONTHLY_LIMIT env var", () => {
    process.env.FREE_MONTHLY_LIMIT = "2";
    expect(consumeEstimate().allowed).toBe(true);
    expect(consumeEstimate().allowed).toBe(true);
    expect(consumeEstimate().allowed).toBe(false);
    expect(quotaStatus().limit).toBe(2);
  });

  it("resets usage on demand (month rollover semantics)", () => {
    consumeEstimate();
    _resetUsage();
    expect(quotaStatus().used).toBe(0);
  });
});
