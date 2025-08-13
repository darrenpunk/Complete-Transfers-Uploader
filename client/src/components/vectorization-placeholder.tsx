import { Wand2, AlertCircle } from "lucide-react";

interface VectorizationPlaceholderProps {
  fileName: string;
  width: number;
  height: number;
  position: { x: number; y: number };
}

export function VectorizationPlaceholder({
  fileName,
  width,
  height,
  position
}: VectorizationPlaceholderProps) {
  return (
    <div 
      className="absolute border-2 border-dashed border-orange-400 bg-orange-50/80 dark:bg-orange-900/20 rounded-lg flex flex-col items-center justify-center text-center p-4"
      style={{
        left: position.x,
        top: position.y,
        width,
        height,
        minWidth: '200px',
        minHeight: '120px'
      }}
    >
      <div className="bg-orange-100 dark:bg-orange-900/50 p-3 rounded-full mb-3">
        <Wand2 className="h-8 w-8 text-orange-600" />
      </div>
      
      <h3 className="font-semibold text-orange-800 dark:text-orange-200 mb-2">
        Vectorization Service Required
      </h3>
      
      <p className="text-sm text-orange-700 dark:text-orange-300 mb-2">
        {fileName}
      </p>
      
      <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
        <AlertCircle className="h-3 w-3" />
        <span>Professional vectorization will be added to order</span>
      </div>
    </div>
  );
}