import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileImage, X, AlertCircle } from "lucide-react";
import { RasterWarningModal } from "./raster-warning-modal";
import { VectorizerModal } from "./vectorizer-modal";

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  onVectorizationPlaceholder: (fileName: string) => void;
  isUploading: boolean;
  uploadProgress?: number;
}

interface PendingRasterFile {
  file: File;
  fileName: string;
}

export default function UploadZone({ onFilesSelected, onVectorizationPlaceholder, isUploading, uploadProgress = 0 }: UploadZoneProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pendingRasterFile, setPendingRasterFile] = useState<PendingRasterFile | null>(null);
  const [showRasterWarning, setShowRasterWarning] = useState(false);
  const [showVectorizer, setShowVectorizer] = useState(false);

  const isRasterFile = (file: File): boolean => {
    return file.type === 'image/png' || file.type === 'image/jpeg';
  };

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      console.warn("Some files were rejected:", rejectedFiles);
    }
    
    // Check for raster files and handle them separately
    const rasterFiles = acceptedFiles.filter(isRasterFile);
    const vectorFiles = acceptedFiles.filter(file => !isRasterFile(file));
    
    // Add vector files immediately
    if (vectorFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...vectorFiles]);
    }
    
    // Handle raster files one by one with warning modal
    if (rasterFiles.length > 0) {
      const firstRasterFile = rasterFiles[0];
      setPendingRasterFile({ file: firstRasterFile, fileName: firstRasterFile.name });
      setShowRasterWarning(true);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/svg+xml': ['.svg'],
      'application/pdf': ['.pdf'],
    },
    multiple: true,
    maxSize: 100 * 1024 * 1024, // 100MB
    onDropRejected: (rejectedFiles) => {
      console.log('Files rejected:', rejectedFiles.map(f => ({ 
        name: f.file.name, 
        errors: f.errors.map(e => e.message) 
      })));
    }
  });

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      onFilesSelected(selectedFiles);
      setSelectedFiles([]);
    }
  };

  // Raster warning modal handlers
  const handlePhotographicApprove = () => {
    if (pendingRasterFile) {
      setSelectedFiles(prev => [...prev, pendingRasterFile.file]);
      setPendingRasterFile(null);
      setShowRasterWarning(false);
    }
  };

  const handleVectorizeWithAI = () => {
    if (pendingRasterFile) {
      setShowRasterWarning(false);
      setShowVectorizer(true);
    }
  };

  const handleVectorizeWithService = () => {
    if (pendingRasterFile) {
      onVectorizationPlaceholder(pendingRasterFile.fileName);
      setPendingRasterFile(null);
      setShowRasterWarning(false);
    }
  };

  const handleVectorDownload = (vectorSvg: string) => {
    // Convert SVG string to File object
    const svgBlob = new Blob([vectorSvg], { type: 'image/svg+xml' });
    const svgFile = new File([svgBlob], pendingRasterFile?.fileName.replace(/\.(png|jpg|jpeg)$/i, '.svg') || 'vectorized.svg', {
      type: 'image/svg+xml'
    });
    
    setSelectedFiles(prev => [...prev, svgFile]);
    setPendingRasterFile(null);
    setShowVectorizer(false);
  };

  const handleCloseRasterWarning = () => {
    setPendingRasterFile(null);
    setShowRasterWarning(false);
  };

  const handleCloseVectorizer = () => {
    setPendingRasterFile(null);
    setShowVectorizer(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <Card>
        <CardContent className="p-6">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive 
                ? 'border-primary bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">
              {isDragActive ? 'Drop files here' : 'Drag & drop your logos here'}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              or click to browse files
            </p>
            <p className="text-xs text-gray-500">
              Supports PNG, JPEG, SVG, PDF • Max 10MB per file
            </p>
            <p className="text-xs text-blue-600 mt-2">
              📷 Images display as previews • 📄 PDFs show as document icons
            </p>
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      {selectedFiles.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-medium text-gray-900 mb-3">Selected Files</h4>
            <div className="space-y-2">
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex items-center space-x-3">
                    <FileImage className="w-5 h-5 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)} • {file.type.split('/')[1].toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            
            <Button 
              onClick={handleUpload} 
              disabled={isUploading}
              className="w-full mt-4"
            >
              {isUploading ? 'Uploading...' : `Upload ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Upload Progress */}
      {isUploading && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Upload className="w-5 h-5 text-blue-500 animate-pulse" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-900">Uploading files...</p>
                  <span className="text-sm text-gray-600">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-gray-500 mt-1">
                  Processing and analyzing your logos for print quality
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Guidelines */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Upload Guidelines</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Use high-resolution files (300 DPI minimum)</li>
                <li>• Vector formats (SVG, PDF) are preferred</li>
                <li>• Ensure logos have transparent backgrounds</li>
                <li>• CMYK color mode recommended for printing</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Raster Warning Modal */}
      {pendingRasterFile && (
        <RasterWarningModal
          open={showRasterWarning}
          onClose={handleCloseRasterWarning}
          fileName={pendingRasterFile.fileName}
          onPhotographicApprove={handlePhotographicApprove}
          onVectorizeWithAI={handleVectorizeWithAI}
          onVectorizeWithService={handleVectorizeWithService}
        />
      )}

      {/* Vectorizer Modal */}
      {pendingRasterFile && (
        <VectorizerModal
          open={showVectorizer}
          onClose={handleCloseVectorizer}
          fileName={pendingRasterFile.fileName}
          imageFile={pendingRasterFile.file}
          onVectorDownload={handleVectorDownload}
        />
      )}
    </div>
  );
}
