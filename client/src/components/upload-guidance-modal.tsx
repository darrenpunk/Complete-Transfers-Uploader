import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Image, FileImage, Upload, ExternalLink, CheckCircle2 } from "lucide-react";

interface UploadGuidanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewArtworkRequirements?: () => void;
}

export function UploadGuidanceModal({ open, onOpenChange, onViewArtworkRequirements }: UploadGuidanceModalProps) {
  const fileTypes = [
    {
      icon: FileText,
      name: "PDF",
      extension: ".pdf",
      description: "Recommended for best quality",
      color: "text-red-500"
    },
    {
      icon: Image,
      name: "SVG",
      extension: ".svg",
      description: "Vector graphics",
      color: "text-orange-500"
    },
    {
      icon: FileImage,
      name: "PNG",
      extension: ".png",
      description: "Transparent backgrounds supported",
      color: "text-blue-500"
    },
    {
      icon: FileImage,
      name: "JPEG/JPG",
      extension: ".jpg, .jpeg",
      description: "Photos and raster images",
      color: "text-green-500"
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="modal-upload-guidance">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Upload className="h-6 w-6" />
            Upload Your Artwork
          </DialogTitle>
          <DialogDescription>
            Get the best results by following these guidelines
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* File Types */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Accepted File Types
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {fileTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <div
                    key={type.name}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-muted/50"
                    data-testid={`file-type-${type.name.toLowerCase()}`}
                  >
                    <Icon className={`h-5 w-5 ${type.color} mt-0.5`} />
                    <div>
                      <div className="font-medium">{type.name}</div>
                      <div className="text-xs text-muted-foreground">{type.extension}</div>
                      <div className="text-xs text-muted-foreground mt-1">{type.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* File Size */}
          <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
            <h3 className="font-semibold mb-2">File Size Limit</h3>
            <p className="text-sm text-muted-foreground">
              Maximum file size: <strong>200MB</strong> per file
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              For larger files, try optimizing the PDF or reducing image resolution
            </p>
          </div>

          {/* Best Practices */}
          <div>
            <h3 className="font-semibold mb-3">Best Practices</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Vector files (PDF, SVG) provide the sharpest print quality</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Files are automatically converted to CMYK for print-ready output</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>You can upload multiple files at once</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Transparent PNG files are fully supported</span>
              </li>
            </ul>
          </div>

          {/* Artwork Requirements Link */}
          <div className="border-t pt-4">
            <Button
              variant="outline"
              className="w-full"
              data-testid="button-artwork-requirements"
              onClick={() => {
                if (onViewArtworkRequirements) {
                  onViewArtworkRequirements();
                } else {
                  window.open('/artwork-requirements', '_blank');
                }
              }}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Full Artwork Requirements
            </Button>
          </div>

          {/* Action Button */}
          <Button
            className="w-full"
            onClick={() => onOpenChange(false)}
            data-testid="button-start-uploading"
          >
            <Upload className="h-4 w-4 mr-2" />
            Start Uploading
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
