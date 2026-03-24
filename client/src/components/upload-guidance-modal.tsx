import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FileText, Image, FileImage, Upload, ExternalLink, CheckCircle2, FileCheck, HardDrive, Lightbulb, FileArchive, Loader2, X, AlertCircle } from "lucide-react";

interface UploadGuidanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewArtworkRequirements?: () => void;
  onStartUploading?: () => void;
  isAppliqueTemplate?: boolean;
  projectId?: string;
  onZipAttached?: () => void;
}

export function UploadGuidanceModal({ open, onOpenChange, onViewArtworkRequirements, onStartUploading, isAppliqueTemplate, projectId, onZipAttached }: UploadGuidanceModalProps) {
  const queryClient = useQueryClient();
  const [zipFile, setZipFile] = useState<File | null>(null);

  const attachZipMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!projectId) throw new Error("No project");
      const formData = new FormData();
      formData.append("zipFile", file);
      const response = await fetch(`/api/projects/${projectId}/attach-zip`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Upload failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      onOpenChange(false);
      setZipFile(null);
      if (onZipAttached) onZipAttached();
    },
  });

  const onDropZip = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setZipFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps: getZipRootProps, getInputProps: getZipInputProps, isDragActive: isZipDragActive } = useDropzone({
    onDrop: onDropZip,
    accept: {
      "application/zip": [".zip"],
      "application/x-zip-compressed": [".zip"],
    },
    maxFiles: 1,
    multiple: false,
  });
  const fileTypes = [
    {
      icon: FileText,
      name: "PDF with vectors",
      extension: ".pdf",
      description: "Recommended for best quality",
      color: "text-red-500"
    },
    {
      icon: Image,
      name: "SVG",
      extension: ".svg",
      description: "Scalable vector graphics",
      color: "text-orange-500"
    },
    {
      icon: FileText,
      name: "AI",
      extension: ".ai",
      description: "Adobe Illustrator files",
      color: "text-blue-500"
    },
    {
      icon: FileImage,
      name: "JPEG/PNG",
      extension: ".jpg, .jpeg, .png",
      description: "Photos that cannot be vectorized",
      color: "text-purple-500"
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

        {/* Action Button - at top for easy access */}
        <Button
          className="w-full mt-4"
          onClick={() => {
            if (onStartUploading) {
              onStartUploading();
            } else {
              onOpenChange(false);
            }
          }}
          data-testid="button-start-uploading"
        >
          <Upload className="h-4 w-4 mr-2" />
          Start Uploading
        </Button>

        {isAppliqueTemplate && projectId && (
          <div className="mt-4 p-4 rounded-lg border-2 border-amber-500/30 bg-amber-500/5">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-amber-200">
              <FileArchive className="h-4 w-4" />
              Repeat Applique Order
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Have a ZIP from a previous order? Upload it to reorder with the same artwork and embroidery files.
            </p>
            <div
              {...getZipRootProps()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                isZipDragActive
                  ? "border-amber-400 bg-amber-400/10"
                  : zipFile
                  ? "border-green-500 bg-green-500/10"
                  : "border-gray-600 hover:border-gray-400"
              }`}
            >
              <input {...getZipInputProps()} />
              {zipFile ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-green-400">{zipFile.name}</p>
                      <p className="text-xs text-gray-400">{(zipFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setZipFile(null); attachZipMutation.reset(); }}
                    className="p-1 hover:bg-gray-700 rounded"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <FileArchive className="w-8 h-8 text-gray-400" />
                  <p className="text-sm text-gray-300">
                    {isZipDragActive ? "Drop ZIP here" : "Drag & drop ZIP file or click to browse"}
                  </p>
                </div>
              )}
            </div>
            {attachZipMutation.isError && (
              <div className="flex items-center gap-2 mt-2 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {attachZipMutation.error?.message || "Upload failed"}
              </div>
            )}
            {zipFile && (
              <Button
                className="w-full mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => attachZipMutation.mutate(zipFile)}
                disabled={attachZipMutation.isPending}
              >
                {attachZipMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading ZIP...</>
                ) : (
                  <><FileArchive className="w-4 h-4 mr-2" />Attach ZIP & Add to Cart</>
                )}
              </Button>
            )}
          </div>
        )}

        <div className="py-4">
          {/* Best Practices - Always visible */}
          <div className="mb-4">
            <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
              <Lightbulb className="h-5 w-5 text-primary" />
              Best Practices
            </h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Vector files (PDF, SVG, AI) provide the sharpest print quality</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Use JPEG/PNG only for photographic images that cannot be vectorized</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Files are automatically converted to CMYK for print-ready output</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Ensure all text is converted to outlines/paths</span>
              </li>
            </ul>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {/* File Types */}
            <AccordionItem value="file-types">
              <AccordionTrigger className="text-base font-semibold">
                <span className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-primary" />
                  Accepted File Types
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-2 gap-3 pt-2">
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
              </AccordionContent>
            </AccordionItem>

            {/* File Size */}
            <AccordionItem value="file-size">
              <AccordionTrigger className="text-base font-semibold">
                <span className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-primary" />
                  File Size Limit
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">
                    Maximum file size: <strong>500MB</strong> per file. Files over 100MB are uploaded in chunks automatically.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Artwork Requirements Link */}
          <div className="border-t pt-4 mt-4">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
