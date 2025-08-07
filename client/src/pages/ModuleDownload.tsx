import { Download, Package, CheckCircle, AlertCircle, FileText, Cog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function ModuleDownload() {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = '/api/download/odoo-module';
    link.download = 'artwork_uploader_module_final.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const features = [
    "Complete PDF processing pipeline with CMYK preservation",
    "Advanced color workflow management",
    "Garment color database with 40+ colors",
    "Template-to-product mapping system",
    "File upload handling (PNG, JPEG, SVG, PDF, AI, EPS)",
    "Error-resistant architecture with fallback mechanisms",
    "E-commerce integration ready",
    "Professional PDF generation"
  ];

  const installation = [
    "Extract the zip file to your Odoo addons directory",
    "Restart your Odoo server",
    "Go to Apps > Update Apps List",
    "Search for 'Artwork Uploader'",
    "Install the module",
    "Configure product templates as needed"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Package className="h-12 w-12 text-blue-600 dark:text-blue-400 mr-3" />
              <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
                Artwork Uploader Module
              </h1>
            </div>
            <p className="text-xl text-slate-600 dark:text-slate-400">
              Professional Odoo module for artwork uploading and garment design workflow
            </p>
            <Badge variant="secondary" className="mt-2">
              Version 16.0.1.0.0 - Production Ready
            </Badge>
          </div>

          {/* Download Card */}
          <Card className="mb-8 border-2 border-blue-200 dark:border-blue-800">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center text-2xl">
                <Download className="mr-2 h-6 w-6" />
                Download Module
              </CardTitle>
              <CardDescription>
                Get the complete Odoo 16 module with all dependencies and configurations
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                onClick={handleDownload}
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 text-lg"
              >
                <Download className="mr-2 h-5 w-5" />
                Download artwork_uploader_module_final.zip
              </Button>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
                File size: ~2.5MB | Compatible with Odoo 16.0+
              </p>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Features */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CheckCircle className="mr-2 h-5 w-5 text-green-600" />
                  Key Features
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <CheckCircle className="mr-2 h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-slate-700 dark:text-slate-300">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Installation */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Cog className="mr-2 h-5 w-5 text-blue-600" />
                  Installation Steps
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {installation.map((step, index) => (
                    <li key={index} className="flex items-start">
                      <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold mr-3 mt-0.5 flex-shrink-0">
                        {index + 1}
                      </span>
                      <span className="text-sm text-slate-700 dark:text-slate-300">{step}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>

          {/* Technical Details */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="mr-2 h-5 w-5 text-slate-600" />
                Technical Specifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Dependencies</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• Odoo 16.0+</li>
                    <li>• base, website, sale</li>
                    <li>• website_sale, product</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">File Support</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• PNG, JPEG (up to 200MB)</li>
                    <li>• SVG, PDF, AI, EPS</li>
                    <li>• CMYK preservation</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Integration</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• Sales order automation</li>
                    <li>• Product template mapping</li>
                    <li>• E-commerce ready</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status */}
          <Card className="mt-6 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 mr-3" />
                <div>
                  <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">
                    Module Status: Production Ready
                  </h3>
                  <p className="text-green-700 dark:text-green-300">
                    All critical errors resolved. Enhanced error handling and fallback mechanisms implemented.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center mt-8 text-slate-500 dark:text-slate-400">
            <p>Need support? The module includes comprehensive documentation and error handling.</p>
          </div>
        </div>
      </div>
    </div>
  );
}