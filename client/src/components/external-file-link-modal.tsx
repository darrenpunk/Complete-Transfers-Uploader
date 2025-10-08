import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, Upload } from "lucide-react";

interface ExternalFileLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    fileUrl: string;
    service: string;
    fileName: string;
    notes?: string;
  }) => void;
}

export function ExternalFileLinkModal({
  open,
  onOpenChange,
  onSubmit,
}: ExternalFileLinkModalProps) {
  const [fileUrl, setFileUrl] = useState("");
  const [service, setService] = useState("wetransfer");
  const [fileName, setFileName] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!fileUrl || !fileName) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        fileUrl,
        service,
        fileName,
        notes,
      });
      
      // Reset form
      setFileUrl("");
      setFileName("");
      setNotes("");
      setService("wetransfer");
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload via File Transfer Service
          </DialogTitle>
          <DialogDescription>
            Upload your large file to WeTransfer or Dropbox, then share the link here. 
            We'll download it during production.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="service">File Transfer Service</Label>
            <Select value={service} onValueChange={setService}>
              <SelectTrigger id="service" data-testid="select-file-service">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wetransfer">WeTransfer</SelectItem>
                <SelectItem value="dropbox">Dropbox</SelectItem>
                <SelectItem value="google-drive">Google Drive</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-url">Share Link *</Label>
            <Input
              id="file-url"
              type="url"
              placeholder="https://wetransfer.com/downloads/..."
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              data-testid="input-file-url"
            />
            <p className="text-xs text-muted-foreground">
              Make sure the link is publicly accessible
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-name">Original File Name *</Label>
            <Input
              id="file-name"
              placeholder="my-artwork.pdf"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              data-testid="input-file-name"
            />
            <p className="text-xs text-muted-foreground">
              Help us identify your file (include extension: .pdf, .ai, etc.)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any special instructions or details about the file..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="textarea-notes"
            />
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>How it works:</strong>
            </p>
            <ul className="text-xs text-blue-700 dark:text-blue-300 mt-2 space-y-1 list-disc list-inside">
              <li>Upload your file to WeTransfer, Dropbox, or Google Drive</li>
              <li>Get a shareable link and paste it here</li>
              <li>A placeholder will appear on your canvas</li>
              <li>Complete your order as normal</li>
              <li>Our production team will download your file from the link</li>
            </ul>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            data-testid="button-cancel-external-link"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!fileUrl || !fileName || isSubmitting}
            data-testid="button-submit-external-link"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            {isSubmitting ? "Adding..." : "Add to Canvas"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
