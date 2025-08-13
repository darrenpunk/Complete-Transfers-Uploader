import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import UploadTool from "@/pages/upload-tool";
import DownloadOdooModule from "@/pages/download-odoo-module";
import ModuleDownload from "@/pages/ModuleDownload";
import DownloadPage from "@/pages/DownloadPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={UploadTool} />
      <Route path="/project/:id" component={UploadTool} />
      <Route path="/download-odoo-module" component={DownloadOdooModule} />
      <Route path="/module-download" component={ModuleDownload} />
      <Route path="/download-fixed" component={DownloadPage} />
      <Route path="/fresh-system" component={() => {
        window.location.href = 'http://localhost:9000';
        return <div style={{textAlign: 'center', padding: '50px'}}>Redirecting to fresh system on port 9000...</div>;
      }} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
