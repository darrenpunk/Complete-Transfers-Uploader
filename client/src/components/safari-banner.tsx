import { useState, useEffect } from "react";
import { AlertTriangle, X, Chrome } from "lucide-react";

function isSafari(): boolean {
  const ua = navigator.userAgent;
  return /^((?!chrome|android).)*safari/i.test(ua);
}

const SAFARI_BANNER_DISMISSED_KEY = "safari-banner-dismissed";

export function SafariBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isSafari() && !sessionStorage.getItem(SAFARI_BANNER_DISMISSED_KEY)) {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(SAFARI_BANNER_DISMISSED_KEY, "1");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9998] bg-blue-600 text-white px-4 py-3 shadow-lg">
      <div className="flex items-center justify-center gap-3 max-w-4xl mx-auto">
        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm font-medium">
          For the best experience, we recommend using <Chrome className="h-4 w-4 inline-block mx-1" />
          <strong>Google Chrome</strong>. Some complex artwork may not display correctly in Safari.
        </p>
        <button
          onClick={dismiss}
          className="ml-2 p-1 hover:bg-blue-700 rounded flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
