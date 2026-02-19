import { useEffect, useRef, useCallback } from "react";

function getSessionId(): string {
  try {
    let sid = sessionStorage.getItem("analytics_session_id");
    if (!sid) {
      sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem("analytics_session_id", sid);
    }
    return sid;
  } catch {
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function useAnalytics(userEmail?: string | null) {
  const sessionId = useRef(getSessionId());

  const trackEvent = useCallback(
    (eventType: string, metadata?: Record<string, any>) => {
      try {
        fetch("/api/analytics/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionId.current,
            userEmail: userEmail || undefined,
            eventType,
            metadata,
          }),
        }).catch(() => {});
      } catch {}
    },
    [userEmail]
  );

  useEffect(() => {
    const sendHeartbeat = () => {
      try {
        fetch("/api/analytics/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionId.current,
            userEmail: userEmail || undefined,
            currentPage: window.location.pathname,
          }),
        }).catch(() => {});
      } catch {}
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 300000);

    return () => clearInterval(interval);
  }, [userEmail]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin') && userEmail) {
      trackEvent("login", { page: window.location.pathname });
    }
  }, [trackEvent, userEmail]);

  return { trackEvent };
}
