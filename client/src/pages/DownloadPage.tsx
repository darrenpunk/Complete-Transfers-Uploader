import { Download, CheckCircle, FileText, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DownloadPage() {
  const handleDownload = () => {
    // Create download link for the zip file
    const link = document.createElement('a');
    link.href = '/artwork_uploader_module_error_fixed.zip';
    link.download = 'artwork_uploader_module_error_fixed.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Package className="h-12 w-12 text-purple-600 mr-3" />
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
                Artwork Uploader Module
              </h1>
            </div>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Production-ready Odoo 16 module with installation fixes applied
            </p>
            <Badge variant="outline" className="mt-2 bg-green-100 text-green-800 border-green-300">
              <CheckCircle className="h-4 w-4 mr-1" />
              Installation Errors Fixed
            </Badge>
          </div>

          {/* Download Card */}
          <Card className="mb-8 border-2 border-purple-200 dark:border-purple-800">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-purple-700 dark:text-purple-300">
                Download Fixed Module
              </CardTitle>
              <CardDescription>
                Ready for immediate deployment to your Odoo instance
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <strong>File:</strong> artwork_uploader_module_error_fixed.zip
                  </div>
                  <div>
                    <strong>Version:</strong> 16.0.1.0.0 (Fixed)
                  </div>
                  <div>
                    <strong>Size:</strong> Production-ready package
                  </div>
                </div>
              </div>
              
              <Button 
                onClick={handleDownload}
                size="lg" 
                className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 text-lg"
              >
                <Download className="h-5 w-5 mr-2" />
                Download Module
              </Button>
              
              <p className="text-sm text-gray-500 mt-4">
                Compatible with Odoo 16.0+ • All installation errors resolved
              </p>
            </CardContent>
          </Card>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                  Installation Fixes Applied
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>• Fixed missing ProductPriceTier model definition</li>
                  <li>• Updated security permissions for all models</li>
                  <li>• Resolved database field reference errors</li>
                  <li>• Added proper Odoo exception handling</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Package className="h-5 w-5 text-blue-600 mr-2" />
                  Module Features
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>• Multi-format file upload (PNG, JPEG, SVG, PDF, AI, EPS)</li>
                  <li>• Interactive canvas editor with positioning</li>
                  <li>• CMYK color workflow for professional printing</li>
                  <li>• E-commerce integration with sales orders</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Installation Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 text-orange-600 mr-2" />
                Installation Instructions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm mb-4">
                <div># Extract module to Odoo addons directory</div>
                <div>unzip artwork_uploader_module_error_fixed.zip -d /path/to/odoo/addons/</div>
                <div className="mt-2"># Install via Odoo interface</div>
                <div>Apps → Search "Artwork Uploader" → Install</div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-semibold mb-2">Verification Steps:</h4>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-300">
                    <li>1. Check models load without errors</li>
                    <li>2. Verify security access rules work</li>
                    <li>3. Test artwork project creation</li>
                    <li>4. Confirm PDF generation functions</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Key Models Included:</h4>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-300">
                    <li>• artwork.project (main projects)</li>
                    <li>• artwork.logo (file uploads)</li>
                    <li>• artwork.canvas.element (positioning)</li>
                    <li>• product.price.tier (pricing)</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center mt-8 text-sm text-gray-500">
            <p>Complete Transfers • Artwork Uploader Module v16.0.1.0.0 (Fixed)</p>
            <p>Ready for production deployment with all installation errors resolved</p>
          </div>
        </div>
      </div>
    </div>
  );
}