import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { UpdateBanner } from "@/components/update-banner";
import { SafariBanner } from "@/components/safari-banner";
import NotFound from "@/pages/not-found";
import UploadTool from "@/pages/upload-tool";
import DownloadOdooModule from "@/pages/download-odoo-module";
import ModuleDownload from "@/pages/ModuleDownload";
import LandingPage from "@/pages/landing";
import { BoundsTestingPage } from "@/pages/bounds-testing";
import { BoundsDemoStandalone } from "@/components/bounds-demo-standalone";

function Router() {
  return (
    <Switch>
      <Route path="/" component={UploadTool} />
      <Route path="/welcome" component={LandingPage} />
      <Route path="/promo" component={LandingPage} />
      <Route path="/artwork/upload" component={UploadTool} />
      <Route path="/project/:id" component={UploadTool} />
      <Route path="/bounds-testing" component={BoundsTestingPage} />
      <Route path="/bounds-demo" component={() => <div className="container mx-auto py-8"><BoundsDemoStandalone /></div>} />
      <Route path="/download-odoo-module" component={DownloadOdooModule} />
      <Route path="/module-download" component={ModuleDownload} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <UpdateBanner />
          <SafariBanner />
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
