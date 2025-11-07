import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import CompleteTransferLogo from "./complete-transfer-logo";
import { ShoppingCart, Plus, ExternalLink, Download, FileText } from "lucide-react";

interface AddToCartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onAddToCart: (action: 'new-project' | 'view-cart') => void;
  onDownloadPDF?: () => void;
  isAddingToCart?: boolean;
  isGeneratingPDF?: boolean;
}

export default function AddToCartModal({
  open,
  onOpenChange,
  projectName,
  onAddToCart,
  onDownloadPDF,
  isAddingToCart = false,
  isGeneratingPDF = false,
}: AddToCartModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <CompleteTransferLogo size="md" className="mb-4" />
          <DialogTitle className="flex items-center gap-2 justify-center text-xl">
            <ShoppingCart className="w-6 h-6 text-primary" />
            Next Step: Add to Cart
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            Your project <span className="font-semibold text-foreground">"{projectName}"</span> is ready to order.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          {/* Primary Action Section */}
          <div className="bg-primary/5 rounded-lg p-6 border-2 border-primary/20">
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">
                1
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Add to Your Cart</h3>
                <p className="text-sm text-muted-foreground">
                  Choose your next action after adding this project to your Odoo shopping cart.
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Button
                onClick={() => onAddToCart('view-cart')}
                disabled={isAddingToCart || isGeneratingPDF}
                className="w-full bg-primary hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all"
                size="lg"
                data-testid="button-add-cart-view-cart"
              >
                <ShoppingCart className="w-5 h-5 mr-2" />
                {isAddingToCart ? 'Adding to Cart...' : 'Add to Cart & View Cart'}
                <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
              
              <Button
                onClick={() => onAddToCart('new-project')}
                disabled={isAddingToCart || isGeneratingPDF}
                variant="outline"
                className="w-full border-2"
                size="lg"
                data-testid="button-add-cart-new-project"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                {isAddingToCart ? 'Adding to Cart...' : 'Add to Cart & Create Another'}
                <Plus className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Optional Action Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span className="font-medium">Optional: Download for Your Records</span>
            </div>
            
            {onDownloadPDF && (
              <Button
                onClick={onDownloadPDF}
                disabled={isAddingToCart || isGeneratingPDF}
                variant="secondary"
                className="w-full"
                size="default"
                data-testid="button-download-pdf"
              >
                <Download className="w-4 h-4 mr-2" />
                {isGeneratingPDF ? 'Generating PDF...' : 'Download PDF Copy'}
              </Button>
            )}
            
            <p className="text-xs text-muted-foreground text-center px-4">
              You can download a PDF copy of your artwork for your records. This is optional and won't affect your order.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2 pt-4 border-t">
          <Button
            onClick={() => onOpenChange(false)}
            disabled={isAddingToCart || isGeneratingPDF}
            variant="ghost"
            className="w-full"
            size="sm"
            data-testid="button-cancel-add-cart"
          >
            Go Back to Editor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
