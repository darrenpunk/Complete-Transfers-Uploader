import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import UploadTool from "@/pages/upload-tool";
import DownloadOdooModule from "@/pages/download-odoo-module";

function Router() {
  return (
    <Switch>
      <Route path="/" component={UploadTool} />
      <Route path="/project/:id" component={UploadTool} />
      <Route path="/download-odoo-module" component={DownloadOdooModule} />
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
