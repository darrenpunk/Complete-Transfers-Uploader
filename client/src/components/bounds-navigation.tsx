/**
 * Bounds Navigation Component
 * 
 * Quick navigation to bounds extraction testing features
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, TestTube, Target } from 'lucide-react';
import { Link } from 'wouter';

export function BoundsNavigation() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5" />
          Vector Bounds Tools
        </CardTitle>
        <CardDescription>
          Test precise content bounds extraction
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <Link href="/bounds-demo">
          <Button variant="outline" className="w-full justify-start">
            <TestTube className="w-4 h-4 mr-2" />
            Quick Bounds Demo
          </Button>
        </Link>

        <Link href="/bounds-testing">
          <Button variant="outline" className="w-full justify-start">
            <FileText className="w-4 h-4 mr-2" />
            Advanced Testing
          </Button>
        </Link>

        <div className="text-xs text-muted-foreground pt-2">
          Extract tight vector content bounding boxes from PDF and SVG files for accurate positioning and scaling.
        </div>
      </CardContent>
    </Card>
  );
}