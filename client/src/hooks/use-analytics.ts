import { useEffect, useRef, useCallback } from "react";

const HEARTBEAT_INTERVAL = 60000;
const IDLE_TIMEOUT = 120000;

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
  const lastActivityRef = useRef(Date.now());
  const isActiveRef = useRef(true);

  useEffect(() => {
    const markActive = () => {
      lastActivityRef.current = Date.now();
      isActiveRef.current = true;
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach(evt => window.addEventListener(evt, markActive, { passive: true }));

    const idleChecker = setInterval(() => {
      if (Date.now() - lastActivityRef.current > IDLE_TIMEOUT) {
        isActiveRef.current = false;
      }
    }, 10000);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, markActive));
      clearInterval(idleChecker);
    };
  }, []);

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
        if (!isActiveRef.current) return;
        fetch("/api/analytics/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionId.current,
            userEmail: userEmail || undefined,
            currentPage: window.location.pathname,
            isActive: true,
            userAgent: navigator.userAgent,
          }),
        }).catch(() => {});
      } catch {}
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    return () => clearInterval(interval);
  }, [userEmail]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin') && userEmail) {
      trackEvent("login", { page: window.location.pathname });
    }
  }, [trackEvent, userEmail]);

  return { trackEvent };
}
