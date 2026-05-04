import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Users, Activity, BarChart3, RefreshCw, Search, X, Upload, ShoppingCart, LayoutTemplate, Plus, Trash2, Zap, TrendingUp, FileText, Eye, HeartPulse, Cpu, HardDrive, Clock, AlertTriangle, CheckCircle, Bug, Stethoscope, Play, Loader2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import type { TemplateSize } from "@shared/schema";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";

function parseBrowser(ua: string | null | undefined): string {
  if (!ua) return "—";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
  if (ua.includes("Chrome/") && !ua.includes("Edg/")) return "Chrome";
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
  if (ua.includes("Firefox/")) return "Firefox";
  return "Other";
}

function parseOS(ua: string | null | undefined): string {
  if (!ua) return "";
  if (ua.includes("Windows")) return "Win";
  if (ua.includes("Mac OS")) return "Mac";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("Linux")) return "Linux";
  return "";
}

function getAdminToken(): string | null {
  try { return sessionStorage.getItem("admin_token"); } catch { return null; }
}

function setAdminToken(token: string) {
  try { sessionStorage.setItem("admin_token", token); } catch {}
}

function clearAdminToken() {
  try { sessionStorage.removeItem("admin_token"); } catch {}
}

function adminFetch(url: string) {
  const token = getAdminToken();
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => {
    if (r.status === 401) {
      clearAdminToken();
      window.location.reload();
      throw new Error("Unauthorized");
    }
    return r.json();
  });
}

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success && data.token) {
        setAdminToken(data.token);
        onLogin();
      } else {
        setError(data.error || "Invalid password");
      }
    } catch {
      setError("Login failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Admin Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function formatTime(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch { return ts; }
}

function timeSince(ts: string) {
  try {
    const seconds = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  } catch { return ""; }
}

const HIDDEN_EVENT_TYPES = new Set(["page_view"]);

const eventColors: Record<string, string> = {
  login: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  upload: "bg-green-500/20 text-green-400 border-green-500/30",
  pdf_generate: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  add_to_cart: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  template_select: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

const DTF_QUICK_UPLOAD_ID = "__dtf_quick_upload__";
const VECTORIZATION_ONLY_ID = "__vectorization_only__";
const TEST_FEATURE_ID = "__test_feature__";

function FeatureToggleSection({
  magicId,
  title,
  description,
  accentColor,
  assignments,
  refetch,
}: {
  magicId: string;
  title: string;
  description: string;
  accentColor: "yellow" | "purple" | "cyan";
  assignments: any[] | undefined;
  refetch: () => void;
}) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const enabledEmails = useMemo(() => {
    if (!assignments) return [] as Array<{ id: string; email: string }>;
    return assignments
      .filter((a: any) => a.templateId === magicId)
      .map((a: any) => ({ id: a.id, email: a.customerCode }));
  }, [assignments, magicId]);

  const handleEnable = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (enabledEmails.some((e) => e.email === trimmed)) return;
    setSaving(true);
    try {
      const token = getAdminToken();
      await fetch("/api/admin/customer-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customerCode: trimmed, templateId: magicId }),
      });
      setEmail("");
      refetch();
    } catch (e) {
      console.error("Failed to enable feature", e);
    }
    setSaving(false);
  };

  const handleDisable = async (id: string) => {
    const token = getAdminToken();
    await fetch(`/api/admin/customer-templates/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    refetch();
  };

  const iconColor =
    accentColor === "yellow" ? "text-yellow-400"
    : accentColor === "purple" ? "text-purple-400"
    : "text-cyan-400";
  const pillBg =
    accentColor === "yellow" ? "bg-yellow-500/10 border-yellow-500/20"
    : accentColor === "purple" ? "bg-purple-500/10 border-purple-500/20"
    : "bg-cyan-500/10 border-cyan-500/20";
  const pillText =
    accentColor === "yellow" ? "text-yellow-300"
    : accentColor === "purple" ? "text-purple-300"
    : "text-cyan-300";

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className={`h-4 w-4 ${iconColor}`} />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex gap-2 items-end">
        <div className="space-y-1 flex-1">
          <label className="text-xs text-muted-foreground">Customer Email</label>
          <Input
            placeholder="customer@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleEnable()}
            className="h-9"
          />
        </div>
        <Button onClick={handleEnable} disabled={saving || !email.trim()} size="sm" className="h-9">
          <Plus className="h-4 w-4 mr-1" />
          Enable
        </Button>
      </div>
      {enabledEmails.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Enabled for:</p>
          {enabledEmails.map((e) => (
            <div key={e.id} className={`flex items-center justify-between ${pillBg} border rounded px-3 py-2`}>
              <span className={`text-sm ${pillText}`}>{e.email}</span>
              <button
                onClick={() => handleDisable(e.id)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">Not enabled for any customers yet.</p>
      )}
    </div>
  );
}

function CustomerFeaturesManager() {
  const { data: assignments, refetch } = useQuery<any[]>({
    queryKey: ["admin-customer-templates"],
    queryFn: () => adminFetch("/api/admin/customer-templates"),
  });

  return (
    <div className="space-y-6 mt-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" />
            Customer Features
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Enable special features for specific customers. These are separate from template restrictions.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <FeatureToggleSection
            magicId={DTF_QUICK_UPLOAD_ID}
            title="DTF 1000×550 Quick Upload Button"
            description='Shows a special "Quick Upload" card on the product selector page. The customer uploads a PDF directly and it goes straight to cart — no canvas step.'
            accentColor="yellow"
            assignments={assignments}
            refetch={refetch}
          />
          <FeatureToggleSection
            magicId={VECTORIZATION_ONLY_ID}
            title="Vectorisation Service — Hide Prices"
            description="When this customer opens the Vectorisation Service form, all €15.00 prices and the Service Type radio are hidden, and any submission is forced to vectorisation-only. They still see and can order all other products as normal."
            accentColor="purple"
            assignments={assignments}
            refetch={refetch}
          />
          <FeatureToggleSection
            magicId={TEST_FEATURE_ID}
            title="Test Feature — Diagnostic Banner"
            description="Diagnostic only. When enabled, this customer sees a cyan banner across the top of the product launcher confirming their email was recognised. Use it to verify end-to-end that the iframe is identifying the customer correctly. Has no effect on pricing, products, or anything else."
            accentColor="cyan"
            assignments={assignments}
            refetch={refetch}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function CustomerTemplatesManager() {
  const [newCustomerCode, setNewCustomerCode] = useState("");
  const [newTemplateId, setNewTemplateId] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: assignments, refetch: refetchAssignments } = useQuery<any[]>({
    queryKey: ["admin-customer-templates"],
    queryFn: () => adminFetch("/api/admin/customer-templates"),
  });

  const { data: allTemplates } = useQuery<TemplateSize[]>({
    queryKey: ["admin-all-templates"],
    queryFn: () => adminFetch("/api/admin/all-templates"),
  });

  const groupedAssignments = useMemo(() => {
    if (!assignments) return {};
    const grouped: Record<string, any[]> = {};
    for (const a of assignments) {
      if (a.templateId === DTF_QUICK_UPLOAD_ID) continue; // Managed in CustomerFeaturesManager
      if (!grouped[a.customerCode]) grouped[a.customerCode] = [];
      grouped[a.customerCode].push(a);
    }
    return grouped;
  }, [assignments]);

  const templateLabel = (id: string) => {
    const t = allTemplates?.find(t => t.id === id);
    return t ? `${t.label} (${t.id})` : id;
  };

  const handleAdd = async () => {
    if (!newCustomerCode.trim() || !newTemplateId) return;
    setSaving(true);
    try {
      const token = getAdminToken();
      await fetch("/api/admin/customer-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customerCode: newCustomerCode.trim(), templateId: newTemplateId }),
      });
      setNewCustomerCode("");
      setNewTemplateId("");
      refetchAssignments();
    } catch (e) {
      console.error("Failed to add assignment", e);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const token = getAdminToken();
    await fetch(`/api/admin/customer-templates/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    refetchAssignments();
  };

  const templateGroups = useMemo(() => {
    if (!allTemplates) return {};
    const groups: Record<string, TemplateSize[]> = {};
    for (const t of allTemplates) {
      const g = t.group || "Other";
      if (!groups[g]) groups[g] = [];
      groups[g].push(t);
    }
    return groups;
  }, [allTemplates]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Customer Template Assignment
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Assign a template to a specific customer. Templates with assignments become exclusive — only assigned customers will see them. All other templates remain visible to everyone.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Customer Email</label>
              <Input
                placeholder="customer@example.com"
                value={newCustomerCode}
                onChange={(e) => setNewCustomerCode(e.target.value)}
                className="w-[260px] h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Template</label>
              <Select value={newTemplateId} onValueChange={setNewTemplateId}>
                <SelectTrigger className="w-[280px] h-9">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(templateGroups).map(([group, templates]) => (
                    <div key={group}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{group}</div>
                      {templates.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label} ({t.id})
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={saving || !newCustomerCode.trim() || !newTemplateId} size="sm" className="h-9">
              <Plus className="h-4 w-4 mr-1" />
              Assign
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Current Assignments</CardTitle>
          <p className="text-xs text-muted-foreground">
            {Object.keys(groupedAssignments).length} customer(s) with template restrictions
          </p>
        </CardHeader>
        <CardContent>
          {Object.keys(groupedAssignments).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No customer-specific template assignments yet. All templates are visible to everyone.
            </p>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedAssignments).sort(([a], [b]) => a.localeCompare(b)).map(([code, items]) => (
                <div key={code} className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                      {code}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{items.length} template(s)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-1 bg-muted rounded px-2 py-1">
                        <span className="text-xs">{templateLabel(a.templateId)}</span>
                        <button
                          onClick={() => handleDelete(a.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const CHART_COLORS: Record<string, string> = {
  login: "#60a5fa",
  upload: "#34d399",
  pdf_generate: "#a78bfa",
  add_to_cart: "#fb923c",
  template_select: "#facc15",
};
const PIE_FALLBACK_COLORS = ["#60a5fa","#34d399","#a78bfa","#fb923c","#facc15","#f472b6","#38bdf8"];

function StatCard({ label, value, sub, icon: Icon, gradient }: {
  label: string; value: number | string; sub: string;
  icon: any; gradient: string;
}) {
  return (
    <Card className="relative overflow-hidden border-0">
      <div className={`absolute inset-0 opacity-10 ${gradient}`} />
      <CardHeader className="pb-1 relative">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="relative">
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

function AnalyticsTab({
  activeData, eventsData, statsData, concurrentData, concurrentRange, setConcurrentRange,
  visibleEvents, filteredEvents,
  allEventTypes, allUsers, hasActiveFilters, clearFilters,
  userFilter, setUserFilter, eventFilter, setEventFilter, timeFilter, setTimeFilter,
}: any) {
  const totalUploads = useMemo(() => visibleEvents.filter((e: any) => e.eventType === "upload").length, [visibleEvents]);
  const totalCart = useMemo(() => visibleEvents.filter((e: any) => e.eventType === "add_to_cart").length, [visibleEvents]);
  const totalPdf = useMemo(() => visibleEvents.filter((e: any) => e.eventType === "pdf_generate").length, [visibleEvents]);
  const conversionRate = totalUploads > 0 ? Math.round((totalCart / totalUploads) * 100) : 0;

  // Build bar chart data from daily stats — one row per date
  const barChartData = useMemo(() => {
    if (!statsData?.stats) return [];
    const visibleStats = statsData.stats.filter((s: any) => !HIDDEN_EVENT_TYPES.has(s.eventType));
    const dateMap: Record<string, Record<string, number>> = {};
    visibleStats.forEach((s: any) => {
      if (!dateMap[s.date]) dateMap[s.date] = {};
      dateMap[s.date][s.eventType] = s.count;
    });
    return Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({
        date: date.slice(5), // MM-DD
        ...counts,
      }));
  }, [statsData]);

  // Build pie chart data from all-time visible events
  const pieData = useMemo(() => {
    const counts: Record<string, number> = {};
    visibleEvents.forEach((e: any) => {
      counts[e.eventType] = (counts[e.eventType] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [visibleEvents]);

  // Top users by event count
  const topUsers = useMemo(() => {
    const counts: Record<string, number> = {};
    visibleEvents.forEach((e: any) => {
      const key = e.userEmail || "Anonymous";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([email, count]) => ({ email, count }));
  }, [visibleEvents]);

  const uniqueEventTypes = useMemo(() => {
    const types = new Set<string>();
    barChartData.forEach(row => Object.keys(row).forEach(k => k !== "date" && types.add(k)));
    return Array.from(types);
  }, [barChartData]);

  // Funnel data
  const totalSessions = (activeData?.activeCount ?? 0) + (activeData?.idleCount ?? 0);
  const funnelSteps = [
    { label: "Sessions now", value: totalSessions, color: "bg-blue-500" },
    { label: "Uploads (all time)", value: totalUploads, color: "bg-green-500" },
    { label: "PDFs generated", value: totalPdf, color: "bg-purple-500" },
    { label: "Added to cart", value: totalCart, color: "bg-orange-500" },
  ];
  const funnelMax = Math.max(...funnelSteps.map(s => s.value), 1);

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <StatCard label="Active Now" value={activeData?.activeCount ?? 0}
          sub={(activeData?.idleCount ?? 0) > 0 ? `+${activeData.idleCount} idle` : "Last 3 min"}
          icon={Users} gradient="bg-gradient-to-br from-blue-500 to-cyan-400" />
        <StatCard label="Peak (24h)" value={concurrentData?.peak ?? 0}
          sub={concurrentData?.peakTime
            ? new Date(concurrentData.peakTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "No data"}
          icon={TrendingUp} gradient="bg-gradient-to-br from-fuchsia-500 to-pink-400" />
        <StatCard label="Total Events" value={statsData?.summary?.totalEvents ?? 0}
          sub="All time" icon={Activity}
          gradient="bg-gradient-to-br from-violet-500 to-purple-400" />
        <StatCard label="Unique Users" value={statsData?.summary?.uniqueUsers ?? 0}
          sub="With email" icon={BarChart3}
          gradient="bg-gradient-to-br from-emerald-500 to-teal-400" />
        <StatCard label="Uploads" value={totalUploads}
          sub="Files uploaded" icon={Upload}
          gradient="bg-gradient-to-br from-green-500 to-lime-400" />
        <StatCard label="Conversion" value={`${conversionRate}%`}
          sub={`${totalCart} cart adds`} icon={TrendingUp}
          gradient="bg-gradient-to-br from-orange-500 to-amber-400" />
      </div>

      {/* Concurrent users over time */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Concurrent Users — {concurrentRange === "168" ? "Last 7 days" : "Last 24 hours"}
              {(concurrentData?.current ?? 0) > 0 && (
                <span className="ml-1 inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-green-400 font-normal">{concurrentData.current} now</span>
                </span>
              )}
            </CardTitle>
            <div className="flex border rounded-md overflow-hidden">
              <button
                onClick={() => setConcurrentRange("24")}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${concurrentRange === "24" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                data-testid="button-concurrent-24h"
              >
                24h
              </button>
              <button
                onClick={() => setConcurrentRange("168")}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${concurrentRange === "168" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                data-testid="button-concurrent-7d"
              >
                7d
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {concurrentData?.buckets?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={concurrentData.buckets} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="concurrentFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickFormatter={(v: string) => {
                    const d = new Date(v);
                    return concurrentRange === "168"
                      ? d.toLocaleDateString([], { month: "short", day: "numeric" })
                      : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  }}
                  minTickGap={40}
                />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#f9fafb" }}
                  labelFormatter={(v: string) => new Date(v).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  formatter={(value: any, name: string) => [value, name === "count" ? "Sessions" : "Logged-in users"]}
                />
                <Area type="monotone" dataKey="count" stroke="#22d3ee" strokeWidth={2} fill="url(#concurrentFill)" />
                <Area type="monotone" dataKey="namedCount" stroke="#a78bfa" strokeWidth={1.5} fill="none" strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
              No activity in this window yet
            </div>
          )}
          <p className="text-xs text-muted-foreground pt-2">
            Distinct sessions active per {concurrentRange === "168" ? "60-min" : "5-min"} bucket. Dashed line shows logged-in users only.
          </p>
        </CardContent>
      </Card>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar chart — events over 7 days */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Events — Last 7 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#f9fafb" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  {uniqueEventTypes.map(type => (
                    <Bar key={type} dataKey={type} stackId="a"
                      fill={CHART_COLORS[type] || PIE_FALLBACK_COLORS[0]}
                      radius={uniqueEventTypes.indexOf(type) === uniqueEventTypes.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
            )}
          </CardContent>
        </Card>

        {/* Pie chart — event type breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Event Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <div>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={72}
                      paddingAngle={3} dataKey="value">
                      {pieData.map((entry, i) => (
                        <Cell key={entry.name} fill={CHART_COLORS[entry.name] || PIE_FALLBACK_COLORS[i % PIE_FALLBACK_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-1">
                  {pieData.map((entry, i) => (
                    <div key={entry.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: CHART_COLORS[entry.name] || PIE_FALLBACK_COLORS[i % PIE_FALLBACK_COLORS.length] }} />
                        <span className="text-muted-foreground">{entry.name}</span>
                      </div>
                      <span className="font-mono font-medium">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Funnel + Top Users row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Conversion funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Conversion Funnel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            {funnelSteps.map((step, i) => (
              <div key={step.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{step.label}</span>
                  <span className="font-mono font-semibold">{step.value}</span>
                </div>
                <div className="h-7 bg-muted rounded-md overflow-hidden">
                  <div
                    className={`h-full ${step.color} rounded-md flex items-center px-2 text-xs font-medium text-white transition-all duration-500`}
                    style={{ width: `${Math.max((step.value / funnelMax) * 100, step.value > 0 ? 4 : 0)}%`, minWidth: step.value > 0 ? 28 : 0 }}
                  >
                    {step.value > 0 && (i > 0 ? `${Math.round((step.value / funnelSteps[i - 1].value) * 100) || 0}%` : "")}
                  </div>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-1">Upload → cart conversion: <span className="font-semibold text-orange-400">{conversionRate}%</span></p>
          </CardContent>
        </Card>

        {/* Top users */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Top Active Users
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            {topUsers.length > 0 ? (
              <div className="space-y-2">
                {topUsers.map(({ email, count }, i) => (
                  <div key={email} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="h-6 bg-muted rounded overflow-hidden">
                        <div
                          className="h-full bg-primary/40 rounded flex items-center px-2"
                          style={{ width: `${Math.max((count / topUsers[0].count) * 100, 8)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs truncate max-w-[140px] text-muted-foreground" title={email}>{email}</span>
                    <span className="text-xs font-mono font-semibold w-8 text-right">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No user data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Active sessions */}
      {activeData?.sessions?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              Live Sessions
              <span className="ml-1 inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-green-400 font-normal">{activeData.activeCount} active</span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Browser</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeData.sessions.map((s: any) => {
                  const ua = s.metadata?.userAgent;
                  const browser = parseBrowser(ua);
                  const os = parseOS(ua);
                  return (
                  <TableRow key={s.sessionId}>
                    <TableCell className="text-xs">{s.userEmail || "Anonymous"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={s.status === "active"
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : "bg-gray-500/20 text-gray-400 border-gray-500/30"}>
                        {s.status === "active" ? "Active" : "Idle"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {browser !== "—" ? (
                        <span title={ua}>{browser}{os ? ` · ${os}` : ""}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.currentPage || "/"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{timeSince(s.lastSeen)}</TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Recent Activity
            </CardTitle>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                <X className="h-3 w-3 mr-1" />
                Clear filters
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger className="w-[150px] h-8 text-xs">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="5">Last 5 min</SelectItem>
                <SelectItem value="15">Last 15 min</SelectItem>
                <SelectItem value="30">Last 30 min</SelectItem>
                <SelectItem value="60">Last hour</SelectItem>
                <SelectItem value="360">Last 6 hours</SelectItem>
                <SelectItem value="1440">Last 24 hours</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input placeholder="Filter by user..." value={userFilter} onChange={(e) => setUserFilter(e.target.value)}
                className="h-8 w-[190px] text-xs pl-7" list="user-suggestions" />
              <datalist id="user-suggestions">{allUsers.map((u: string) => <option key={u} value={u} />)}</datalist>
            </div>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-[150px] h-8 text-xs">
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {allEventTypes.map((t: string) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <span className="flex items-center text-xs text-muted-foreground">
                {filteredEvents.length} of {eventsData?.events?.length ?? 0} events
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredEvents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{formatTime(e.createdAt)}</TableCell>
                    <TableCell className="text-xs">{e.userEmail || <span className="text-muted-foreground italic">Anonymous</span>}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={eventColors[e.eventType] || ""}>
                        {e.eventType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono max-w-[200px] truncate text-muted-foreground">
                      {e.metadata ? JSON.stringify(e.metadata) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {hasActiveFilters ? "No events match your filters" : "No events recorded yet"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MemoryBar({ label, usedMB, totalMB, warnMB }: { label: string; usedMB: number; totalMB?: number; warnMB?: number }) {
  const max = totalMB || Math.max(usedMB * 1.5, 512);
  const pct = Math.min((usedMB / max) * 100, 100);
  const isWarn = warnMB ? usedMB > warnMB : pct > 75;
  const isCrit = warnMB ? usedMB > warnMB * 1.15 : pct > 90;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={isCrit ? "text-red-500 font-medium" : isWarn ? "text-yellow-500" : "text-foreground"}>{usedMB}MB{totalMB ? ` / ${totalMB}MB` : ""}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${isCrit ? "bg-red-500" : isWarn ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CrashLogsTab() {
  const { data: crashLogs, isLoading } = useQuery({
    queryKey: ["admin-crash-logs"],
    queryFn: () => adminFetch("/api/admin/crash-logs?limit=100"),
    refetchInterval: 30000,
  });

  const eventTypeColors: Record<string, string> = {
    server_start: "bg-green-500/10 text-green-500 border-green-500/30",
    uncaught_exception: "bg-red-500/10 text-red-500 border-red-500/30",
    unhandled_rejection: "bg-red-500/10 text-red-500 border-red-500/30",
    sigterm: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
    sigint: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
    memory_warning: "bg-orange-500/10 text-orange-500 border-orange-500/30",
    memory_critical: "bg-red-500/10 text-red-500 border-red-500/30",
    suspected_crash: "bg-red-600/20 text-red-400 border-red-600/40",
    db_connection_reset: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  };

  const eventTypeIcons: Record<string, typeof Bug> = {
    server_start: CheckCircle,
    uncaught_exception: AlertTriangle,
    unhandled_rejection: AlertTriangle,
    sigterm: Clock,
    sigint: Clock,
    memory_warning: Cpu,
    memory_critical: AlertTriangle,
    suspected_crash: Bug,
    db_connection_reset: Clock,
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading crash logs...</div>;
  }

  const logs = Array.isArray(crashLogs) ? crashLogs : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-5 w-5" />
          Crash & Event Logs ({logs.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No crash logs recorded yet.</div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {logs.map((log: any) => {
              const IconComp = eventTypeIcons[log.eventType] || Bug;
              const colorClass = eventTypeColors[log.eventType] || "bg-muted text-muted-foreground border-border";
              const date = new Date(log.createdAt);
              const timeStr = date.toLocaleString();
              const uptimeMin = log.uptimeSeconds ? Math.round(log.uptimeSeconds / 60) : null;

              return (
                <div key={log.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={colorClass}>
                        <IconComp className="h-3 w-3 mr-1" />
                        {log.eventType}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{timeStr}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {log.memoryRssMb != null && (
                        <span>RSS: {log.memoryRssMb}MB</span>
                      )}
                      {log.memoryHeapMb != null && (
                        <span>Heap: {log.memoryHeapMb}MB</span>
                      )}
                      {uptimeMin != null && (
                        <span>Uptime: {uptimeMin}m</span>
                      )}
                      {log.activeOps != null && (
                        <span>Ops: {log.activeOps}/{log.queuedOps}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm">{log.message}</p>
                  {log.details?.stack && (
                    <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto max-h-32 whitespace-pre-wrap">{log.details.stack}</pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HealthProbesTab() {
  const [runningProbe, setRunningProbe] = useState<string | null>(null);

  const { data: pdfHistory, refetch: refetchPdf } = useQuery<any[]>({
    queryKey: ["admin-health-pdf-history"],
    queryFn: () => adminFetch("/api/admin/health/pdf/history?limit=50"),
    refetchInterval: 60000,
  });

  const { data: uploadHistory, refetch: refetchUpload } = useQuery<any[]>({
    queryKey: ["admin-health-upload-history"],
    queryFn: () => adminFetch("/api/admin/health/upload/history?limit=50"),
    refetchInterval: 60000,
  });

  const refetchAll = () => { refetchPdf(); refetchUpload(); };

  const allHistory = useMemo(() => {
    const items: any[] = [];
    if (pdfHistory) items.push(...pdfHistory);
    if (uploadHistory) items.push(...uploadHistory);
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items;
  }, [pdfHistory, uploadHistory]);

  const isRunResult = (t: string) => t.endsWith("-ok") || t.endsWith("-fail") || t.endsWith("-skip");

  const getLatest = (prefix: string) => {
    return allHistory.find(h => h.eventType.startsWith(prefix) && isRunResult(h.eventType));
  };

  const latestLight = getLatest("pdf-health-");
  const latestStress = getLatest("pdf-stress-");
  const latestUpload = getLatest("upload-health-");

  const [probeError, setProbeError] = useState<string | null>(null);

  const triggerProbe = async (type: "light" | "stress" | "upload") => {
    setRunningProbe(type);
    setProbeError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const endpoint = type === "light" ? "/api/admin/health/pdf"
        : type === "stress" ? "/api/admin/health/pdf/stress"
        : "/api/admin/health/upload";
      const token = getAdminToken();
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        setProbeError(`${type} probe returned HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      refetchAll();
    } catch (e: any) {
      setProbeError(e.name === "AbortError" ? `${type} probe timed out after 2 minutes` : `${type} probe failed: ${e.message}`);
    } finally {
      clearTimeout(timeout);
      setRunningProbe(null);
    }
  };

  const probeStatus = (entry: any) => {
    if (!entry) return { label: "No data", color: "text-muted-foreground", bg: "bg-muted" };
    const t = entry.eventType;
    if (t.endsWith("-ok")) return { label: "OK", color: "text-green-400", bg: "bg-green-500/20 border-green-500/30" };
    if (t.endsWith("-skip")) return { label: "Skipped", color: "text-yellow-400", bg: "bg-yellow-500/20 border-yellow-500/30" };
    return { label: "Failed", color: "text-red-400", bg: "bg-red-500/20 border-red-500/30" };
  };

  const probeDuration = (entry: any) => {
    if (!entry?.details?.durationMs) return "—";
    const ms = entry.details.durationMs;
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  };

  const probeCards = [
    { key: "light", title: "Light Probe", desc: "A6 placeholder PDF generation", interval: "Every 15 min", latest: latestLight },
    { key: "stress", title: "Stress Probe", desc: "7.9MB Rainbow Dog on A3", interval: "Every 60 min", latest: latestStress },
    { key: "upload", title: "Upload Pipeline", desc: "Full upload → convert → thumbnail", interval: "Every 30 min", latest: latestUpload },
  ] as const;

  const eventTypeLabel = (t: string) => {
    if (t.startsWith("pdf-health-")) return "Light";
    if (t.startsWith("pdf-stress-")) return "Stress";
    if (t.startsWith("upload-health-")) return "Upload";
    return t;
  };

  const eventStatusBadge = (t: string) => {
    if (t.endsWith("-ok")) return <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">OK</Badge>;
    if (t.endsWith("-skip")) return <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">Skip</Badge>;
    return <Badge variant="destructive" className="text-xs">Fail</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Health Probes</h2>
        </div>
        <Button variant="outline" size="sm" onClick={refetchAll}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      {probeError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-red-400">{probeError}</span>
          <button onClick={() => setProbeError(null)} className="text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {probeCards.map(({ key, title, desc, interval, latest }) => {
          const status = probeStatus(latest);
          const isRunning = runningProbe === key;
          return (
            <Card key={key}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{title}</div>
                  <Badge variant="outline" className={`${status.bg} ${status.color} text-xs`}>{status.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{desc}</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Schedule</span>
                    <span>{interval}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last run</span>
                    <span>{latest ? timeSince(latest.createdAt) : "Never"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span>{probeDuration(latest)}</span>
                  </div>
                  {latest?.memoryRssMb && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RSS at run</span>
                      <span>{latest.memoryRssMb}MB</span>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs"
                  disabled={!!runningProbe}
                  onClick={() => triggerProbe(key)}
                >
                  {isRunning ? (
                    <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Running...</>
                  ) : (
                    <><Play className="h-3 w-3 mr-1.5" />Run Now</>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Probe History (last 50 per type)</CardTitle>
        </CardHeader>
        <CardContent>
          {allHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No probe history yet.</p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Type</TableHead>
                    <TableHead className="w-[70px]">Status</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-[80px] text-right">Duration</TableHead>
                    <TableHead className="w-[80px] text-right">RSS</TableHead>
                    <TableHead className="w-[140px] text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allHistory.slice(0, 100).map((entry: any) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs font-medium">{eventTypeLabel(entry.eventType)}</TableCell>
                      <TableCell>{eventStatusBadge(entry.eventType)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">{entry.message}</TableCell>
                      <TableCell className="text-xs text-right">{entry.details?.durationMs ? `${(entry.details.durationMs / 1000).toFixed(1)}s` : "—"}</TableCell>
                      <TableCell className="text-xs text-right">{entry.memoryRssMb ? `${entry.memoryRssMb}MB` : "—"}</TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">{timeSince(entry.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ServerHealthTab() {
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => fetch("/health").then(r => r.json()),
    refetchInterval: 10000,
  });

  const [history, setHistory] = useState<Array<{ time: string; rss: number; heap: number; active: number; queued: number }>>([]);

  useEffect(() => {
    if (!health?.operations?.memory) return;
    setHistory(prev => {
      const entry = {
        time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        rss: health.operations.memory.rssMB,
        heap: health.operations.memory.heapUsedMB,
        active: health.operations.active,
        queued: health.operations.queued,
      };
      const updated = [...prev, entry];
      return updated.slice(-30);
    });
  }, [health]);

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading health data...</div>;
  }

  const ops = health?.operations;
  const mem = ops?.memory;
  const checks = health?.checks;
  const isHealthy = health?.status === "ok";
  const uptimeSeconds = parseInt(checks?.uptime || "0");
  const uptimeStr = uptimeSeconds >= 86400
    ? `${Math.floor(uptimeSeconds / 86400)}d ${Math.floor((uptimeSeconds % 86400) / 3600)}h`
    : uptimeSeconds >= 3600
    ? `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`
    : `${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Server Health</h2>
          {isHealthy ? (
            <Badge variant="outline" className="border-green-500 text-green-500"><CheckCircle className="h-3 w-3 mr-1" />Healthy</Badge>
          ) : (
            <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Degraded</Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Clock className="h-3.5 w-3.5" />Uptime</div>
            <div className="text-xl font-bold">{uptimeStr}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Cpu className="h-3.5 w-3.5" />Active Ops</div>
            <div className="text-xl font-bold">{ops?.active || 0}<span className="text-sm text-muted-foreground font-normal"> / {ops?.maxConcurrent || 3}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Clock className="h-3.5 w-3.5" />Queued</div>
            <div className="text-xl font-bold">{ops?.queued || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><HardDrive className="h-3.5 w-3.5" />Memory (RSS)</div>
            <div className="text-xl font-bold">{mem?.rssMB || 0}<span className="text-sm text-muted-foreground font-normal">MB</span></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Memory Usage</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <MemoryBar label="RSS (Total Process)" usedMB={mem?.rssMB || 0} totalMB={4096} warnMB={2048} />
            <MemoryBar label="Heap Used" usedMB={mem?.heapUsedMB || 0} totalMB={mem?.heapTotalMB || 2048} warnMB={1024} />
            <MemoryBar label="External (Buffers)" usedMB={mem?.externalMB || 0} totalMB={1024} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Operation Stats</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-500">{ops?.totalProcessed || 0}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-500">{ops?.totalQueued || 0}</div>
                <div className="text-xs text-muted-foreground">Were Queued</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-500">{ops?.totalRejected || 0}</div>
                <div className="text-xs text-muted-foreground">Rejected</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {ops?.activeOps?.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Active Operations</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operation</TableHead>
                  <TableHead>Running</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ops.activeOps.map((op: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm">{op.label}</TableCell>
                    <TableCell>{op.runningSeconds}s</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {history.length > 3 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Memory Over Time (last {history.length} samples, ~10s interval)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} unit="MB" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="rss" name="RSS" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="heap" name="Heap" fill="hsl(var(--primary) / 0.5)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">System Checks</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {checks && Object.entries(checks).filter(([k]) => k !== 'uptime' && k !== 'memory').map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                {val === 'ok' ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-red-500" />}
                <span className="text-sm capitalize">{key.replace(/_/g, ' ')}</span>
                <Badge variant={val === 'ok' ? 'outline' : 'destructive'} className="ml-auto text-xs">{String(val)}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Dashboard() {
  const [activeTab, setActiveTab] = useState<"analytics" | "customer-templates" | "server-health" | "health-probes" | "crash-logs">("analytics");
  const [userFilter, setUserFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all");

  const { data: activeData, refetch: refetchActive } = useQuery({
    queryKey: ["admin-active"],
    queryFn: () => adminFetch("/api/admin/analytics/active"),
    refetchInterval: 30000,
  });

  const { data: eventsData, refetch: refetchEvents } = useQuery({
    queryKey: ["admin-events"],
    queryFn: () => adminFetch("/api/admin/analytics/events?limit=200"),
    refetchInterval: 30000,
  });

  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminFetch("/api/admin/analytics/stats?days=7"),
    refetchInterval: 30000,
  });

  const [concurrentRange, setConcurrentRange] = useState<"24" | "168">("24");
  const { data: concurrentData, refetch: refetchConcurrent } = useQuery({
    queryKey: ["admin-concurrent", concurrentRange],
    queryFn: () => adminFetch(`/api/admin/analytics/concurrent?hours=${concurrentRange}&bucketMinutes=${concurrentRange === "168" ? 60 : 5}`),
    refetchInterval: 30000,
    enabled: activeTab === "analytics",
  });

  const handleRefresh = () => {
    refetchActive();
    refetchEvents();
    refetchStats();
    refetchConcurrent();
    if (activeTab === "health-probes") {
      queryClient.invalidateQueries({ queryKey: ["admin-health-pdf-history"] });
      queryClient.invalidateQueries({ queryKey: ["admin-health-upload-history"] });
    }
  };

  const visibleEvents = useMemo(() => {
    if (!eventsData?.events) return [];
    return eventsData.events.filter((e: any) => !HIDDEN_EVENT_TYPES.has(e.eventType));
  }, [eventsData]);

  const allEventTypes = useMemo(() => {
    const types = new Set<string>();
    visibleEvents.forEach((e: any) => types.add(e.eventType));
    return Array.from(types).sort();
  }, [visibleEvents]);

  const allUsers = useMemo(() => {
    const users = new Set<string>();
    visibleEvents.forEach((e: any) => {
      if (e.userEmail) users.add(e.userEmail);
    });
    return Array.from(users).sort();
  }, [visibleEvents]);

  const filteredEvents = useMemo(() => {
    return visibleEvents.filter((e: any) => {
      if (eventFilter !== "all" && e.eventType !== eventFilter) return false;

      if (userFilter) {
        const email = (e.userEmail || "Anonymous").toLowerCase();
        if (!email.includes(userFilter.toLowerCase())) return false;
      }

      if (timeFilter !== "all") {
        const eventTime = new Date(e.createdAt).getTime();
        const now = Date.now();
        const minutes = parseInt(timeFilter);
        if (now - eventTime > minutes * 60 * 1000) return false;
      }

      return true;
    });
  }, [eventsData, eventFilter, userFilter, timeFilter]);

  const hasActiveFilters = userFilter || eventFilter !== "all" || timeFilter !== "all";

  const clearFilters = () => {
    setUserFilter("");
    setEventFilter("all");
    setTimeFilter("all");
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <div className="flex items-center gap-2">
            <div className="flex border rounded-md overflow-hidden">
              <button
                onClick={() => setActiveTab("analytics")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === "analytics" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                <Activity className="h-4 w-4 inline mr-1.5" />
                Analytics
              </button>
              <button
                onClick={() => setActiveTab("customer-templates")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === "customer-templates" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                <LayoutTemplate className="h-4 w-4 inline mr-1.5" />
                Customer Templates
              </button>
              <button
                onClick={() => setActiveTab("server-health")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === "server-health" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                <HeartPulse className="h-4 w-4 inline mr-1.5" />
                Server Health
              </button>
              <button
                onClick={() => setActiveTab("health-probes")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === "health-probes" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                <Stethoscope className="h-4 w-4 inline mr-1.5" />
                Health Probes
              </button>
              <button
                onClick={() => setActiveTab("crash-logs")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === "crash-logs" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                <Bug className="h-4 w-4 inline mr-1.5" />
                Crash Logs
              </button>
            </div>
            {(activeTab === "analytics" || activeTab === "server-health" || activeTab === "crash-logs" || activeTab === "health-probes") && (
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            )}
          </div>
        </div>

        {activeTab === "customer-templates" && (
          <div className="space-y-8">
            <CustomerTemplatesManager />
            <CustomerFeaturesManager />
          </div>
        )}

        {activeTab === "server-health" && (
          <ServerHealthTab />
        )}

        {activeTab === "health-probes" && (
          <HealthProbesTab />
        )}

        {activeTab === "crash-logs" && (
          <CrashLogsTab />
        )}

        {activeTab === "analytics" && (
        <AnalyticsTab
          activeData={activeData}
          eventsData={eventsData}
          statsData={statsData}
          concurrentData={concurrentData}
          concurrentRange={concurrentRange}
          setConcurrentRange={setConcurrentRange}
          visibleEvents={visibleEvents}
          filteredEvents={filteredEvents}
          allEventTypes={allEventTypes}
          allUsers={allUsers}
          hasActiveFilters={hasActiveFilters}
          clearFilters={clearFilters}
          userFilter={userFilter}
          setUserFilter={setUserFilter}
          eventFilter={eventFilter}
          setEventFilter={setEventFilter}
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
        />
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!getAdminToken());

  if (!isLoggedIn) {
    return <LoginForm onLogin={() => setIsLoggedIn(true)} />;
  }

  return <Dashboard />;
}
