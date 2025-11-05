import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CompleteTransferLogo from "./complete-transfer-logo";
import { ShoppingCart, Plus, ExternalLink } from "lucide-react";

interface AddToCartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onAddToCart: (action: 'new-project' | 'view-cart') => void;
  isAddingToCart?: boolean;
}

export default function AddToCartModal({
  open,
  onOpenChange,
  projectName,
  onAddToCart,
  isAddingToCart = false,
}: AddToCartModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <CompleteTransferLogo size="md" className="mb-4" />
          <DialogTitle className="flex items-center gap-2 justify-center">
            <ShoppingCart className="w-5 h-5" />
            Ready to Add to Cart
          </DialogTitle>
          <DialogDescription className="text-center">
            Your project <span className="font-semibold text-foreground">"{projectName}"</span> is ready to be added to your Odoo shopping cart.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-6 space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 border border-border">
            <p className="text-sm text-muted-foreground text-center">
              After adding to cart, you can continue shopping or proceed to checkout in Odoo.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            onClick={() => onAddToCart('new-project')}
            disabled={isAddingToCart}
            className="w-full"
            size="lg"
            data-testid="button-add-cart-new-project"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            {isAddingToCart ? 'Adding...' : 'Add to Cart & Start New Project'}
            <Plus className="w-4 h-4 ml-2" />
          </Button>
          
          <Button
            onClick={() => onAddToCart('view-cart')}
            disabled={isAddingToCart}
            variant="outline"
            className="w-full"
            size="lg"
            data-testid="button-add-cart-view-cart"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            {isAddingToCart ? 'Adding...' : 'Add to Cart & View Cart'}
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
          
          <Button
            onClick={() => onOpenChange(false)}
            disabled={isAddingToCart}
            variant="ghost"
            className="w-full"
            size="sm"
            data-testid="button-cancel-add-cart"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
