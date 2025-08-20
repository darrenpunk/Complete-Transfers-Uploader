/**
 * PDF/SVG Bounds Extractor Demo Component
 * 
 * Demonstrates precise vector content bounds detection
 * and provides testing interface for the bounds extraction system.
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, FileText, Image, Loader2 } from 'lucide-react';

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
  contentBounds?: BoundingBox;
  viewBoxBounds?: BoundingBox;
  method: string;
  contentFound?: boolean;
  hasContent?: boolean;
  error?: string;
  logoId?: string;
  filename?: string;
  mimeType?: string;
}

interface BoundsExtractorDemoProps {
  logoId?: string;
  filename?: string;
  mimeType?: string;
}

export function BoundsExtractorDemo({ logoId, filename, mimeType }: BoundsExtractorDemoProps) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [result, setResult] = useState<BoundsResult | null>(null);
  const [options, setOptions] = useState({
    includeStrokeExtents: true,
    padding: 0,
    tolerance: 0.1
  });

  const extractBounds = async () => {
    if (!logoId) return;

    setIsExtracting(true);
    setResult(null);

    try {
      const queryParams = new URLSearchParams({
        includeStrokeExtents: options.includeStrokeExtents.toString(),
        padding: options.padding.toString(),
        tolerance: options.tolerance.toString()
      });

      const response = await fetch(`/api/logos/${logoId}/bounds?${queryParams}`);
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
      case 'dom-analysis': return 'bg-blue-100 text-blue-800';
      case 'path-calculation': return 'bg-purple-100 text-purple-800';
      case 'raster-fallback': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {mimeType === 'application/pdf' ? (
            <FileText className="w-5 h-5" />
          ) : (
            <Image className="w-5 h-5" />
          )}
          Vector Bounds Extractor
        </CardTitle>
        <CardDescription>
          Extract precise vector content bounding boxes from PDF and SVG files
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* File Info */}
        {filename && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">File: {filename}</div>
            <div className="text-sm text-muted-foreground">Type: {mimeType}</div>
          </div>
        )}

        {/* Options */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Extraction Options</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={options.includeStrokeExtents}
                onChange={(e) => setOptions(prev => ({ ...prev, includeStrokeExtents: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm">Include stroke extents</span>
            </label>

            <div className="space-y-1">
              <label className="text-sm">Padding ({options.padding})</label>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={options.padding}
                onChange={(e) => setOptions(prev => ({ ...prev, padding: parseFloat(e.target.value) }))}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm">Tolerance ({options.tolerance})</label>
            <input
              type="range"
              min="0.01"
              max="1"
              step="0.01"
              value={options.tolerance}
              onChange={(e) => setOptions(prev => ({ ...prev, tolerance: parseFloat(e.target.value) }))}
              className="w-full"
            />
          </div>
        </div>

        {/* Extract Button */}
        <Button 
          onClick={extractBounds}
          disabled={!logoId || isExtracting}
          className="w-full"
        >
          {isExtracting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Extracting Bounds...
            </>
          ) : (
            'Extract Content Bounds'
          )}
        </Button>

        {/* Results */}
        {result && (
          <div className="space-y-4">
            <Separator />
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Extraction Result</h4>
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
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-md">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                  <div className="text-sm text-red-700">{result.error}</div>
                </div>
              )}

              {result.success && (
                <div className="space-y-4">
                  {/* Content Bounds */}
                  {(result.bbox || result.contentBounds) && (
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium text-green-700">Content Bounds</h5>
                      <div className="p-3 bg-green-50 rounded-md">
                        {formatBounds(result.bbox || result.contentBounds!)}
                      </div>
                    </div>
                  )}

                  {/* CSS Bounds */}
                  {result.cssBbox && (
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium text-blue-700">CSS Pixel Bounds</h5>
                      <div className="p-3 bg-blue-50 rounded-md">
                        {formatBounds(result.cssBbox)}
                      </div>
                    </div>
                  )}

                  {/* Original PDF Bounds */}
                  {result.pdfBbox && (
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium text-gray-700">Original PDF Bounds</h5>
                      <div className="p-3 bg-gray-50 rounded-md">
                        {formatBounds(result.pdfBbox)}
                      </div>
                    </div>
                  )}

                  {/* ViewBox Bounds (SVG) */}
                  {result.viewBoxBounds && (
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium text-purple-700">SVG ViewBox Bounds</h5>
                      <div className="p-3 bg-purple-50 rounded-md">
                        {formatBounds(result.viewBoxBounds)}
                      </div>
                    </div>
                  )}

                  {/* Comparison */}
                  {result.bbox && result.pdfBbox && (
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium">Content vs. Page Size</h5>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>Content: {((result.bbox.width / result.pdfBbox.width) * 100).toFixed(1)}% width</div>
                        <div>Content: {((result.bbox.height / result.pdfBbox.height) * 100).toFixed(1)}% height</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}