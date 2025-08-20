/**
 * Standalone Bounds Demo Component
 * 
 * Simple test interface for bounds extraction without requiring existing projects
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, FileText, Loader2, TestTube } from 'lucide-react';

interface BoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  width: number;
  height: number;
  units: 'pt' | 'px';
}

interface BoundsResult {
  success: boolean;
  bbox?: BoundingBox;
  pdfBbox?: BoundingBox;
  cssBbox?: BoundingBox;
  method: string;
  contentFound?: boolean;
  error?: string;
}

export function BoundsDemoStandalone() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [result, setResult] = useState<BoundsResult | null>(null);
  const [filePath, setFilePath] = useState('test-complete-logo.pdf');
  const [pageNumber, setPageNumber] = useState(1);

  const testFiles = [
    'test-complete-logo.pdf',
    'rainbow_dog_test.pdf',
    'files-1753718523978-626117271.pdf'
  ];

  const extractBounds = async () => {
    if (!filePath.trim()) return;

    setIsExtracting(true);
    setResult(null);

    try {
      const response = await fetch('/api/extract-bounds/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath: filePath.trim(),
          pageNumber,
          options: {
            includeStrokeExtents: true,
            padding: 0,
            tolerance: 0.1
          }
        })
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        method: 'fetch-error',
        contentFound: false,
        error: error instanceof Error ? error.message : 'Network error'
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const formatBounds = (bbox: BoundingBox) => (
    <div className="space-y-1 text-sm font-mono">
      <div>X: {bbox.xMin.toFixed(2)} → {bbox.xMax.toFixed(2)} ({bbox.units})</div>
      <div>Y: {bbox.yMin.toFixed(2)} → {bbox.yMax.toFixed(2)} ({bbox.units})</div>
      <div>Size: {bbox.width.toFixed(2)} × {bbox.height.toFixed(2)} ({bbox.units})</div>
    </div>
  );

  const getMethodBadgeColor = (method: string) => {
    switch (method) {
      case 'ghostscript': return 'bg-green-100 text-green-800';
      case 'raster-fallback': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="w-5 h-5" />
          PDF Vector Bounds Extraction Test
        </CardTitle>
        <CardDescription>
          Test precise vector content bounding box detection on uploaded PDF files
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Test Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="filePath">PDF File Name</Label>
            <Input
              id="filePath"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="Enter PDF filename"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pageNumber">Page Number</Label>
            <Input
              id="pageNumber"
              type="number"
              min="1"
              value={pageNumber}
              onChange={(e) => setPageNumber(parseInt(e.target.value) || 1)}
            />
          </div>

          <div className="flex items-end">
            <Button 
              onClick={extractBounds}
              disabled={!filePath.trim() || isExtracting}
              className="w-full"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Extract Bounds
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Quick Test Files */}
        <div className="space-y-2">
          <Label>Quick Test with Available Files:</Label>
          <div className="flex flex-wrap gap-2">
            {testFiles.map((file) => (
              <Button
                key={file}
                variant="outline"
                size="sm"
                onClick={() => setFilePath(file)}
                className="text-xs"
              >
                {file}
              </Button>
            ))}
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4 border-t pt-6">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-medium">Extraction Result</h4>
              <div className="flex items-center gap-2">
                <Badge className={getMethodBadgeColor(result.method)}>
                  {result.method}
                </Badge>
                <Badge variant={result.success ? "default" : "destructive"}>
                  {result.success ? 'Success' : 'Failed'}
                </Badge>
              </div>
            </div>

            {result.error && (
              <div className="flex items-start gap-2 p-4 bg-red-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-medium text-red-700">Error</div>
                  <div className="text-sm text-red-600">{result.error}</div>
                </div>
              </div>
            )}

            {result.success && (
              <div className="grid md:grid-cols-2 gap-6">
                {/* Content Bounds */}
                {result.bbox && (
                  <div className="space-y-3">
                    <h5 className="text-base font-medium text-green-700">Vector Content Bounds</h5>
                    <div className="p-4 bg-green-50 rounded-lg">
                      {formatBounds(result.bbox)}
                    </div>
                  </div>
                )}

                {/* PDF Page Bounds */}
                {result.pdfBbox && (
                  <div className="space-y-3">
                    <h5 className="text-base font-medium text-gray-700">PDF Page Bounds</h5>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      {formatBounds(result.pdfBbox)}
                    </div>
                  </div>
                )}

                {/* CSS Bounds */}
                {result.cssBbox && (
                  <div className="space-y-3 md:col-span-2">
                    <h5 className="text-base font-medium text-blue-700">CSS Pixel Bounds</h5>
                    <div className="p-4 bg-blue-50 rounded-lg">
                      {formatBounds(result.cssBbox)}
                    </div>
                  </div>
                )}

                {/* Comparison Stats */}
                {result.bbox && result.pdfBbox && (
                  <div className="md:col-span-2 space-y-3">
                    <h5 className="text-base font-medium">Content Analysis</h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="font-medium">Content Width</div>
                        <div>{((result.bbox.width / result.pdfBbox.width) * 100).toFixed(1)}% of page</div>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="font-medium">Content Height</div>
                        <div>{((result.bbox.height / result.pdfBbox.height) * 100).toFixed(1)}% of page</div>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="font-medium">Content Area</div>
                        <div>{((result.bbox.width * result.bbox.height) / (result.pdfBbox.width * result.pdfBbox.height) * 100).toFixed(1)}% of page</div>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="font-medium">Aspect Ratio</div>
                        <div>{(result.bbox.width / result.bbox.height).toFixed(2)}:1</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Algorithm Info */}
        <div className="space-y-3 border-t pt-6">
          <h4 className="text-lg font-medium">Extraction Methods</h4>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-green-100 text-green-800">Ghostscript</Badge>
                <span className="font-medium">Primary Method</span>
              </div>
              <p className="text-muted-foreground">
                Analyzes PDF vector content streams directly for highest accuracy. 
                Extracts precise bounds from path data, text outlines, and vector graphics.
              </p>
            </div>

            <div className="p-4 bg-yellow-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-yellow-100 text-yellow-800">Raster Fallback</Badge>
                <span className="font-medium">Backup Method</span>
              </div>
              <p className="text-muted-foreground">
                Renders PDF at 300 DPI and crops transparent pixels when vector analysis fails. 
                Less precise but handles complex cases.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}