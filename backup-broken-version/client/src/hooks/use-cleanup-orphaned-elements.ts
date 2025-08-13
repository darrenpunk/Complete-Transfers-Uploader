/**
 * ORPHANED ELEMENT CLEANUP HOOK
 * 
 * Automatically detects and removes canvas elements that reference deleted logos.
 * This prevents "Unknown" placeholders from appearing on the canvas.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CanvasElement, Logo } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

interface UseCleanupOrphanedElementsProps {
  projectId: string;
  canvasElements: CanvasElement[];
  logos: Logo[];
}

export function useCleanupOrphanedElements({ 
  projectId, 
  canvasElements, 
  logos 
}: UseCleanupOrphanedElementsProps) {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    if (!canvasElements || !logos || canvasElements.length === 0) return;
    
    // Find orphaned elements (elements with logoId but no matching logo)
    const orphanedElements = canvasElements.filter(element => {
      if (!element.logoId) return false;
      
      const logoExists = logos.some(logo => logo.id === element.logoId);
      if (!logoExists) {
        console.warn(`🧹 Found orphaned canvas element: ${element.id} references missing logo: ${element.logoId}`);
        return true;
      }
      
      return false;
    });
    
    // Clean up orphaned elements if any found
    if (orphanedElements.length > 0) {
      console.log(`🧹 Cleaning up ${orphanedElements.length} orphaned canvas elements`);
      
      // Delete each orphaned element
      Promise.all(
        orphanedElements.map(async (element) => {
          try {
            await apiRequest('DELETE', `/api/canvas-elements/${element.id}`);
            console.log(`🧹 Deleted orphaned element: ${element.id}`);
          } catch (error) {
            console.error(`Failed to delete orphaned element ${element.id}:`, error);
          }
        })
      ).then(() => {
        // Refresh canvas elements after cleanup
        queryClient.invalidateQueries({ 
          queryKey: ["/api/projects", projectId, "canvas-elements"] 
        });
        
        console.log(`✅ Orphaned element cleanup completed`);
      });
    }
  }, [canvasElements, logos, projectId, queryClient]);
}