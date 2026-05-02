import type { Express } from "express";
import { type IStorage } from "./storage";
import crypto from "crypto";
import { pool } from "./db";

const ADMIN_TOKEN_SECRET = crypto.randomBytes(32).toString("hex");

function generateAdminToken(): string {
  const payload = Date.now().toString();
  const hmac = crypto.createHmac("sha256", ADMIN_TOKEN_SECRET);
  hmac.update(payload);
  return `${payload}.${hmac.digest("hex")}`;
}

function verifyAdminToken(token: string): boolean {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return false;
    const hmac = crypto.createHmac("sha256", ADMIN_TOKEN_SECRET);
    hmac.update(payload);
    return hmac.digest("hex") === sig;
  } catch {
    return false;
  }
}

export function registerAnalyticsRoutes(app: Express, storage: IStorage) {
  app.post("/api/analytics/event", async (req, res) => {
    try {
      const { sessionId, userEmail, eventType, metadata } = req.body;
      if (!sessionId || !eventType) {
        return res.status(400).json({ error: "sessionId and eventType required" });
      }
      await storage.logAnalyticsEvent({ sessionId, userEmail: userEmail || null, eventType, metadata: metadata || null });
      res.json({ ok: true });
    } catch (e) {
      console.error("Analytics event error (non-critical):", e);
      res.json({ ok: true });
    }
  });

  app.post("/api/analytics/heartbeat", async (req, res) => {
    try {
      const { sessionId, userEmail, currentPage, isActive, userAgent } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: "sessionId required" });
      }
      await storage.upsertActiveSession({
        sessionId,
        userEmail: userEmail || undefined,
        lastSeen: new Date().toISOString(),
        currentPage: currentPage || undefined,
        metadata: { isActive: isActive !== false, userAgent: userAgent || null },
      });
      if (Math.random() < 0.1) {
        try { await storage.cleanupOldSessions(3); } catch {}
      }
      res.json({ ok: true });
    } catch (e) {
      console.error("Analytics heartbeat error (non-critical):", e);
      res.json({ ok: true });
    }
  });

  app.post("/api/admin/login", async (req, res) => {
    try {
      const { password } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
      if (password !== adminPassword) {
        return res.status(401).json({ error: "Invalid password" });
      }
      const token = generateAdminToken();
      res.json({ success: true, token });
    } catch (e) {
      console.error("Admin login error:", e);
      res.status(500).json({ error: "Login failed" });
    }
  });

  const adminAuth = (req: any, res: any, next: any) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace("Bearer ", "") || "";
      if (!verifyAdminToken(token)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      next();
    } catch {
      res.status(401).json({ error: "Unauthorized" });
    }
  };

  app.get("/api/admin/analytics/dbcheck", adminAuth, async (req, res) => {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query("SELECT NOW() as time, current_database() as db");
        const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('analytics_events','active_sessions')");
        const eventCount = await client.query("SELECT COUNT(*) as count FROM analytics_events");
        const sessionCount = await client.query("SELECT COUNT(*) as count FROM active_sessions");
        res.json({
          status: "connected",
          serverTime: result.rows[0].time,
          database: result.rows[0].db,
          tables: tables.rows.map((r: any) => r.table_name),
          eventCount: parseInt(eventCount.rows[0].count),
          sessionCount: parseInt(sessionCount.rows[0].count),
        });
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error("DB check error:", e?.message || e);
      res.json({ status: "error", error: e?.message || String(e) });
    }
  });

  app.get("/api/admin/analytics/active", adminAuth, async (req, res) => {
    try {
      const sessions = await storage.getActiveSessions(3);
      const now = Date.now();
      const enriched = sessions.map((s: any) => {
        const lastSeenMs = new Date(s.lastSeen).getTime();
        const idleSeconds = Math.floor((now - lastSeenMs) / 1000);
        const status = idleSeconds <= 90 ? "active" : "idle";
        return { ...s, status, idleSeconds };
      });
      const activeCount = enriched.filter((s: any) => s.status === "active").length;
      const idleCount = enriched.filter((s: any) => s.status === "idle").length;
      res.json({
        count: sessions.length,
        activeCount,
        idleCount,
        sessions: enriched,
      });
    } catch (e) {
      console.error("Admin active sessions error:", e);
      res.json({ count: 0, activeCount: 0, idleCount: 0, sessions: [] });
    }
  });

  app.get("/api/admin/analytics/events", adminAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const eventType = (req.query.eventType as string) || undefined;
      const events = await storage.getAnalyticsEvents(limit, offset, eventType);
      res.json({ events, total: events.length });
    } catch (e) {
      console.error("Admin events error:", e);
      res.json({ events: [], total: 0 });
    }
  });

  app.get("/api/admin/customer-templates", adminAuth, async (req, res) => {
    try {
      const assignments = await storage.getAllCustomerTemplates();
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: "Failed to get customer template assignments" });
    }
  });

  app.get("/api/admin/all-templates", adminAuth, async (req, res) => {
    try {
      const templateSizes = await storage.getTemplateSizes();
      res.json(templateSizes);
    } catch (error) {
      res.status(500).json({ error: "Failed to get template sizes" });
    }
  });

  app.post("/api/admin/customer-templates", adminAuth, async (req, res) => {
    try {
      const { customerCode, templateId } = req.body;
      if (!customerCode || !templateId) {
        return res.status(400).json({ error: "Customer code and template ID are required" });
      }
      const trimmedCode = customerCode.trim().toLowerCase();
      const existing = await storage.getAllCustomerTemplates();
      const duplicate = existing.find(
        (a) => a.customerCode.toLowerCase() === trimmedCode && a.templateId === templateId
      );
      if (duplicate) {
        return res.status(409).json({ error: "This assignment already exists" });
      }
      const assignment = await storage.createCustomerTemplate({ customerCode: trimmedCode, templateId });
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ error: "Failed to create customer template assignment" });
    }
  });

  app.delete("/api/admin/customer-templates/:id", adminAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteCustomerTemplate(req.params.id);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Assignment not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to delete customer template assignment" });
    }
  });

  app.get("/api/admin/analytics/stats", adminAuth, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const stats = await storage.getAnalyticsStats(days);
      const client = await pool.connect();
      try {
        const countResult = await client.query("SELECT COUNT(*) as total, COUNT(DISTINCT user_email) as unique_users FROM analytics_events WHERE user_email IS NOT NULL");
        const totalResult = await client.query("SELECT COUNT(*) as total FROM analytics_events");
        const allSessions = await storage.getActiveSessions(3);
        const now = Date.now();
        const trueActive = allSessions.filter((s: any) => {
          const idleSeconds = Math.floor((now - new Date(s.lastSeen).getTime()) / 1000);
          return idleSeconds <= 90;
        }).length;
        res.json({
          stats,
          summary: {
            totalEvents: parseInt(totalResult.rows[0].total),
            uniqueUsers: parseInt(countResult.rows[0].unique_users),
            activeSessions: allSessions.length,
            activeUsers: trueActive,
            idleUsers: allSessions.length - trueActive,
          },
        });
      } finally {
        client.release();
      }
    } catch (e) {
      console.error("Admin stats error:", e);
      res.json({ stats: [], summary: { totalEvents: 0, uniqueUsers: 0, activeSessions: 0 } });
    }
  });

  app.get("/api/admin/analytics/concurrent", adminAuth, async (req, res) => {
    try {
      const hours = Math.min(Math.max(parseInt(req.query.hours as string) || 24, 1), 168);
      const bucketMinutes = Math.min(Math.max(parseInt(req.query.bucketMinutes as string) || 5, 1), 60);
      const bucketSeconds = bucketMinutes * 60;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT
             (floor(extract(epoch from created_at::timestamptz) / $2) * $2 * 1000)::bigint AS bucket_ms,
             COUNT(DISTINCT session_id)::int AS count,
             COUNT(DISTINCT user_email) FILTER (WHERE user_email IS NOT NULL)::int AS named_count
           FROM analytics_events
           WHERE created_at::timestamptz >= $1::timestamptz
           GROUP BY bucket_ms
           ORDER BY bucket_ms ASC`,
          [since, bucketSeconds]
        );
        const buckets = result.rows.map((r: any) => ({
          time: new Date(Number(r.bucket_ms)).toISOString(),
          count: r.count,
          namedCount: r.named_count,
        }));
        let peak = 0;
        let peakTime: string | null = null;
        for (const b of buckets) {
          if (b.count > peak) {
            peak = b.count;
            peakTime = b.time;
          }
        }
        const allSessions = await storage.getActiveSessions(3);
        const now = Date.now();
        const current = allSessions.filter((s: any) => {
          const idleSeconds = Math.floor((now - new Date(s.lastSeen).getTime()) / 1000);
          return idleSeconds <= 90;
        }).length;
        res.json({ hours, bucketMinutes, buckets, peak, peakTime, current });
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error("Concurrent users history error:", e?.message || e);
      res.json({ hours: 24, bucketMinutes: 5, buckets: [], peak: 0, peakTime: null, current: 0 });
    }
  });

  app.get("/api/admin/crash-logs", adminAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getCrashLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("Failed to fetch crash logs:", error);
      res.status(500).json({ error: "Failed to fetch crash logs" });
    }
  });

  // PDF health monitor — manual trigger. Runs the same end-to-end probe the
  // scheduler runs but does NOT send an alert email (so admins can poke at it
  // freely without spamming themselves). Result is still persisted to crashLogs.
  app.get("/api/admin/health/pdf", adminAuth, async (_req, res) => {
    try {
      const { runPdfHealthCheck, getLastSuccessAt } = await import("./health-monitor");
      const result = await runPdfHealthCheck({ sendAlertOnFailure: false });
      res.json({ ...result, lastSuccessAt: getLastSuccessAt() });
    } catch (error: any) {
      console.error("PDF health check error:", error);
      res.status(500).json({ ok: false, error: error?.message || String(error) });
    }
  });

  // PDF health monitor — recent history (pulls from crashLogs, filtered to the
  // pdf-health-* event types).
  app.get("/api/admin/health/pdf/history", adminAuth, async (req, res) => {
    try {
      const limit = Math.min(500, parseInt(req.query.limit as string) || 100);
      const allLogs = await storage.getCrashLogs(limit * 4); // overfetch then filter
      const healthLogs = allLogs
        .filter((l) => l.eventType?.startsWith("pdf-health"))
        .slice(0, limit);
      res.json(healthLogs);
    } catch (error: any) {
      console.error("PDF health history error:", error);
      res.status(500).json({ error: "Failed to fetch health history" });
    }
  });
}
