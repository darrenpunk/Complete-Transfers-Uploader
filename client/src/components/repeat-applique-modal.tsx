import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileArchive, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import CompleteTransferLogo from "./complete-transfer-logo";
import type { TemplateSize } from "@shared/schema";

interface RepeatAppliqueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (projectId: string) => void;
}

export default function RepeatAppliqueModal({
  open,
  onOpenChange,
  onSuccess,
}: RepeatAppliqueModalProps) {
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const { data: templateSizes = [] } = useQuery<TemplateSize[]>({
    queryKey: ["/api/template-sizes"],
  });

  const appliqueTemplates = templateSizes.filter(
    (t) => t.name?.toLowerCase().includes("applique") || t.id?.startsWith("applique-")
  );

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!zipFile) throw new Error("No ZIP file selected");

      const formData = new FormData();
      formData.append("zipFile", zipFile);
      if (projectName.trim()) formData.append("projectName", projectName.trim());
      formData.append("quantity", quantity.toString());
      if (selectedTemplateId && selectedTemplateId !== "auto") {
        formData.append("templateSizeId", selectedTemplateId);
      }

      const response = await fetch("/api/projects/repeat-applique-zip", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Upload failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      if (data.project?.id) {
        onSuccess(data.project.id);
        handleClose();
      }
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setZipFile(acceptedFiles[0]);
      if (!projectName) {
        const name = acceptedFiles[0].name.replace(/\.zip$/i, "");
        setProjectName(name);
      }
    }
  }, [projectName]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/zip": [".zip"],
      "application/x-zip-compressed": [".zip"],
    },
    maxFiles: 1,
    multiple: false,
  });

  const handleClose = () => {
    setZipFile(null);
    setProjectName("");
    setQuantity(1);
    setSelectedTemplateId("");
    uploadMutation.reset();
    onOpenChange(false);
  };

  const handleSubmit = () => {
    uploadMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <CompleteTransferLogo size="sm" className="mb-2" />
          <DialogTitle className="text-xl font-bold text-center">
            Repeat Applique Order
          </DialogTitle>
          <DialogDescription className="text-center text-gray-400">
            Upload the ZIP file from your previous applique order to quickly reorder
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-primary bg-primary/10"
                : zipFile
                ? "border-green-500 bg-green-500/10"
                : "border-gray-600 hover:border-gray-400"
            }`}
          >
            <input {...getInputProps()} />
            {zipFile ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle className="w-10 h-10 text-green-500" />
                <p className="text-sm font-medium text-green-400">{zipFile.name}</p>
                <p className="text-xs text-gray-400">
                  {(zipFile.size / (1024 * 1024)).toFixed(1)} MB - Click or drag to replace
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FileArchive className="w-10 h-10 text-gray-400" />
                <p className="text-sm font-medium text-gray-300">
                  {isDragActive ? "Drop your ZIP file here" : "Drag & drop your ZIP file here"}
                </p>
                <p className="text-xs text-gray-500">
                  or click to browse - contains artwork + embroidery files
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="repeat-project-name">Project Name</Label>
            <Input
              id="repeat-project-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Company Logo Repeat Order"
            />
          </div>

          {appliqueTemplates.length > 1 && (
            <div className="space-y-2">
              <Label>Template Size</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Auto-detect (default)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect</SelectItem>
                  {appliqueTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label} ({t.width}x{t.height}mm)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="repeat-quantity">Quantity</Label>
            <Input
              id="repeat-quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
            />
          </div>

          {uploadMutation.isError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">
                {uploadMutation.error?.message || "Failed to process ZIP file"}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={handleClose} className="flex-1" disabled={uploadMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!zipFile || uploadMutation.isPending}
            className="flex-1"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload & Create Project
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
