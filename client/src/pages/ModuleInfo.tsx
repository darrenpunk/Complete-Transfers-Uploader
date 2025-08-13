import { ArrowRight, Download, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ModuleInfo() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Package className="h-12 w-12 text-blue-600 dark:text-blue-400 mr-3" />
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
              Odoo Module Ready
            </h1>
          </div>
          <p className="text-xl text-slate-600 dark:text-slate-400">
            Your Artwork Uploader module has been updated and is ready for download
          </p>
          <Badge variant="secondary" className="mt-2">
            Production Ready - All Errors Fixed
          </Badge>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Module Updated Successfully</CardTitle>
            <CardDescription>
              The Odoo module has been updated with improved error handling and all critical issues resolved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                onClick={() => window.location.href = '/module-download'}
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Download className="mr-2 h-5 w-5" />
                Go to Download Page
              </Button>
              <Button 
                variant="outline"
                onClick={() => window.location.href = '/api/download/odoo-module'}
                size="lg"
              >
                <ArrowRight className="mr-2 h-5 w-5" />
                Direct Download
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-slate-500 dark:text-slate-400">
          <p>The module is now production-ready with enhanced error handling and fallback mechanisms.</p>
        </div>
      </div>
    </div>
  );
}