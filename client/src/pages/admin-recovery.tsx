import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Search, Download, ArrowLeft, FileWarning, Loader2, FileDown } from "lucide-react";

function getAdminToken(): string | null {
  try { return sessionStorage.getItem("admin_token"); } catch { return null; }
}
function setAdminToken(token: string) {
  try { sessionStorage.setItem("admin_token", token); } catch {}
}
function clearAdminToken() {
  try { sessionStorage.removeItem("admin_token"); } catch {}
}

interface LogoSummary {
  id: string;
  projectId: string;
  originalName: string | null;
  mimeType: string | null;
  originalMimeType: string | null;
  size: number | null;
  hasOriginal: boolean;
  originalIsPreservedPdf: boolean;
  downloadExt: string | null;
}
interface ProjectSummary {
  id: string;
  name: string | null;
  uploaderEmail: string | null;
  uploaderId: string | null;
  status: string | null;
  createdAt: string | null;
  quantity: number | null;
}
interface RecoveryResult {
  project: ProjectSummary;
  logos: LogoSummary[];
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
            Artwork Recovery
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

function formatBytes(n: number | null): string {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function formatDate(ts: string | null): string {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

export default function AdminRecovery() {
  const [authed, setAuthed] = useState(!!getAdminToken());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<RecoveryResult[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />;

  const runSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const res = await fetch(`/api/admin/recovery/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.status === 401) {
        clearAdminToken();
        setAuthed(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Search failed");
        setResults([]);
      } else {
        setResults(data.results || []);
      }
    } catch {
      setError("Search failed");
      setResults([]);
    }
    setLoading(false);
  };

  const downloadOriginal = async (logo: LogoSummary, projectName: string | null) => {
    setDownloadingId(logo.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/recovery/original/${logo.id}`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.status === 401) {
        clearAdminToken();
        setAuthed(false);
        return;
      }
      if (!res.ok) {
        let msg = "Download failed";
        try { msg = (await res.json()).error || msg; } catch {}
        setError(msg);
        return;
      }
      const blob = await res.blob();
      const ext = logo.downloadExt || "pdf";
      const base = (logo.originalName || projectName || `original-${logo.id}`).replace(/\.[^.]+$/, "");
      const filename = `${base}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Download failed");
    }
    setDownloadingId(null);
  };

  const totalLogos = results.reduce((acc, r) => acc + r.logos.length, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <FileDown className="h-6 w-6" />
              Artwork Recovery
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Look up a customer's order and download their original uploaded artwork if a generated output ever goes wrong.
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Dashboard
            </Button>
          </Link>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={runSearch} className="flex gap-2">
              <Input
                placeholder="Customer email, project ID, or logo ID"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              <Button type="submit" disabled={loading || !query.trim()} className="gap-1 shrink-0">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </Button>
            </form>
            {error && <p className="text-sm text-destructive mt-3">{error}</p>}
          </CardContent>
        </Card>

        {searched && !loading && results.length === 0 && !error && (
          <div className="text-center text-muted-foreground py-12 flex flex-col items-center gap-2">
            <FileWarning className="h-8 w-8" />
            <p>No orders found for that search.</p>
            <p className="text-xs">Try the exact customer email, or a project/logo ID.</p>
          </div>
        )}

        {results.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Found {results.length} order{results.length === 1 ? "" : "s"} · {totalLogos} artwork file{totalLogos === 1 ? "" : "s"}
          </p>
        )}

        {results.map((r) => (
          <Card key={r.project.id}>
            <CardHeader>
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                {r.project.name || "(untitled)"}
                {r.project.status && <Badge variant="secondary">{r.project.status}</Badge>}
              </CardTitle>
              <div className="text-xs text-muted-foreground space-x-3">
                <span>{r.project.uploaderEmail || "no email"}</span>
                <span>·</span>
                <span>{formatDate(r.project.createdAt)}</span>
                <span>·</span>
                <span className="font-mono">{r.project.id}</span>
              </div>
            </CardHeader>
            <CardContent>
              {r.logos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No artwork files on this order.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Original file</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Recover</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.logos.map((logo) => (
                      <TableRow key={logo.id}>
                        <TableCell className="max-w-[280px] truncate" title={logo.originalName || logo.id}>
                          {logo.originalName || <span className="text-muted-foreground">(unnamed)</span>}
                          {!logo.originalIsPreservedPdf && logo.hasOriginal && (
                            <span className="ml-2 text-xs text-muted-foreground" title="No separate pre-processing original was stored for this upload; this is the current stored artwork file.">
                              (current stored file)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="uppercase text-xs">
                          {logo.downloadExt || (logo.mimeType || "").split("/").pop() || "—"}
                        </TableCell>
                        <TableCell>{formatBytes(logo.size)}</TableCell>
                        <TableCell className="text-right">
                          {logo.hasOriginal ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              disabled={downloadingId === logo.id}
                              onClick={() => downloadOriginal(logo, r.project.name)}
                            >
                              {downloadingId === logo.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                              Original
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">no original</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
