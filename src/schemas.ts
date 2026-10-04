/**
 * Zod input schemas for the three tools. Kept in their own module so both
 * src/index.ts (registration) and the unit tests (validation behavior) use
 * the same definitions.
 */
import { z } from "zod";

export const estimateCppInputSchema = {
  avg_pensionable_earnings: z
    .number()
    .min(0)
    .max(10_000_000)
    .optional()
    .describe(
      "Average annual pensionable earnings over your contributory period, in CAD. Capped at the 2026 YMPE ($74,600). Defaults to the YMPE (maximum-benefit scenario)."
    ),
  contributory_years: z
    .number()
    .min(0)
    .max(70)
    .describe("Number of years you contributed to CPP (between age 18 and the claim age)."),
  retirement_age: z
    .number()
    .int()
    .min(60)
    .max(70)
    .optional()
    .default(65)
    .describe("Age you start CPP: 60 (earliest) to 70 (latest). Default 65."),
  enhanced_years_since_2019: z
    .number()
    .min(0)
    .max(60)
    .optional()
    .describe(
      "Years of contributions since 2019 (the CPP enhancement era). Defaults to min(contributory_years, years 2019..2026). Used for the enhancement estimate."
    ),
};

export const estimateOasInputSchema = {
  residency_years_18_65: z
    .number()
    .min(0)
    .max(40)
    .describe(
      "Years of Canadian residence after age 18. Full pension at 40+ years; partial at 1/40 per year."
    ),
  deferral_months: z
    .number()
    .int()
    .min(0)
    .max(60)
    .optional()
    .default(0)
    .describe("Months you defer OAS past age 65 (0-60). Each month adds 0.6%, up to +36% at 60 months."),
  age_band: z
    .enum(["65-74", "75+"])
    .optional()
    .default("65-74")
    .describe("Age band: the 75+ band includes the permanent 10% increase. Default '65-74'."),
};

export const clawbackCheckInputSchema = {
  net_income: z
    .number()
    .min(0)
    .max(100_000_000)
    .describe("Net world income in CAD (includes the OAS pension itself), as used by CRA for the recovery tax."),
  age_band: z
    .enum(["65-74", "75+"])
    .optional()
    .default("65-74")
    .describe("Age band; sets the full-repayment ceiling quoted in the note. Default '65-74'."),
};
