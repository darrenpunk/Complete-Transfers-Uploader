import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
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
    draft: "Draft",
    cancel: "Cancelled",
  };
  return stateMap[state] || state;
}

function getStateBadgeVariant(state: string): "default" | "secondary" | "destructive" | "outline" {
  if (state === "done") return "default";
  if (state === "sale") return "secondary";
  if (state === "cancel") return "destructive";
  return "outline";
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

function getUserEmail(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  const emailFromUrl = urlParams.get('email');
  if (emailFromUrl) {
    try { sessionStorage.setItem('partner_email', emailFromUrl); } catch {}
    return emailFromUrl;
  }
  try {
    return sessionStorage.getItem('partner_email');
  } catch {
    return null;
  }
}

export default function OrderHistory() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [reorderingLineId, setReorderingLineId] = useState<number | null>(null);
  const limit = 10;
  const { toast } = useToast();
  const userEmail = getUserEmail();

  const { data, isLoading, isError, error, refetch } = useQuery<OrderHistoryResponse>({
    queryKey: ["/api/order-history", page, userEmail],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (userEmail) {
        params.append('email', userEmail);
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

  const isLoginRequired = data?.success === false && data?.error?.includes("Login required");

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

  const handleReorder = async (line: ArtworkLine) => {
    if (!line.hasPdf) {
      toast({ title: "No PDF available", description: "This order doesn't have a downloadable PDF for reordering", variant: "destructive" });
      return;
    }
    
    setReorderingLineId(line.lineId);
    try {
      const emailParam = userEmail ? `?email=${encodeURIComponent(userEmail)}` : '';
      const response = await fetch(`/api/order-pdf/${line.lineId}${emailParam}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const file = new File([blob], line.pdfFileName || "reorder.pdf", { type: "application/pdf" });

      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/logos", {
        method: "POST",
        body: formData,
      });
      if (uploadRes.ok) {
        toast({ title: "PDF loaded", description: "Your previous order PDF has been loaded. You can now adjust and reorder." });
        setLocation("/");
      } else {
        toast({ title: "Upload failed", description: "Could not load the PDF for reordering", variant: "destructive" });
      }
    } catch (err) {
      console.error("Reorder error:", err);
      toast({ title: "Reorder failed", description: "An error occurred while loading your previous order", variant: "destructive" });
    } finally {
      setReorderingLineId(null);
    }
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

        <div className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <ShoppingBag className="w-7 h-7 text-blue-400" />
            Order History
          </h1>
          <p className="text-gray-400 mt-1">
            View your past transfer orders and quickly reorder
          </p>
        </div>

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

        {isError && !isLoginRequired && (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-red-400">
                Unable to load order history. Please try again later.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => refetch()}>
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
            {data.orders.map((order) => (
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
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Calendar className="w-3 h-3" />
                    {formatDate(order.dateOrder)}
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
                                <span>Template: {line.templateSize}</span>
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
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => handleDownloadPdf(line.lineId, line.pdfFileName)}
                              >
                                <Download className="w-3 h-3 mr-1" />
                                PDF
                              </Button>
                            )}
                            <Button
                              size="sm"
                              className="text-xs bg-blue-600 hover:bg-blue-700"
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
    </div>
  );
}
