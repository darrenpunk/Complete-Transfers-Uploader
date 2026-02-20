import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Users, Activity, BarChart3, RefreshCw, Search, X, Upload, ShoppingCart } from "lucide-react";

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

function Dashboard() {
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
          <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Active Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{activeData?.activeCount ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                {(activeData?.idleCount ?? 0) > 0 
                  ? `+ ${activeData.idleCount} idle`
                  : "Last 3 minutes"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Total Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{statsData?.summary?.totalEvents ?? 0}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Unique Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{statsData?.summary?.uniqueUsers ?? 0}</div>
              <p className="text-xs text-muted-foreground">With email</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Total Uploads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{visibleEvents.filter((e: any) => e.eventType === 'upload').length}</div>
              <p className="text-xs text-muted-foreground">Files uploaded</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Total Add to Cart
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{visibleEvents.filter((e: any) => e.eventType === 'add_to_cart').length}</div>
              <p className="text-xs text-muted-foreground">Orders added</p>
            </CardContent>
          </Card>
        </div>

        {activeData?.sessions?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
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
                      <TableCell>{s.userEmail || "Anonymous"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={s.status === "active" 
                          ? "bg-green-500/20 text-green-400 border-green-500/30" 
                          : "bg-gray-500/20 text-gray-400 border-gray-500/30"}>
                          {s.status === "active" ? "Active" : "Idle"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.currentPage || "/"}</TableCell>
                      <TableCell>{timeSince(s.lastSeen)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {statsData?.stats?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Daily Stats (Last 7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Event Type</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statsData.stats.filter((s: any) => !HIDDEN_EVENT_TYPES.has(s.eventType)).map((s: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{s.date}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={eventColors[s.eventType] || ""}>
                          {s.eventType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{s.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                  <X className="h-3 w-3 mr-1" />
                  Clear filters
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="5">Last 5 minutes</SelectItem>
                  <SelectItem value="15">Last 15 minutes</SelectItem>
                  <SelectItem value="30">Last 30 minutes</SelectItem>
                  <SelectItem value="60">Last hour</SelectItem>
                  <SelectItem value="360">Last 6 hours</SelectItem>
                  <SelectItem value="1440">Last 24 hours</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Filter by user..."
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="h-8 w-[200px] text-xs pl-7"
                  list="user-suggestions"
                />
                <datalist id="user-suggestions">
                  {allUsers.map(u => <option key={u} value={u} />)}
                </datalist>
              </div>

              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Event type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  {allEventTypes.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <div className="flex items-center text-xs text-muted-foreground">
                  Showing {filteredEvents.length} of {eventsData?.events?.length ?? 0} events
                </div>
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
                      <TableCell className="text-xs whitespace-nowrap">{formatTime(e.createdAt)}</TableCell>
                      <TableCell className="text-xs">{e.userEmail || "Anonymous"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={eventColors[e.eventType] || ""}>
                          {e.eventType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono max-w-[200px] truncate">
                        {e.metadata ? JSON.stringify(e.metadata) : "\u2014"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {hasActiveFilters ? "No events match your filters" : "No events recorded yet"}
              </p>
            )}
          </CardContent>
        </Card>
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
