/**
 * Verified 2026 Canadian retirement-benefit figures.
 *
 * EVERY figure below was verified against an official canada.ca source on
 * 2026-10-04. Source URLs are inline. If you update figures, re-verify and
 * update the URLs + the FIGURES_YEAR / quarter labels.
 *
 * Latest official "Maximum benefit amounts and related figures" card
 * (Employment and Social Development Canada):
 * https://www.canada.ca/content/dam/canada/employment-social-development/migration/documents/assets/portfolio/docs/en/statistics/quarterly_report/isp-card-jul-sep-2026-en.pdf
 */

// ---- Canada Pension Plan (CPP), 2026 -------------------------------------
// Source: ESDC quarterly card "Maximum benefit amounts and related figures —
// Canada Pension Plan (CPP), 2026 and OAS, July to September 2026", p.1:
// "Maximum amount of new CPP benefits, month of January 2026 —
//  Retirement pension (at age 65): $1,507.65"
export const CPP_MAX_MONTHLY_2026 = 1507.65;

// Source: same card, "CPP exemptions and pensionable earnings, 2026":
// Year's maximum pensionable earnings (YMPE): $74,600.00
export const YMPE_2026 = 74600;

// Source: same card: Year's additional maximum pensionable earnings
// (YAMPE): $85,000.00
export const YAMPE_2026 = 85000;

// Source: https://www.canada.ca/en/services/benefits/publicpensions/cpp/when-start.html
// "If you start your CPP pension before age 65: Payments decrease by 0.6%
//  each month (7.2% per year), up to a maximum reduction of 36% if you start
//  at age 60."
export const CPP_EARLY_REDUCTION_PER_MONTH = 0.006;

// Source: same page. "If you start your CPP pension after age 65: Payments
// increase by 0.7% each month (8.4% per year), up to 42% at age 70."
export const CPP_LATE_INCREASE_PER_MONTH = 0.007;

// CPP enhancement (phased in from 2019): raises the base replacement rate from
// 25% to up to 33.33% of average pensionable earnings for fully-enhanced
// years, plus a second additional tier (CPP2, up to YAMPE). Documented by
// Service Canada; the quarterly card footnote 1 states the max amounts
// "reflect the CPP enhancement that began in 2019". This server models the
// enhancement as a simplified add-on: base * 33.33% * enhanced-years fraction.
export const CPP_ENHANCEMENT_MAX_RATE = 0.3333;

// ---- Old Age Security (OAS), 2026 -----------------------------------------
// Source: same ESDC quarterly card, "OAS amounts — July to September 2026":
// Old Age Security pension (age 65 to 74): $751.97
export const OAS_MAX_MONTHLY_65_74_2026 = 751.97;

// Source: same table: Old Age Security pension (age 75 and over): $827.17
export const OAS_MAX_MONTHLY_75_PLUS_2026 = 827.17;

// Quarter label for the verified OAS amounts. The Oct–Dec 2026 card had not
// been published on 2026-10-04 (only projected figures existed), so these are
// the latest officially published quarterly amounts.
export const OAS_FIGURES_QUARTER = "Jul–Sep 2026";

// Source: same card, footnote 7: "The OAS pension repayment range in 2026 is
// for net world income from $95,323 to $155,109, for individuals aged 65-74.
// For those aged 75 and over, the upper threshold is $161,088."
export const OAS_CLAWBACK_THRESHOLD_2026 = 95323;
export const OAS_FULL_REPAYMENT_65_74_2026 = 155109;
export const OAS_FULL_REPAYMENT_75_PLUS_2026 = 161088;

// Source: same card, footnote 8: "The monthly OAS pension is increased by
// 0.6% for every month it is delayed, up to 36% at age 70."
export const OAS_DEFERRAL_PER_MONTH = 0.006;
export const OAS_DEFERRAL_MAX_MONTHS = 60;

// OAS recovery tax (clawback) rate: 15 cents per dollar of net world income
// above the threshold. Standard CRA/Service Canada figure.
export const OAS_CLAWBACK_RATE = 0.15;

export const FIGURES_YEAR = 2026;
