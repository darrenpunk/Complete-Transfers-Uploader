/**
 * Bounds Testing Page
 * 
 * Comprehensive testing interface for PDF and SVG bounds extraction
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BoundsExtractorDemo } from '@/components/bounds-extractor-demo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FileText, Image, Loader2 } from 'lucide-react';

interface Logo {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
}

interface Project {
  id: string;
  name: string;
  logos: Logo[];
}

export function BoundsTestingPage() {
  const [selectedLogo, setSelectedLogo] = useState<Logo | null>(null);

  // Fetch all projects with logos for testing
  const { data: projects, isLoading } = useQuery({
    queryKey: ['/api/projects'],
    select: (data: Project[]) => data.filter(p => p.logos && p.logos.length > 0)
  });

  // Get all available logos across projects
  const allLogos = projects?.flatMap(p => p.logos.map(logo => ({ ...logo, projectName: p.name }))) || [];
  const supportedLogos = allLogos.filter(logo => 
    logo.mimeType === 'application/pdf' || logo.mimeType === 'image/svg+xml'
  );

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Vector Bounds Extraction Testing</h1>
        <p className="text-muted-foreground">
          Test precise vector content bounding box detection for PDF and SVG files
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Logo Selection Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Select Logo for Testing</CardTitle>
            <CardDescription>
              Choose a PDF or SVG file to extract vector content bounds
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="ml-2">Loading projects...</span>
              </div>
            ) : supportedLogos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No PDF or SVG files found. Upload some files to test bounds extraction.
              </div>
            ) : (
              <>
                <Select
                  value={selectedLogo?.id || ''}
                  onValueChange={(logoId) => {
                    const logo = supportedLogos.find(l => l.id === logoId);
                    setSelectedLogo(logo || null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a logo file" />
                  </SelectTrigger>
                  <SelectContent>
                    {supportedLogos.map((logo) => (
                      <SelectItem key={logo.id} value={logo.id}>
                        <div className="flex items-center gap-2">
                          {logo.mimeType === 'application/pdf' ? (
                            <FileText className="w-4 h-4" />
                          ) : (
                            <Image className="w-4 h-4" />
                          )}
                          <span className="truncate max-w-[200px]">
                            {logo.originalName || logo.filename}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {logo.mimeType === 'application/pdf' ? 'PDF' : 'SVG'}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedLogo && (
                  <div className="space-y-2 p-3 bg-muted rounded-md">
                    <div className="text-sm font-medium">Selected File</div>
                    <div className="text-sm text-muted-foreground">
                      Name: {selectedLogo.originalName || selectedLogo.filename}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Type: {selectedLogo.mimeType}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Project: {(selectedLogo as any).projectName}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Bounds Extraction Demo */}
        <div>
          {selectedLogo ? (
            <BoundsExtractorDemo
              logoId={selectedLogo.id}
              filename={selectedLogo.originalName || selectedLogo.filename}
              mimeType={selectedLogo.mimeType}
            />
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-16">
                <div className="text-center space-y-2">
                  <div className="text-muted-foreground">
                    Select a logo file to start bounds extraction testing
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Algorithm Information */}
      <Card>
        <CardHeader>
          <CardTitle>Bounds Extraction Methods</CardTitle>
          <CardDescription>
            Understanding the different approaches used for vector content bounds detection
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-medium">PDF Extraction Methods</h4>
              
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <Badge className="bg-green-100 text-green-800">Ghostscript</Badge>
                  <div className="text-sm">
                    <div className="font-medium">Vector Analysis</div>
                    <div className="text-muted-foreground">
                      Analyzes vector paths directly from PDF content streams for highest accuracy
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Badge className="bg-yellow-100 text-yellow-800">Raster Fallback</Badge>
                  <div className="text-sm">
                    <div className="font-medium">High-DPI Rendering</div>
                    <div className="text-muted-foreground">
                      Renders at 300 DPI and crops transparent pixels when vector analysis fails
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium">SVG Extraction Methods</h4>
              
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <Badge className="bg-purple-100 text-purple-800">Path Calculation</Badge>
                  <div className="text-sm">
                    <div className="font-medium">Geometric Analysis</div>
                    <div className="text-muted-foreground">
                      Parses path data and geometric elements to calculate precise bounds
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Badge className="bg-blue-100 text-blue-800">DOM Analysis</Badge>
                  <div className="text-sm">
                    <div className="font-medium">Element Inspection</div>
                    <div className="text-muted-foreground">
                      Analyzes all SVG elements (rect, circle, path, etc.) for comprehensive bounds
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}