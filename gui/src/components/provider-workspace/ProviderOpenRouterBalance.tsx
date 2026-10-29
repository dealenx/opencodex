/**
 * ProviderOpenRouterBalance — "Current account usage" row fed by the proxy's
 * OpenRouter credits endpoint (GET /api/providers/:name/balance, management
 * key on the provider). Percent is a $100 scale: $12 remaining → 12%.
 * Renders nothing while loading, on a missing management key, or on any error.
 */
import { useEffect, useState } from "react";
import { useT } from "../../i18n/shared";
import type { WorkspaceItem } from "../../provider-workspace/catalog";

export interface OpenRouterBalanceDto {
  provider: string;
  totalCredits: number;
  totalUsage: number;
  balance: number;
  currency: "USD";
  checkedAt: string;
}

/** Remaining credit balance for a provider, or null while loading / unavailable. */
// oxlint-disable-next-line react/only-export-components -- colocated with the row it feeds; callers import both from one place.
export function useOpenRouterBalance(itemName: string, apiBase?: string): number | null {
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    // apiBase is "" on same-origin deployments — a relative URL is correct there.
    fetch(`${apiBase ?? ""}/api/providers/${encodeURIComponent(itemName)}/balance`)
      .then(res => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<OpenRouterBalanceDto>;
      })
      .then(data => {
        if (alive && typeof data?.balance === "number") setBalance(data.balance);
      })
      .catch(() => { /* missing key or upstream error: keep the row hidden */ });
    return () => { alive = false; };
  }, [apiBase, itemName]);
  return balance;
}

// oxlint-disable-next-line react/only-export-components -- shared by the dashboard row that renders the same scale.
export function openRouterBalancePercent(balance: number): number {
  // $100 scale per product decision: $12 left → 12%; over-full saturates at 100%.
  return Math.max(0, Math.min(100, Math.round(balance)));
}

export default function ProviderOpenRouterBalance({ item, apiBase }: {
  item: WorkspaceItem;
  apiBase?: string;
}) {
  const t = useT();
  const balance = useOpenRouterBalance(item.name, apiBase);
  if (balance === null) return null;
  const percent = openRouterBalancePercent(balance);
  return (
    <section className="pws-section" aria-label={t("pws.currentAccountUsage")}>
      <h3 className="pws-section-title">{t("pws.currentAccountUsage")}</h3>
      <dl className="pws-kv">
        <div className="pws-kv-row">
          <dt>{t("pws.balanceLabel")}</dt>
          <dd className="pws-kv-mono">{balance.toFixed(2)} $ · {percent}%</dd>
        </div>
      </dl>
    </section>
  );
}
