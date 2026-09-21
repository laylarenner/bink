"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { disconnectAccount, getConnectUrl, listConnectedAccounts } from "@/app/actions";
import { DEMO_MODE } from "@/lib/demoModeShared";
import { ZERNIO_CONNECT_PLATFORMS, type ZernioAccount } from "@/lib/zernioShared";

/**
 * Connects a real LinkedIn account through Zernio, once. After that,
 * "Post" on any draft goes straight out — no other app, no copy-pasting.
 */
export default function ConnectAccounts({ profileId }: { profileId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<ZernioAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  function refresh() {
    setError(null);
    startLoading(async () => {
      const result = await listConnectedAccounts(profileId);
      if (result.ok) setAccounts(result.accounts);
      else setError(result.message);
    });
  }

  useEffect(() => {
    const connected = searchParams.get("connected");
    if (connected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time reaction to an OAuth redirect's query params
      setJustConnected(connected);
      setExpanded(true);
      refresh();
      router.replace(`/profile/${profileId}?tab=Posts`, { scroll: false });
    } else {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever runs once, on mount / on the redirect back from a connect attempt
  }, []);

  function connect(platform: string) {
    setError(null);
    setConnectingPlatform(platform);
    const win = window.open("", "_blank");
    startLoading(async () => {
      const result = await getConnectUrl(profileId, platform);
      if (result.ok && result.url) {
        if (win) win.location.href = result.url;
      } else {
        win?.close();
        setError(result.message);
      }
      setConnectingPlatform(null);
    });
  }

  function disconnect(accountId: string) {
    setError(null);
    setDisconnectingId(accountId);
    startLoading(async () => {
      const result = await disconnectAccount(profileId, accountId);
      if (result.ok) setAccounts((prev) => prev?.filter((a) => a.id !== accountId) ?? null);
      else setError(result.message);
      setDisconnectingId(null);
    });
  }

  const connectedCount = accounts?.length ?? 0;

  if (DEMO_MODE) {
    return (
      <div className="rounded-xl border border-dashed border-sand bg-cream-soft p-4">
        <h3 className="text-sm font-semibold text-ink">Real posting is turned off in this public demo</h3>
        <p className="mt-1 text-sm text-ink-soft">
          You can still build a profile, chat with the strategist, and see drafts written in your voice. Clone the repo
          and run it with your own API keys and your own connected accounts to post for real.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sand bg-white p-4 shadow-sm">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <h3 className="text-sm font-semibold text-ink">Connect your accounts to post automatically</h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            {connectedCount > 0
              ? `${connectedCount} account${connectedCount === 1 ? "" : "s"} connected. Approve a draft and it goes out, no manual posting.`
              : "Connect LinkedIn once, then approved drafts publish themselves."}
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-coral-dark">{expanded ? "Hide" : "Manage"}</span>
      </button>

      {expanded && (
        <div className="mt-4 border-t border-sand pt-4">
          {justConnected && (
            <p className="mb-2 rounded-lg bg-sage px-3 py-2 text-xs font-semibold text-sage-text">
              ✓ {ZERNIO_CONNECT_PLATFORMS.find((p) => p.platform === justConnected)?.label ?? justConnected} connected.
            </p>
          )}
          {error && <p className="mb-2 rounded-lg bg-rose/10 px-3 py-2 text-xs text-rose">{error}</p>}

          <div className="space-y-1.5">
            {ZERNIO_CONNECT_PLATFORMS.map(({ platform, label }) => {
              const connected = accounts?.filter((a) => a.platform === platform) ?? [];
              return (
                <div key={platform} className="rounded-lg bg-cream-soft p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">{label}</span>
                    <button
                      type="button"
                      onClick={() => connect(platform)}
                      disabled={connectingPlatform === platform}
                      className="rounded-lg bg-coral px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-coral-dark disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {connectingPlatform === platform ? "Opening..." : connected.length > 0 ? "Connect another" : "Connect"}
                    </button>
                  </div>
                  {connected.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {connected.map((a) => (
                        <li key={a.id} className="flex items-center justify-between text-xs text-ink-soft">
                          <span>✓ {a.username ? `@${a.username}` : a.name}</span>
                          <button
                            type="button"
                            onClick={() => disconnect(a.id)}
                            disabled={disconnectingId === a.id}
                            className="font-semibold text-rose hover:underline disabled:opacity-50"
                          >
                            Disconnect
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <button type="button" onClick={refresh} disabled={loading} className="mt-3 text-xs font-semibold text-coral-dark hover:underline disabled:opacity-50">
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      )}
    </div>
  );
}
