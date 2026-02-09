import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Palette, Check, X, Loader2, Send } from "lucide-react";

interface ColorGroup {
  color: string;
  hex: string;
  count: number;
  indices: number[];
}

interface ColorElementSelectorProps {
  logoId: string;
  open: boolean;
  onClose: () => void;
  onSelectByColors: (indices: number[]) => void;
  onSendToEmbroidery: (indices: number[]) => void;
  selectedIndices: Set<number>;
  isProcessing?: boolean;
}

export function ColorElementSelector({
  logoId,
  open,
  onClose,
  onSelectByColors,
  onSendToEmbroidery,
  selectedIndices,
  isProcessing = false,
}: ColorElementSelectorProps) {
  const [colorGroups, setColorGroups] = useState<ColorGroup[]>([]);
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (open && logoId) {
      setLoading(true);
      fetch(`/api/logos/${logoId}/colors`)
        .then(r => r.json())
        .then((data: ColorGroup[]) => {
          setColorGroups(data);
          setSelectedColors(new Set());
        })
        .catch(() => setColorGroups([]))
        .finally(() => setLoading(false));
    }
  }, [open, logoId]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, [role="button"]')) return;
    setDragging(true);
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [position]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, dragOffset]);

  const toggleColor = (hex: string) => {
    setSelectedColors(prev => {
      const next = new Set(prev);
      if (next.has(hex)) {
        next.delete(hex);
      } else {
        next.add(hex);
      }
      return next;
    });
  };

  useEffect(() => {
    const indices: number[] = [];
    colorGroups.forEach(group => {
      if (selectedColors.has(group.hex)) {
        indices.push(...group.indices);
      }
    });
    onSelectByColors(indices);
  }, [selectedColors, colorGroups]);

  const selectedIndicesFromColors = colorGroups
    .filter(g => selectedColors.has(g.hex))
    .flatMap(g => g.indices);

  const totalSelected = selectedIndicesFromColors.length;

  if (!open) return null;

  return (
    <div
      className="fixed z-50 w-64 bg-background border border-border rounded-xl shadow-2xl overflow-hidden"
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="px-3 py-2 bg-purple-600 text-white flex items-center justify-between cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Palette className="w-4 h-4" />
          Select by Color
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3 max-h-[60vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : colorGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No colors found in SVG
          </p>
        ) : (
          <div className="space-y-1">
            {colorGroups.map((group) => {
              const isActive = selectedColors.has(group.hex);
              return (
                <button
                  key={group.hex}
                  onClick={() => toggleColor(group.hex)}
                  className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all text-left ${
                    isActive
                      ? 'bg-purple-500/15 ring-1 ring-purple-500/50'
                      : 'hover:bg-muted/60'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-7 h-7 rounded-md border border-white/20 shadow-sm"
                      style={{ backgroundColor: group.hex }}
                    />
                    {isActive && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Check className="w-4 h-4 text-white drop-shadow-md" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono truncate">{group.hex}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {group.count} element{group.count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedColors.size > 0 && (
        <div className="px-3 py-2 border-t border-border bg-muted/30">
          <Button
            size="sm"
            onClick={() => onSendToEmbroidery(selectedIndicesFromColors)}
            disabled={isProcessing}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs h-8"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5 mr-1" />
                Send {totalSelected} to Embroidery
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
