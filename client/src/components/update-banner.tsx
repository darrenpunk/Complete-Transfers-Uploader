import { useState, useEffect, useCallback } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const VERSION_CHECK_INTERVAL = 60_000;
const VERSION_STORAGE_KEY = "app-version";

export function UpdateBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [initialVersion, setInitialVersion] = useState<string | null>(null);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch(`/api/version?_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const serverVersion = data.version;

      if (!initialVersion) {
        const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY);
        if (storedVersion && storedVersion !== serverVersion) {
          setShowBanner(true);
        }
        localStorage.setItem(VERSION_STORAGE_KEY, serverVersion);
        setInitialVersion(serverVersion);
      } else if (serverVersion !== initialVersion) {
        setShowBanner(true);
        localStorage.setItem(VERSION_STORAGE_KEY, serverVersion);
      }
    } catch {
    }
  }, [initialVersion]);

  useEffect(() => {
    checkVersion();
    const interval = setInterval(checkVersion, VERSION_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [checkVersion]);

  const handleRefresh = () => {
    if ("caches" in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      });
    }
    window.location.reload();
  };

  if (!showBanner) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-black px-4 py-3 shadow-lg">
      <div className="flex items-center justify-center gap-3 max-w-4xl mx-auto">
        <RefreshCw className="h-5 w-5 flex-shrink-0 animate-spin" style={{ animationDuration: "3s" }} />
        <p className="text-sm font-medium">
          A new update is available! Please clear your browser cache and refresh to get the latest version.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="bg-black text-white border-black hover:bg-gray-800 hover:text-white flex-shrink-0"
          onClick={handleRefresh}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh Now
        </Button>
        <button
          onClick={() => setShowBanner(false)}
          className="ml-2 p-1 hover:bg-amber-600 rounded flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
