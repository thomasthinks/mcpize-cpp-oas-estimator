import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import chalk from "chalk";
import { estimateCpp, estimateOas, clawbackCheck } from "./tools.js";
import { consumeEstimate } from "./quota.js";
import {
  estimateCppInputSchema,
  estimateOasInputSchema,
  clawbackCheckInputSchema,
} from "./schemas.js";

// ============================================================================
// Dev Logging Utilities
// ============================================================================

const isDev = process.env.NODE_ENV !== "production";

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function formatLatency(ms: number): string {
  if (ms < 100) return chalk.green(`${ms}ms`);
  if (ms < 500) return chalk.yellow(`${ms}ms`);
  return chalk.red(`${ms}ms`);
}

function truncate(str: string, maxLen = 60): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function logRequest(method: string, params?: unknown): void {
  if (!isDev) return;

  const paramsStr = params ? chalk.gray(` ${truncate(JSON.stringify(params))}`) : "";
  console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.cyan("→")} ${method}${paramsStr}`);
}

function logResponse(method: string, result: unknown, latencyMs: number): void {
  if (!isDev) return;

  const latency = formatLatency(latencyMs);

  // For tool calls, show the result
  if (method === "tools/call" && result) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result);
    console.log(
      `${chalk.gray(`[${timestamp()}]`)} ${chalk.green("←")} ${truncate(resultStr)} ${chalk.gray(`(${latency})`)}`
    );
  } else {
    console.log(`${chalk.gray(`[${timestamp()}]`)} ${method} ${chalk.gray(`(${latency})`)}`);
  }
}

function logError(method: string, error: unknown, latencyMs: number): void {
  const latency = formatLatency(latencyMs);

  let errorMsg;
  if (error instanceof Error) {
    errorMsg = error.message;
  } else if (typeof error === "object" && error !== null) {
    // JSON-RPC error object has { code, message, data? }
    const rpcError = error as { message?: string; code?: number };
    errorMsg = rpcError.message || `Error ${rpcError.code || "unknown"}`;
  } else {
    errorMsg = String(error);
  }

  console.log(
    `${chalk.gray(`[${timestamp()}]`)} ${chalk.red("✖")} ${method} ${chalk.red(truncate(errorMsg))} ${chalk.gray(`(${latency})`)}`
  );
}

// ============================================================================
// Freemium helpers
// ============================================================================

function quotaExceededResponse(limit: number) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: `Free quota exceeded (${limit} estimates/month). Subscribe to Pro for unlimited access.`,
          plan: "Free",
          quota: `${limit} estimates/month`,
        }),
      },
    ],
    isError: true as const,
  };
}

/** Wrap a tool handler with quota enforcement + never-crash error handling. */
function estimateHandler<TInput, TOutput extends Record<string, unknown>>(
  toolName: string,
  fn: (args: TInput) => TOutput
) {
  return async (args: TInput) => {
    const quota = consumeEstimate();
    if (!quota.allowed) {
      console.log(`[${toolName}] quota exceeded (${quota.used}/${quota.limit} for ${quota.month})`);
      return quotaExceededResponse(quota.limit);
    }
    try {
      const output = fn(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${toolName}] Error:`, message);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: message,
              suggestion: "Check the input values and try again. If the problem persists, contact support.",
            }),
          },
        ],
        isError: true as const,
      };
    }
  };
}

// ============================================================================
// MCP Server Setup
// ============================================================================

// Build a FRESH MCP server per request.
//
// In stateless streamable-HTTP mode the MCP SDK allows a Server to be connected
// to exactly ONE transport. Reusing a single module-scope instance throws
// "Already connected to a transport" on the second connection — and Cloud Run
// opens several (startup probe + real requests). So always create a new server
// (and a new transport) inside the request handler below.
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "cpp-oas-estimator",
    version: "1.0.0",
  });

  server.registerTool(
    "estimate_cpp",
    {
      title: "Estimate CPP Retirement Benefit",
      description:
        "Estimate a monthly Canada Pension Plan (CPP) retirement benefit from a simplified model: average annual pensionable earnings (capped at YMPE), contributory years, and claim age (60-70), with the general 17% low-earnings dropout, CPP age adjustments, and the post-2019 enhancement. Estimates only — not financial advice.",
      inputSchema: estimateCppInputSchema,
      outputSchema: {
        monthly_benefit: z.number(),
        annual_benefit: z.number(),
        base_benefit_monthly: z.number(),
        age_adjustment_factor: z.number(),
        dropout_factor: z.number(),
        enhancement_estimate: z.number(),
        enhanced_years_used: z.number(),
        inputs: z.object({
          avg_pensionable_earnings: z.number(),
          contributory_years: z.number(),
          retirement_age: z.number(),
          enhanced_years_since_2019: z.number(),
        }),
        assumptions: z.array(z.string()),
        formula_note: z.string(),
        figures_year: z.number(),
      },
    },
    estimateHandler("estimate_cpp", estimateCpp)
  );

  server.registerTool(
    "estimate_oas",
    {
      title: "Estimate OAS Pension",
      description:
        "Estimate a monthly Old Age Security (OAS) pension from Canadian residency years after age 18 (0-40), an optional deferral (0-60 months past 65), and the age band (65-74 or 75+). Uses the verified 2026 maximum monthly amounts. Estimates only — not financial advice.",
      inputSchema: estimateOasInputSchema,
      outputSchema: {
        monthly_benefit: z.number(),
        annual_benefit: z.number(),
        full_amount: z.number(),
        residency_fraction: z.number(),
        deferral_bonus_pct: z.number(),
        inputs: z.object({
          residency_years_18_65: z.number(),
          deferral_months: z.number(),
          age_band: z.string(),
        }),
        note: z.string(),
        figures_year: z.number(),
        figures_quarter: z.string(),
      },
    },
    estimateHandler("estimate_oas", estimateOas)
  );

  server.registerTool(
    "clawback_check",
    {
      title: "Check OAS Pension Recovery Tax (Clawback)",
      description:
        "Compute the OAS pension recovery tax (clawback) for a given net world income: 15% of income above the 2026 threshold, capped at the full OAS pension. Estimates only — not financial advice.",
      inputSchema: clawbackCheckInputSchema,
      outputSchema: {
        net_income: z.number(),
        threshold: z.number(),
        excess: z.number(),
        annual_clawback: z.number(),
        monthly_reduction: z.number(),
        full_repayment_ceiling: z.number(),
        note: z.string(),
        figures_year: z.number(),
      },
    },
    estimateHandler("clawback_check", clawbackCheck)
  );

  return server;
}

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();
app.use(express.json());

// Health check endpoint (required for Cloud Run)
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "healthy" });
});

// MCP endpoint with dev logging
app.post("/mcp", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const body = req.body;

  // Extract method and params from JSON-RPC request
  const method = body?.method || "unknown";
  const params = body?.params;

  // Log incoming request
  if (method === "tools/call") {
    const toolName = params?.name || "unknown";
    const toolArgs = params?.arguments;
    logRequest(`tools/call ${chalk.bold(toolName)}`, toolArgs);
  } else if (method !== "notifications/initialized") {
    logRequest(method, params);
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // Capture response body for logging
  let responseBody = "";
  const originalWrite = res.write.bind(res) as typeof res.write;
  const originalEnd = res.end.bind(res) as typeof res.end;

  res.write = function (chunk: unknown, encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void), callback?: (error: Error | null | undefined) => void) {
    if (chunk) {
      responseBody += typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
    }
    return originalWrite(chunk as string, encodingOrCallback as BufferEncoding, callback);
  };

  res.end = function (chunk?: unknown, encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void) {
    if (chunk) {
      responseBody += typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
    }

    // Log response
    if (method !== "notifications/initialized") {
      const latency = Date.now() - startTime;

      try {
        const rpcResponse = JSON.parse(responseBody) as { result?: unknown; error?: unknown };

        if (rpcResponse?.error) {
          logError(method, rpcResponse.error, latency);
        } else if (method === "tools/call") {
          const content = (rpcResponse?.result as { content?: Array<{ text?: string }> })?.content;
          const resultText = content?.[0]?.text;
          logResponse(method, resultText, latency);
        } else {
          logResponse(method, null, latency);
        }
      } catch {
        logResponse(method, null, latency);
      }
    }

    return originalEnd(chunk as string, encodingOrCallback as BufferEncoding, callback);
  };

  res.on("close", () => {
    transport.close();
  });

  // Fresh server instance per request (see createMcpServer above) — required for
  // stateless streamable-HTTP so a second connection never reuses a transport.
  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// JSON error handler (Express defaults to HTML errors)
app.use((_err: unknown, _req: Request, res: Response, _next: Function) => {
  res.status(500).json({ error: "Internal server error" });
});

// ============================================================================
// Start Server
// ============================================================================

const port = parseInt(process.env.PORT || "8080");
const httpServer = app.listen(port, () => {
  console.log();
  console.log(chalk.bold("MCP Server running on"), chalk.cyan(`http://localhost:${port}`));
  console.log(`  ${chalk.gray("Health:")} http://localhost:${port}/health`);
  console.log(`  ${chalk.gray("MCP:")}    http://localhost:${port}/mcp`);

  if (isDev) {
    console.log();
    console.log(chalk.gray("─".repeat(50)));
    console.log();
  }
});

// Graceful shutdown for Cloud Run (SIGTERM before kill)
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  httpServer.close(() => {
    process.exit(0);
  });
});
