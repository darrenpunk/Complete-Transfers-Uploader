import { Download, Package, CheckCircle, FileText, Zap, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DownloadOdooModule() {
  const handleDownload = () => {
    // Create download link using the public file
    const link = document.createElement('a');
    link.href = '/artwork_uploader_module.zip';
    link.download = 'artwork_uploader_module.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <Package className="w-16 h-16 mx-auto mb-4 text-blue-400" />
          <h1 className="text-4xl font-bold mb-2">Artwork Uploader Odoo Module</h1>
          <p className="text-xl text-gray-300">Complete module package ready for installation</p>
          <Badge variant="secondary" className="mt-2">Version 16.0.1.0.0</Badge>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                Module Features
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>Multi-format artwork upload</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>Interactive canvas editor</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>Sales order integration</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>Template-to-product mapping</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>Professional PDF generation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>Hot deployment system</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Package Contents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>Complete Odoo 16 module (37 files)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>Implementation Guide</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>User Guide</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>Deployment Documentation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>Template Mapping Guide</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>Embed Button Integration</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4 text-center">
              <Zap className="w-8 h-8 mx-auto mb-2 text-yellow-400" />
              <h3 className="font-semibold mb-1">Hot Deployment</h3>
              <p className="text-sm text-gray-400">Live updates without reinstall</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4 text-center">
              <Globe className="w-8 h-8 mx-auto mb-2 text-blue-400" />
              <h3 className="font-semibold mb-1">Web Integration</h3>
              <p className="text-sm text-gray-400">Responsive website interface</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4 text-center">
              <Package className="w-8 h-8 mx-auto mb-2 text-purple-400" />
              <h3 className="font-semibold mb-1">Production Ready</h3>
              <p className="text-sm text-gray-400">Fully tested and documented</p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-gradient-to-r from-blue-900 to-purple-900 border-blue-500 mb-8">
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Ready to Install</h2>
            <p className="text-gray-200 mb-6">
              Complete Odoo module with comprehensive documentation. 
              Extract to your addons directory and install via Odoo interface.
            </p>
            <Button 
              onClick={handleDownload}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="w-5 h-5 mr-2" />
              Download Module Package
            </Button>
            <div className="mt-4 text-sm text-gray-300">
              <p>File: artwork_uploader_module.zip</p>
              <p>Compatible with Odoo 16.0+</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle>Quick Installation</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="bg-blue-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center mt-0.5 flex-shrink-0">1</span>
                  <span>Extract module to Odoo addons directory</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-blue-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center mt-0.5 flex-shrink-0">2</span>
                  <span>Update addons list in Odoo</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-blue-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center mt-0.5 flex-shrink-0">3</span>
                  <span>Install via Apps interface</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-blue-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center mt-0.5 flex-shrink-0">4</span>
                  <span>Configure using Implementation Guide</span>
                </li>
              </ol>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle>Technical Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span>Odoo 16.0 or later</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span>Python 3.8+</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span>PostgreSQL 12+</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span>Sales & Website modules</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}