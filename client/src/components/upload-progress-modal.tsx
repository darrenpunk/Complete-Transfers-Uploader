import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Upload, CheckCircle2, Loader2 } from "lucide-react";

interface UploadProgressModalProps {
  open: boolean;
  progress: number;
  fileName: string;
  fileCount: number;
  currentFileIndex: number;
  isProcessing: boolean;
}

export function UploadProgressModal({
  open,
  progress,
  fileName,
  fileCount,
  currentFileIndex,
  isProcessing
}: UploadProgressModalProps) {
  const isComplete = progress >= 100 && !isProcessing;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isComplete ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Upload className="h-5 w-5 text-primary" />
            )}
            {isComplete ? "Upload Complete" : "Uploading Files"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-3">
            {isProcessing ? (
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            ) : isComplete ? (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            ) : (
              <Upload className="h-8 w-8 text-primary" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground">
                {fileCount > 1 ? `File ${currentFileIndex} of ${fileCount}` : "Uploading..."}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{isProcessing ? "Processing..." : isComplete ? "Complete" : "Uploading..."}</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>

          {isProcessing && (
            <p className="text-xs text-muted-foreground text-center">
              Processing your artwork. This may take a moment for large files...
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
