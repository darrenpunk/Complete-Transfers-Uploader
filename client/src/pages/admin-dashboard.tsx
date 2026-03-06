import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Users, Activity, BarChart3, RefreshCw, Search, X, Upload, ShoppingCart, LayoutTemplate, Plus, Trash2, Zap, TrendingUp, FileText, Eye } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import type { TemplateSize } from "@shared/schema";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

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

function CustomerFeaturesManager() {
  const [featureEmail, setFeatureEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: assignments, refetch } = useQuery<any[]>({
    queryKey: ["admin-customer-templates"],
    queryFn: () => adminFetch("/api/admin/customer-templates"),
  });

  const enabledEmails = useMemo(() => {
    if (!assignments) return [] as string[];
    return assignments
      .filter((a: any) => a.templateId === DTF_QUICK_UPLOAD_ID)
      .map((a: any) => ({ id: a.id, email: a.customerCode }));
  }, [assignments]);

  const handleEnable = async () => {
    if (!featureEmail.trim()) return;
    if (enabledEmails.some((e: any) => e.email === featureEmail.trim())) return;
    setSaving(true);
    try {
      const token = getAdminToken();
      await fetch("/api/admin/customer-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customerCode: featureEmail.trim(), templateId: DTF_QUICK_UPLOAD_ID }),
      });
      setFeatureEmail("");
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
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-400" />
              <span className="text-sm font-medium">DTF 1000×550 Quick Upload Button</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Shows a special "Quick Upload" card on the product selector page. The customer uploads a PDF directly and it goes straight to cart — no canvas step.
            </p>
            <div className="flex gap-2 items-end">
              <div className="space-y-1 flex-1">
                <label className="text-xs text-muted-foreground">Customer Email</label>
                <Input
                  placeholder="customer@example.com"
                  value={featureEmail}
                  onChange={(e) => setFeatureEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEnable()}
                  className="h-9"
                />
              </div>
              <Button onClick={handleEnable} disabled={saving || !featureEmail.trim()} size="sm" className="h-9">
                <Plus className="h-4 w-4 mr-1" />
                Enable
              </Button>
            </div>
            {enabledEmails.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Enabled for:</p>
                {enabledEmails.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/20 rounded px-3 py-2">
                    <span className="text-sm text-yellow-300">{e.email}</span>
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
    queryKey: ["/api/template-sizes"],
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
  activeData, eventsData, statsData, visibleEvents, filteredEvents,
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Active Now" value={activeData?.activeCount ?? 0}
          sub={(activeData?.idleCount ?? 0) > 0 ? `+${activeData.idleCount} idle` : "Last 3 min"}
          icon={Users} gradient="bg-gradient-to-br from-blue-500 to-cyan-400" />
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
                  <TableHead>Page</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeData.sessions.map((s: any) => (
                  <TableRow key={s.sessionId}>
                    <TableCell className="text-xs">{s.userEmail || "Anonymous"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={s.status === "active"
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : "bg-gray-500/20 text-gray-400 border-gray-500/30"}>
                        {s.status === "active" ? "Active" : "Idle"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.currentPage || "/"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{timeSince(s.lastSeen)}</TableCell>
                  </TableRow>
                ))}
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

function Dashboard() {
  const [activeTab, setActiveTab] = useState<"analytics" | "customer-templates">("analytics");
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

  const handleRefresh = () => {
    refetchActive();
    refetchEvents();
    refetchStats();
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
            </div>
            {activeTab === "analytics" && (
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

        {activeTab === "analytics" && (
        <AnalyticsTab
          activeData={activeData}
          eventsData={eventsData}
          statsData={statsData}
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
