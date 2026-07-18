"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const POLLING_INTERVAL_MS = 15_000;
const REFRESH_DEBOUNCE_MS = 750;

export type QbOrdersSyncStatus =
  | "connecting"
  | "live"
  | "polling"
  | "offline"
  | "stale";

type RefreshReason = "realtime" | "poll" | "focus" | "visibility" | "online" | "manual";

export function useQbOrdersSynchronization({
  hasUnsavedChanges,
  mutationPending,
}: {
  hasUnsavedChanges: boolean;
  mutationPending: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<QbOrdersSyncStatus>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => Date.now());
  const [remoteChangePending, setRemoteChangePending] = useState(false);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transportStatusRef = useRef<QbOrdersSyncStatus>("connecting");
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const mutationPendingRef = useRef(mutationPending);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
    mutationPendingRef.current = mutationPending;
  }, [hasUnsavedChanges, mutationPending]);

  const requestRefresh = useCallback(
    (reason: RefreshReason, force = false) => {
      if (typeof document === "undefined") return;
      if (reason !== "manual" && document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        transportStatusRef.current = "offline";
        setStatus("offline");
        return;
      }
      if (mutationPendingRef.current && !force) return;

      if (hasUnsavedChangesRef.current && !force) {
        if (reason === "realtime") {
          setRemoteChangePending(true);
          setStatus("stale");
        }
        return;
      }

      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(
        () => {
          startRefreshTransition(() => router.refresh());
          setLastUpdatedAt(Date.now());
          setRemoteChangePending(false);
          setStatus(transportStatusRef.current);
        },
        reason === "manual" ? 0 : REFRESH_DEBOUNCE_MS,
      );
    },
    [router],
  );

  const markConflict = useCallback(() => {
    setRemoteChangePending(true);
    setStatus("stale");
    if (!hasUnsavedChangesRef.current) requestRefresh("manual", true);
  }, [requestRefresh]);

  const refreshManually = useCallback(() => {
    if (hasUnsavedChangesRef.current) {
      setRemoteChangePending(true);
      setStatus("stale");
      return false;
    }
    requestRefresh("manual", true);
    return true;
  }, [requestRefresh]);

  const discardAndRefresh = useCallback(() => {
    setRemoteChangePending(false);
    requestRefresh("manual", true);
  }, [requestRefresh]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      transportStatusRef.current = "polling";
      const pollingStatusTimer = setTimeout(() => setStatus("polling"), 0);
      return () => clearTimeout(pollingStatusTimer);
    }

    const handleDatabaseChange = () => requestRefresh("realtime");
    const channel = supabase
      .channel("qb-orders-operational-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "qb_orders" }, handleDatabaseChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "qb_order_items" }, handleDatabaseChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "qb_order_preparations" }, handleDatabaseChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "qb_order_preparation_items" }, handleDatabaseChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "qb_order_delivery_movements" }, handleDatabaseChange)
      .subscribe((channelStatus) => {
        if (channelStatus === "SUBSCRIBED") {
          transportStatusRef.current = "live";
          setStatus("live");
        } else if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT") {
          transportStatusRef.current = navigator.onLine ? "polling" : "offline";
          setStatus(transportStatusRef.current);
        } else if (channelStatus === "CLOSED" && !navigator.onLine) {
          transportStatusRef.current = "offline";
          setStatus("offline");
        }
      });

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [requestRefresh]);

  useEffect(() => {
    const poll = () => requestRefresh("poll");
    const intervalId = window.setInterval(poll, POLLING_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [requestRefresh]);

  useEffect(() => {
    const handleFocus = () => requestRefresh("focus");
    const handleVisibility = () => {
      if (document.visibilityState === "visible") requestRefresh("visibility");
    };
    const handleOnline = () => {
      transportStatusRef.current = "connecting";
      setStatus("connecting");
      requestRefresh("online", true);
    };
    const handleOffline = () => {
      transportStatusRef.current = "offline";
      setStatus("offline");
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [requestRefresh]);

  return {
    status,
    lastUpdatedAt,
    isRefreshing,
    remoteChangePending,
    refreshManually,
    discardAndRefresh,
    markConflict,
  };
}

export const QB_ORDERS_POLLING_INTERVAL_MS = POLLING_INTERVAL_MS;
