/**
 * OpenRouter balance route.
 *
 * GET /api/providers/openrouter/balance
 *
 * Fetches the OpenRouter account credit balance via the management key
 * configured on the `openrouter` provider (`providers.openrouter.managementKey`).
 * Calls `GET https://openrouter.ai/api/v1/credits` with Bearer auth and returns
 * total credits, total usage, and the computed balance.
 */

import { jsonResponse } from "../auth-cors";
import { redactSecretString } from "../../lib/redact";
import type { ManagementContext } from "./context";

const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";

export interface OpenRouterBalanceDto {
  provider: string;
  totalCredits: number;
  totalUsage: number;
  balance: number;
  currency: "USD";
  checkedAt: string;
}

export async function handleOpenRouterBalanceRoutes(
  ctx: ManagementContext,
): Promise<Response | null> {
  const { url, req, config } = ctx;
  if (req.method !== "GET") return null;
  if (!url.pathname.startsWith("/api/providers/")) return null;

  const match = url.pathname.match(/^\/api\/providers\/([^\/]+)\/balance$/);
  if (!match) return null;
  const providerName = match[1];

  const provider = config.providers?.[providerName];
  if (!provider || typeof provider !== "object") {
    return jsonResponse(
      { error: `Provider ${redactSecretString(providerName)} not found` },
      404,
      req,
      config,
    );
  }

  const managementKey = provider.managementKey;
  if (typeof managementKey !== "string") {
    return jsonResponse(
      {
        error: `No management key configured for provider ${redactSecretString(providerName)}`,
        code: "MISSING_MANAGEMENT_KEY",
      },
      400,
      req,
      config,
    );
  }

  let res: Response;
  try {
    res = await fetch(OPENROUTER_CREDITS_URL, {
      headers: { Authorization: `Bearer ${managementKey}` },
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "Failed to reach OpenRouter credits API",
        code: "OPENROUTER_REQUEST_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
      502,
      req,
      config,
    );
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    const errorMsg =
      body && typeof body === "object" && "error" in body
        ? (body as { error?: { message?: string } }).error?.message ??
          String(res.status)
        : String(res.status);
    return jsonResponse(
      {
        error: "OpenRouter credits API error",
        code: "OPENROUTER_API_ERROR",
        message: errorMsg,
      },
      502,
      req,
      config,
    );
  }

  const data =
    body && typeof body === "object" && "data" in body
      ? (body as { data?: unknown }).data
      : undefined;
  if (
    !data ||
    typeof data !== "object" ||
    typeof (data as Record<string, unknown>).total_credits !== "number" ||
    typeof (data as Record<string, unknown>).total_usage !== "number"
  ) {
    return jsonResponse(
      {
        error: "Unexpected OpenRouter credits response",
        code: "OPENROUTER_BAD_RESPONSE",
        message: JSON.stringify(body).slice(0, 500),
      },
      502,
      req,
      config,
    );
  }

  const totalCredits = (data as Record<string, unknown>).total_credits as number;
  const totalUsage = (data as Record<string, unknown>).total_usage as number;
  const balance = totalCredits - totalUsage;

  const dto: OpenRouterBalanceDto = {
    provider: providerName,
    totalCredits,
    totalUsage,
    balance,
    currency: "USD",
    checkedAt: new Date().toISOString(),
  };

  return jsonResponse(dto, 200, req, config);
}
