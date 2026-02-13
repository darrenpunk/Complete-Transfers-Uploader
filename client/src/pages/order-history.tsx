import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Download,
  RefreshCw,
  Package,
  Calendar,
  Palette,
  FileText,
  ChevronLeft,
  ChevronRight,
  LogIn,
  ShoppingBag,
  Search,
  Minus,
  Plus,
  Truck,
  Clock,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Eye,
  Loader2,
  X,
} from "lucide-react";

interface GarmentColor {
  colorName: string;
  color: string;
  quantity: number;
}

interface ArtworkLine {
  lineId: number;
  projectName: string;
  projectUuid: string;
  templateSize: string;
  quantity: number;
  garmentColors: GarmentColor[];
  garmentColorName: string;
  inkColorName: string;
  hasPdf: boolean;
  pdfFileName: string;
  state: string;
  createdDate: string;
}

interface Order {
  orderId: number;
  orderName: string;
  dateOrder: string;
  state: string;
  amountTotal: number;
  currencySymbol: string;
  deliveryStatus?: string;
  deliveryDate?: string;
  trackingRef?: string;
  artworkLines: ArtworkLine[];
}

interface OrderHistoryResponse {
  success: boolean;
  orders: Order[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  error?: string;
}

function formatDate(isoDate: string): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getStateLabel(state: string): string {
  const stateMap: Record<string, string> = {
    sale: "Confirmed",
    done: "Completed",
    locked: "Completed",
    draft: "Draft",
    cancel: "Cancelled",
  };
  return stateMap[state] || state;
}

function getStateBadgeVariant(state: string): "default" | "secondary" | "destructive" | "outline" {
  if (state === "done" || state === "locked") return "default";
  if (state === "sale") return "secondary";
  if (state === "cancel") return "destructive";
  return "outline";
}

function DeliveryBadge({ status, date, trackingRef }: { status?: string; date?: string; trackingRef?: string }) {
  if (!status) return null;
  
  const config: Record<string, { label: string; icon: any; className: string }> = {
    delivered: { label: "Shipped", icon: CheckCircle2, className: "bg-green-900/50 text-green-400 border-green-700" },
    ready: { label: "Processing", icon: PackageCheck, className: "bg-blue-900/50 text-blue-400 border-blue-700" },
    processing: { label: "Processing", icon: Clock, className: "bg-yellow-900/50 text-yellow-400 border-yellow-700" },
    pending: { label: "Pending", icon: Clock, className: "bg-gray-800 text-gray-400 border-gray-700" },
    cancelled: { label: "Cancelled", icon: XCircle, className: "bg-red-900/50 text-red-400 border-red-700" },
  };
  
  const c = config[status] || config.pending;
  const Icon = c.icon;
  
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${c.className}`}>
        <Icon className="w-3 h-3" />
        {c.label}
      </span>
      {status === "delivered" && date && (
        <span className="text-xs text-gray-500">{formatDate(date)}</span>
      )}
      {trackingRef && (
        <span className="text-xs text-blue-400">{trackingRef}</span>
      )}
    </div>
  );
}

function ColorSwatch({ color, name, quantity }: { color: string; name: string; quantity: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        className="w-4 h-4 rounded border border-gray-600 flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-gray-300">{quantity}x {name}</span>
    </div>
  );
}

function getTemplateName(templateId: string): string {
  const templateNames: Record<string, string> = {
    'template-A3': 'Full Colour A3',
    'template-A4': 'Full Colour A4',
    'template-A5': 'Full Colour A5',
    'template-A6': 'Full Colour A6',
    'template-transfer-size': 'Full Colour 295×100mm',
    'template-square': 'Full Colour 95×95mm',
    'template-badge': 'Full Colour 100×70mm',
    'template-small': 'Full Colour 60×60mm',
    'template-295x300': 'Full Colour 295×300mm',
    'metallic-A3': 'Metallic A3',
    'metallic-A4': 'Metallic A4',
    'metallic-A5': 'Metallic A5',
    'metallic-A6': 'Metallic A6',
    'metallic-transfer-size': 'Metallic 295×100mm',
    'metallic-square': 'Metallic 95×95mm',
    'metallic-badge': 'Metallic 100×70mm',
    'metallic-small': 'Metallic 60×60mm',
    'hd-A3': 'HD A3',
    'hd-A4': 'HD A4',
    'single-A3': 'Single Colour A3',
    'single-A4': 'Single Colour A4',
    'single-A5': 'Single Colour A5',
    'single-A6': 'Single Colour A6',
    'single-transfer-size': 'Single Colour 295×100mm',
    'single-square': 'Single Colour 95×95mm',
    'single-badge': 'Single Colour 100×70mm',
    'single-small': 'Single Colour 60×60mm',
    'zero-A3': 'Zero A3',
    'zero-A4': 'Zero A4',
    'zero-A5': 'Zero A5',
    'zero-A6': 'Zero A6',
    'zero-transfer-size': 'Zero 295×100mm',
    'zero-square': 'Zero 95×95mm',
    'zero-badge': 'Zero 100×70mm',
    'zero-small': 'Zero 60×60mm',
    'dtf-SRA3': 'DTF SRA3',
    'dtf-large': 'DTF 1000×550mm',
    'uvdtf-A3': 'UV DTF A3',
    'woven-A6': 'Woven A6',
    'woven-square': 'Woven 95×95mm',
    'woven-badge': 'Woven 100×70mm',
    'woven-small': 'Woven 60×60mm',
    'applique-square': 'Applique 95×95mm',
    'applique-badge': 'Applique 100×70mm',
    'applique-small': 'Applique 60×60mm',
    'reflective-A3': 'Reflective A3',
    'reflective-A4': 'Reflective A4',
    'reflective-A5': 'Reflective A5',
    'reflective-A6': 'Reflective A6',
    'reflective-transfer-size': 'Reflective 295×100mm',
    'reflective-square': 'Reflective 95×95mm',
    'reflective-badge': 'Reflective 100×70mm',
    'reflective-small': 'Reflective 60×60mm',
    'sublimation-A2-fabric': 'Sublimation A2 Fabric',
    'sublimation-A3-fabric': 'Sublimation A3 Fabric',
    'sublimation-A4-fabric': 'Sublimation A4 Fabric',
    'sublimation-A3': 'Sublimation A3 Hard Surface',
    'sublimation-A4': 'Sublimation A4 Hard Surface',
    'sublimation-mug': 'Sublimation Mug',
    'sublimation-A5': 'Sublimation A5',
    'sublimation-A6': 'Sublimation A6',
    'sublimation-transfer-size': 'Sublimation 295×100mm',
    'sublimation-square': 'Sublimation 95×95mm',
    'sublimation-badge': 'Sublimation 100×70mm',
    'sublimation-small': 'Sublimation 60×60mm',
    'sublimation-1100x1000-fabric': 'Sublimation 1100×1000mm Fabric',
    'sublimation-1100x1000-hard': 'Sublimation 1100×1000mm Hard Surface',
  };
  return templateNames[templateId] || templateId;
}

function getInitialEmail(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  const emailFromUrl = urlParams.get('email');
  if (emailFromUrl) {
    try { sessionStorage.setItem('partner_email', emailFromUrl); } catch {}
    return emailFromUrl;
  }
  try {
    const stored = sessionStorage.getItem('partner_email');
    if (stored) return stored;
  } catch {}
  return null;
}

export default function OrderHistory() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [reorderingLineId, setReorderingLineId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(getInitialEmail());
  const [emailLoading, setEmailLoading] = useState(!getInitialEmail());

  useEffect(() => {
    if (userEmail) {
      setEmailLoading(false);
      return;
    }
    
    const isInIframe = window.parent !== window;
    if (isInIframe) {
      const timeout = setTimeout(() => {
        setEmailLoading(false);
      }, 3000);
      
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'odoo-user-data' && event.data.email) {
          clearTimeout(timeout);
          setUserEmail(event.data.email);
          setEmailLoading(false);
          try { sessionStorage.setItem('partner_email', event.data.email); } catch {}
        }
      };
      
      window.addEventListener('message', handleMessage);
      window.parent.postMessage({ type: 'request-user-data' }, '*');
      
      return () => {
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);
      };
    } else {
      setEmailLoading(false);
    }
  }, []);
  const [reorderModalLine, setReorderModalLine] = useState<ArtworkLine | null>(null);
  const [reorderQty, setReorderQty] = useState(1);
  const [previewLine, setPreviewLine] = useState<ArtworkLine | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const limit = 10;
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading, isError, error, refetch } = useQuery<OrderHistoryResponse>({
    queryKey: ["/api/order-history", page, userEmail, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (userEmail) {
        params.append('email', userEmail);
      }
      if (debouncedSearch.trim()) {
        params.append('search', debouncedSearch.trim());
      }
      const res = await fetch(`/api/order-history?${params.toString()}`, {
        credentials: "include",
      });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return { success: false, error: "Unable to load orders", orders: [], total: 0, page: 1, limit, totalPages: 0 };
      }
    },
    retry: false,
    enabled: !!userEmail,
  });

  const isLoginRequired = !emailLoading && !userEmail;

  const handleDownloadPdf = async (lineId: number, fileName: string) => {
    try {
      const emailParam = userEmail ? `?email=${encodeURIComponent(userEmail)}` : '';
      const response = await fetch(`/api/order-pdf/${lineId}${emailParam}`, {
        credentials: "include",
      });
      if (!response.ok) {
        toast({ title: "Download failed", description: "Could not download the PDF", variant: "destructive" });
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "artwork.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download error:", err);
      toast({ title: "Download failed", description: "An error occurred", variant: "destructive" });
    }
  };

  const handlePreviewPdf = async (line: ArtworkLine) => {
    setPreviewLine(line);
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const emailParam = userEmail ? `?email=${encodeURIComponent(userEmail)}` : '';
      const response = await fetch(`/api/order-pdf/${line.lineId}${emailParam}`, {
        credentials: "include",
      });
      if (!response.ok) {
        toast({ title: "Preview failed", description: "Could not load the PDF preview", variant: "destructive" });
        setPreviewLine(null);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err) {
      console.error("PDF preview error:", err);
      toast({ title: "Preview failed", description: "An error occurred loading the preview", variant: "destructive" });
      setPreviewLine(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewLine(null);
    setPreviewUrl(null);
  };

  const handleReorder = (line: ArtworkLine) => {
    setReorderModalLine(line);
    setReorderQty(line.quantity || 1);
  };

  const confirmReorder = () => {
    const line = reorderModalLine;
    if (!line) return;
    
    setReorderModalLine(null);
    
    const reorderData: Record<string, any> = {
      projectName: line.projectName,
      templateSize: line.templateSize || '',
      garmentColors: line.garmentColors || [],
      garmentColorName: line.garmentColorName || '',
      inkColorName: line.inkColorName || '',
      quantity: reorderQty,
    };

    if (line.hasPdf) {
      reorderData.pdfLineId = line.lineId;
      reorderData.pdfFileName = line.pdfFileName || 'reorder.pdf';
      reorderData.email = userEmail || '';
    }

    sessionStorage.setItem('reorder_data', JSON.stringify(reorderData));
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/")}
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Designer
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="text-gray-400 hover:text-white"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <ShoppingBag className="w-7 h-7 text-blue-400" />
            Order History
          </h1>
          <p className="text-gray-400 mt-1">
            View your past transfer orders and quickly reorder
          </p>
        </div>

        {userEmail && (
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search by order number or product name..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-10 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
            />
          </div>
        )}

        {!userEmail && (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <LogIn className="w-12 h-12 text-gray-600 mb-4" />
              <h2 className="text-lg font-semibold text-gray-300 mb-2">Login Required</h2>
              <p className="text-gray-500 max-w-md">
                Please access the designer from the website to view your order history.
                Your past transfer orders will appear here once you're identified.
              </p>
            </CardContent>
          </Card>
        )}

        {userEmail && isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <Skeleton className="h-6 w-48 bg-gray-800" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full bg-gray-800" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {emailLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-gray-400">Connecting to your account...</span>
          </div>
        )}

        {isLoginRequired && (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <LogIn className="w-12 h-12 text-gray-600 mb-4" />
              <h2 className="text-lg font-semibold text-gray-300 mb-2">No Orders Found</h2>
              <p className="text-gray-500 max-w-md">
                No order history was found for your account. Orders will appear here after they've been confirmed.
              </p>
            </CardContent>
          </Card>
        )}

        {((isError && !isLoginRequired) || (data && !data.success && !isLoginRequired)) && (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="w-12 h-12 text-gray-600 mb-4" />
              <h2 className="text-lg font-semibold text-gray-300 mb-2">Unable to Load Orders</h2>
              <p className="text-gray-500 max-w-md">
                We couldn't retrieve your order history right now. This may be a temporary issue — please try again.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {data?.success && data.orders.length === 0 && (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="w-12 h-12 text-gray-600 mb-4" />
              <h2 className="text-lg font-semibold text-gray-300 mb-2">No Orders Yet</h2>
              <p className="text-gray-500 max-w-md">
                You haven't placed any transfer orders yet. Start by uploading your artwork
                and creating your first order.
              </p>
              <Button className="mt-4" onClick={() => setLocation("/")}>
                Create Your First Order
              </Button>
            </CardContent>
          </Card>
        )}

        {data?.success && data.orders.length > 0 && (
          <div className="space-y-4">
            {data.orders
              .filter((order, index, self) => self.findIndex(o => o.orderId === order.orderId) === index)
              .map((order) => (
              <Card key={order.orderId} className="bg-gray-900 border-gray-800">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold text-gray-200 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-400" />
                      {order.orderName}
                    </CardTitle>
                    <div className="flex items-center gap-3">
                      <Badge variant={getStateBadgeVariant(order.state)}>
                        {getStateLabel(order.state)}
                      </Badge>
                      {order.amountTotal > 0 && (
                        <span className="text-sm font-medium text-gray-300">
                          {order.currencySymbol}{order.amountTotal.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(order.dateOrder)}
                    </span>
                    <DeliveryBadge status={order.deliveryStatus} date={order.deliveryDate} trackingRef={order.trackingRef} />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {order.artworkLines.map((line) => (
                      <div
                        key={line.lineId}
                        className="bg-gray-850 rounded-lg p-4 border border-gray-800 hover:border-gray-700 transition-colors"
                        style={{ backgroundColor: "rgba(30, 30, 40, 0.6)" }}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-200 truncate">
                              {line.projectName}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                              {line.templateSize && (
                                <span>{getTemplateName(line.templateSize)}</span>
                              )}
                              <span className="flex items-center gap-1">
                                <Package className="w-3 h-3" />
                                Qty: {line.quantity}
                              </span>
                              {line.inkColorName && (
                                <span className="flex items-center gap-1">
                                  <Palette className="w-3 h-3" />
                                  Ink: {line.inkColorName}
                                </span>
                              )}
                            </div>

                            {line.garmentColors.length > 0 && (
                              <div className="flex flex-wrap gap-3 mt-2">
                                {line.garmentColors.map((gc, idx) => (
                                  <ColorSwatch
                                    key={idx}
                                    color={gc.color}
                                    name={gc.colorName}
                                    quantity={gc.quantity}
                                  />
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {line.hasPdf && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs"
                                  onClick={() => handlePreviewPdf(line)}
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  Preview
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs"
                                  onClick={() => handleDownloadPdf(line.lineId, line.pdfFileName)}
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  PDF
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              className="text-xs bg-primary hover:bg-primary/90"
                              disabled={reorderingLineId === line.lineId}
                              onClick={() => handleReorder(line)}
                            >
                              <RefreshCw className={`w-3 h-3 mr-1 ${reorderingLineId === line.lineId ? 'animate-spin' : ''}`} />
                              {reorderingLineId === line.lineId ? 'Loading...' : 'Reorder'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}

            {data.totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-400">
                  Page {page} of {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!previewLine} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              {previewLine?.projectName || 'Artwork Preview'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex items-center justify-center overflow-auto py-4">
            {previewLoading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                <p className="text-sm text-gray-400">Loading preview...</p>
              </div>
            ) : previewUrl ? (
              <iframe
                src={previewUrl}
                className="w-full border-0 rounded-lg bg-white"
                style={{ height: '70vh' }}
                title="PDF Preview"
              />
            ) : (
              <p className="text-sm text-gray-400">Preview unavailable</p>
            )}
          </div>
          <DialogFooter className="flex gap-2 sm:justify-between">
            {previewLine?.hasPdf && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (previewLine) handleDownloadPdf(previewLine.lineId, previewLine.pdfFileName);
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={closePreview}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reorderModalLine} onOpenChange={(open) => { if (!open) setReorderModalLine(null); }}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Reorder</DialogTitle>
          </DialogHeader>
          {reorderModalLine && (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-gray-400 text-xs">Project</Label>
                <p className="font-medium text-gray-200">{reorderModalLine.projectName}</p>
              </div>
              {reorderModalLine.templateSize && (
                <div>
                  <Label className="text-gray-400 text-xs">Product</Label>
                  <p className="text-gray-200">{getTemplateName(reorderModalLine.templateSize)}</p>
                </div>
              )}
              {reorderModalLine.garmentColors.length > 0 && (
                <div>
                  <Label className="text-gray-400 text-xs">Garment Colours</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {reorderModalLine.garmentColors.map((gc, idx) => (
                      <ColorSwatch key={idx} color={gc.color} name={gc.colorName} quantity={gc.quantity} />
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label className="text-gray-400 text-xs mb-2 block">Quantity</Label>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-gray-600"
                    onClick={() => setReorderQty((q) => Math.max(1, q - 1))}
                    disabled={reorderQty <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    value={reorderQty}
                    onChange={(e) => setReorderQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 text-center bg-gray-800 border-gray-600 text-white"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-gray-600"
                    onClick={() => setReorderQty((q) => q + 1)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="border-gray-600" onClick={() => setReorderModalLine(null)}>
              Cancel
            </Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={confirmReorder}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Confirm Reorder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
