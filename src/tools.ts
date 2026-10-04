/**
 * Pure tool functions — retirement-benefit estimate math only, no MCP
 * dependency. All figures live in ./figures.js (verified 2026 values).
 *
 * MODEL NOTE (important): these are SIMPLIFIED models, not the exact Service
 * Canada formulas. The real CPP formula indexes each year's earnings to the
 * YMPE of that year, applies child-rearing/disability dropouts, and phases the
 * enhancement in year by year. The real OAS pension is indexed quarterly and
 * the clawback is assessed by CRA on your tax return. Results are estimates
 * only — see assumptions[] in each result and the README disclaimer.
 */
import {
  YMPE_2026,
  CPP_MAX_MONTHLY_2026,
  CPP_EARLY_REDUCTION_PER_MONTH,
  CPP_LATE_INCREASE_PER_MONTH,
  CPP_ENHANCEMENT_MAX_RATE,
  OAS_MAX_MONTHLY_65_74_2026,
  OAS_MAX_MONTHLY_75_PLUS_2026,
  OAS_FIGURES_QUARTER,
  OAS_CLAWBACK_THRESHOLD_2026,
  OAS_FULL_REPAYMENT_65_74_2026,
  OAS_FULL_REPAYMENT_75_PLUS_2026,
  OAS_DEFERRAL_PER_MONTH,
  OAS_CLAWBACK_RATE,
  FIGURES_YEAR,
} from "./figures.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================================
// estimate_cpp
// ============================================================================

export interface EstimateCppArgs {
  avg_pensionable_earnings?: number; // annual; default = YMPE
  contributory_years: number;
  retirement_age?: number; // 60-70; default 65
  enhanced_years_since_2019?: number; // optional override
}

export interface EstimateCppResult {
  [key: string]: unknown;
  monthly_benefit: number;
  annual_benefit: number;
  base_benefit_monthly: number;
  age_adjustment_factor: number;
  dropout_factor: number;
  enhancement_estimate: number;
  enhanced_years_used: number;
  inputs: {
    avg_pensionable_earnings: number;
    contributory_years: number;
    retirement_age: number;
    enhanced_years_since_2019: number;
  };
  assumptions: string[];
  formula_note: string;
  figures_year: number;
}

export function estimateCpp(args: EstimateCppArgs): EstimateCppResult {
  const retirement_age = args.retirement_age ?? 65;
  const avgEarnings = Math.min(args.avg_pensionable_earnings ?? YMPE_2026, YMPE_2026);

  // Contributory period runs from age 18 to the age CPP starts.
  const contributoryPeriod = Math.max(retirement_age - 18, 0);

  // Clamp contributory years to the period (cannot contribute more years than exist).
  const creditYears = Math.max(0, Math.min(args.contributory_years, contributoryPeriod));

  // General low-earnings dropout: up to 17% of the contributory period may be
  // excluded from the average. Simplified: the average is computed over the
  // remaining 83% of the period, so contributory years fill that denominator.
  // DEVIATION NOTE: a literal reading of "years / (years + 17% of years)"
  // reduces the estimate for full careers and can never equal 1; it also puts
  // the max-input estimate ~12% below the published 2026 maximum. The formula
  // below is the corrected, directionally-right version and is documented.
  const effectiveDenominator = 0.83 * contributoryPeriod;
  const dropout_factor =
    effectiveDenominator > 0 ? Math.min(1, creditYears / effectiveDenominator) : 1;

  // Base benefit at 65: 25% of average monthly capped earnings.
  const base65 = 0.25 * (avgEarnings / 12) * dropout_factor;

  // Actuarial age adjustments (canada.ca): -0.6%/month before 65, +0.7%/month after 65.
  const age_adjustment_factor =
    retirement_age < 65
      ? 1 - CPP_EARLY_REDUCTION_PER_MONTH * (65 - retirement_age) * 12
      : 1 + CPP_LATE_INCREASE_PER_MONTH * (retirement_age - 65) * 12;

  // CPP enhancement (post-2019): up to +33.33% on the base for fully-enhanced
  // years. Default enhanced-years assumption: contributions in 2019..2026
  // (8 years), capped at contributory years.
  const ENHANCED_YEARS_DEFAULT = Math.min(creditYears, FIGURES_YEAR - 2019 + 1);
  const enhanced_years_used =
    args.enhanced_years_since_2019 != null
      ? Math.max(0, Math.min(args.enhanced_years_since_2019, creditYears))
      : ENHANCED_YEARS_DEFAULT;
  const enhancedFraction = creditYears > 0 ? enhanced_years_used / creditYears : 0;
  const enhancement_estimate = base65 * CPP_ENHANCEMENT_MAX_RATE * enhancedFraction;

  const base_benefit_monthly = round2(base65 * age_adjustment_factor);
  const monthly_benefit = round2(base65 * age_adjustment_factor + enhancement_estimate);
  const annual_benefit = round2(monthly_benefit * 12);

  return {
    monthly_benefit,
    annual_benefit,
    base_benefit_monthly,
    age_adjustment_factor: round2(age_adjustment_factor),
    dropout_factor: round2(dropout_factor),
    enhancement_estimate: round2(enhancement_estimate),
    enhanced_years_used,
    inputs: {
      avg_pensionable_earnings: avgEarnings,
      contributory_years: args.contributory_years,
      retirement_age,
      enhanced_years_since_2019: enhanced_years_used,
    },
    assumptions: [
      "Simplified model only — NOT the exact Service Canada formula. Your actual benefit is determined by Service Canada from your official contribution record (Statement of Contributions).",
      `Average earnings are capped at the ${FIGURES_YEAR} YMPE of $${YMPE_2026.toLocaleString("en-CA")}; the real calculation indexes each year's earnings to that year's YMPE (not modeled here).`,
      "General low-earnings dropout: up to 17% of the contributory period may be excluded; the average is computed over the remaining 83%. Child-rearing and disability dropouts are NOT modeled.",
      `Post-retirement benefits (contributions while receiving CPP) and the CPP2 second tier (earnings above YMPE up to YAMPE) are NOT modeled.`,
      `Enhanced years default to contributions in 2019–${FIGURES_YEAR} (${ENHANCED_YEARS_DEFAULT} of ${creditYears} years); the 2019–2023 phase-in of additional contribution rates is not modeled, so the enhancement estimate runs slightly high. Override with enhanced_years_since_2019.`,
      "Actuarial adjustments: −0.6% per month before age 65 (max −36% at 60), +0.7% per month after 65 (max +42% at 70), per canada.ca.",
      `For comparison, the published maximum CPP retirement pension at age 65 is $${CPP_MAX_MONTHLY_2026}/month (${FIGURES_YEAR}).`,
    ],
    formula_note:
      "monthly = 0.25 × (min(avg_earnings, YMPE)/12) × dropout_factor × age_factor + enhancement_estimate; " +
      "dropout_factor = min(1, contributory_years / (0.83 × contributory_period)), contributory_period = retirement_age − 18; " +
      "age_factor = 1 − 0.006×(65−age)×12 for age<65, or 1 + 0.007×(age−65)×12 for age>65; " +
      "enhancement_estimate = base_at_65 × 33.33% × (enhanced_years_since_2019 / contributory_years).",
    figures_year: FIGURES_YEAR,
  };
}

// ============================================================================
// estimate_oas
// ============================================================================

export interface EstimateOasArgs {
  residency_years_18_65: number; // 0-40
  deferral_months?: number; // 0-60; default 0
  age_band?: "65-74" | "75+"; // default "65-74"
}

export interface EstimateOasResult {
  [key: string]: unknown;
  monthly_benefit: number;
  annual_benefit: number;
  full_amount: number;
  residency_fraction: number;
  deferral_bonus_pct: number;
  inputs: {
    residency_years_18_65: number;
    deferral_months: number;
    age_band: "65-74" | "75+";
  };
  note: string;
  figures_year: number;
  figures_quarter: string;
}

export function estimateOas(args: EstimateOasArgs): EstimateOasResult {
  const deferral_months = args.deferral_months ?? 0;
  const age_band = args.age_band ?? "65-74";
  const full_amount =
    age_band === "75+" ? OAS_MAX_MONTHLY_75_PLUS_2026 : OAS_MAX_MONTHLY_65_74_2026;

  // Full pension at 40+ years of Canadian residence after age 18; partial at 1/40 per year.
  const residency_fraction = round2(Math.min(1, Math.max(0, args.residency_years_18_65) / 40));

  // Deferral bonus: 0.6% per month, up to 36% (60 months, to age 70).
  const deferral_bonus_pct = round2(OAS_DEFERRAL_PER_MONTH * 100 * deferral_months);
  const monthly_benefit = round2(
    full_amount * residency_fraction * (1 + OAS_DEFERRAL_PER_MONTH * deferral_months)
  );

  return {
    monthly_benefit,
    annual_benefit: round2(monthly_benefit * 12),
    full_amount,
    residency_fraction,
    deferral_bonus_pct,
    inputs: {
      residency_years_18_65: args.residency_years_18_65,
      deferral_months,
      age_band,
    },
    note:
      "You need at least 10 years of Canadian residence after age 18 to receive any OAS pension (20 years if you live outside Canada); 40+ years gives the full pension. " +
      `OAS is indexed quarterly; amounts shown are the ${OAS_FIGURES_QUARTER} ${FIGURES_YEAR} maximums and will change with future indexation. ` +
      "The 75+ amount includes the permanent 10% increase that applies from the month after you turn 75. " +
      "OAS may be reduced by the pension recovery tax (clawback) if your net income exceeds the threshold — see clawback_check.",
    figures_year: FIGURES_YEAR,
    figures_quarter: OAS_FIGURES_QUARTER,
  };
}

// ============================================================================
// clawback_check
// ============================================================================

export interface ClawbackCheckArgs {
  net_income: number;
  age_band?: "65-74" | "75+"; // default "65-74"; sets the full-repayment ceiling used in the note
}

export interface ClawbackCheckResult {
  [key: string]: unknown;
  net_income: number;
  threshold: number;
  excess: number;
  annual_clawback: number;
  monthly_reduction: number;
  full_repayment_ceiling: number;
  note: string;
  figures_year: number;
}

export function clawbackCheck(args: ClawbackCheckArgs): ClawbackCheckResult {
  const age_band = args.age_band ?? "65-74";
  const fullMonthly =
    age_band === "75+" ? OAS_MAX_MONTHLY_75_PLUS_2026 : OAS_MAX_MONTHLY_65_74_2026;
  const fullAnnual = round2(fullMonthly * 12);

  const excess = round2(Math.max(0, args.net_income - OAS_CLAWBACK_THRESHOLD_2026));
  const annual_clawback = round2(Math.min(OAS_CLAWBACK_RATE * excess, fullAnnual));

  return {
    net_income: args.net_income,
    threshold: OAS_CLAWBACK_THRESHOLD_2026,
    excess,
    annual_clawback,
    monthly_reduction: round2(annual_clawback / 12),
    full_repayment_ceiling:
      age_band === "75+" ? OAS_FULL_REPAYMENT_75_PLUS_2026 : OAS_FULL_REPAYMENT_65_74_2026,
    note:
      `The OAS pension recovery tax claws back 15% of net world income above the ${FIGURES_YEAR} threshold of $${OAS_CLAWBACK_THRESHOLD_2026.toLocaleString("en-CA")} ` +
      `(including OAS itself), capped at your full OAS pension. In ${FIGURES_YEAR} the pension is fully repaid at net world income of ` +
      `$${(age_band === "75+" ? OAS_FULL_REPAYMENT_75_PLUS_2026 : OAS_FULL_REPAYMENT_65_74_2026).toLocaleString("en-CA")} for age band ${age_band} ` +
      `($${OAS_CLAWBACK_THRESHOLD_2026.toLocaleString("en-CA")}–$${OAS_FULL_REPAYMENT_65_74_2026.toLocaleString("en-CA")} for 65–74; ` +
      `$${OAS_CLAWBACK_THRESHOLD_2026.toLocaleString("en-CA")}–$${OAS_FULL_REPAYMENT_75_PLUS_2026.toLocaleString("en-CA")} for 75+). ` +
      "The actual recovery is assessed by CRA on your income tax return; Service Canada may withhold an estimated amount from monthly payments.",
    figures_year: FIGURES_YEAR,
  };
}
