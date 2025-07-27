import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Palette, Eye, EyeOff } from "lucide-react";

interface ColorManagementToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  iccProfileName?: string;
}

export default function ColorManagementToggle({ 
  enabled, 
  onToggle, 
  iccProfileName = "PSO Coated FOGRA51" 
}: ColorManagementToggleProps) {
  return (
    <div className="flex items-center space-x-2 p-2 bg-card rounded-lg border">
      <Palette className="w-4 h-4 text-muted-foreground" />
      <div className="flex-1">
        <div className="text-sm font-medium">Color Management</div>
        <div className="text-xs text-muted-foreground">
          Preview with {iccProfileName} ICC profile
        </div>
      </div>
      <Button
        variant={enabled ? "default" : "outline"}
        size="sm"
        onClick={() => onToggle(!enabled)}
        className="flex items-center space-x-1"
      >
        {enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        <span className="text-xs">{enabled ? "ON" : "OFF"}</span>
      </Button>
      {enabled && (
        <Badge variant="secondary" className="text-xs">
          Print Preview
        </Badge>
      )}
    </div>
  );
}