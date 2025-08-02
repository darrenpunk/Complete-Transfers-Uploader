import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Palette } from "lucide-react";
import { CompleteTransferLogo } from "./complete-transfer-logo";

interface ColorModesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ColorModesModal({ open, onOpenChange }: ColorModesModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <CompleteTransferLogo size="md" className="mb-4" />
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Palette className="w-5 h-5" />
            The Importance of Colour Modes
          </DialogTitle>
          <DialogDescription>
            When designing for our transfers here is a guide to predictable colour reproduction of your designs...
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[calc(90vh-120px)] px-6 pb-6">
          <div className="prose prose-sm max-w-none space-y-6 mt-6">
            {/* What is the difference between CMYK and RGB? */}
            <section>
              <h2 className="text-lg font-semibold mb-3">What is the difference between CMYK and RGB?</h2>
              
              <p className="text-muted-foreground mb-3">
                CMYK is the colour format that most commercial printers use to create their printed material and the format that we use to print your transfers. 
                CMYK is made up of four ink colours, these are cyan, magenta, yellow and black. These colours are added to white paper until the desired colour is created.
              </p>
              
              <p className="text-muted-foreground mb-3">
                Our printers, however, use CMYK inks (Cyan, Magenta, Yellow, and Black). Ink works differently from light and can't reproduce the same bright RGB colours. 
                So when we print your design, any colours that are too bright for CMYK will be automatically adjusted to the closest printable match. 
                This can make them look a bit duller or slightly different than what you saw on your screen.
              </p>
              
              <p className="text-muted-foreground">
                RGB (red, green, blue) is the colour format used for screens (like phones, tablets, and computers) – these are made from light, 
                which allows them to display super bright and vibrant colours, including neons and electric tones.
              </p>
            </section>

            {/* Why Your Bright Colours May Look Duller When Printed */}
            <section>
              <h3 className="text-lg font-semibold mb-3">Why Your Bright Colours May Look Duller When Printed — and How to Avoid It</h3>
              
              <p className="text-muted-foreground mb-3">
                We often get asked why artwork that looks super bright on screen can appear less vibrant when printed using our transfers. Here's a quick explanation:
              </p>
              
              <div className="bg-muted/30 rounded-lg p-4 mb-4">
                <h4 className="font-semibold mb-2">Colour Gamut</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  A gamut is the complete range or scope of something. In digital and print design, a colour gamut is the range of colours you can achieve 
                  using different colour combinations like CMYK and RGB.
                </p>
                <p className="text-sm text-muted-foreground">
                  An RGB colour gamut is much larger than a CMYK colour gamut, meaning you can achieve many more colours in RGB than you can in CMYK. 
                  This is why your design may look awesome on screen, but when printed it becomes muddied and dark. Some colours can not be reproduced 
                  using CMYK so when you convert the image from RGB to CMYK, some colours will lose their vibrance.
                </p>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <h5 className="font-semibold mb-2 text-amber-900 dark:text-amber-100">Common Colours That Don't Convert Well to Print:</h5>
                <ul className="list-disc list-inside space-y-1 text-sm text-amber-800 dark:text-amber-200">
                  <li>Neon or fluorescent pinks, greens, and oranges</li>
                  <li>Bright turquoise or electric blue</li>
                  <li>Very vivid purples</li>
                </ul>
              </div>
            </section>

            {/* Submitting RGB files */}
            <section>
              <h3 className="text-lg font-semibold mb-3">Submitting RGB files — and what happens to the colours</h3>
              
              <p className="text-muted-foreground mb-3">
                If you submit an RGB artwork file, our system will automatically convert it to CMYK and there may be a colour shift if the colours 
                within the are outside the CMYK colour gamut.
              </p>
              
              <p className="text-sm text-muted-foreground italic">
                The example below on the left was designed in RGB colour mode, the example on the right is when it was converted to CMYK.
              </p>
            </section>

            {/* How to Get the Best Results */}
            <section>
              <h2 className="text-lg font-semibold mb-3">How to Get the Best Results</h2>
              
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                <p className="text-green-900 dark:text-green-100 font-medium mb-2">
                  To avoid surprises, we strongly recommend designing in CMYK colour mode from the start if your artwork is going to be printed.
                </p>
                <p className="text-sm text-green-800 dark:text-green-200">
                  This way, you're working with the actual colours that can be reproduced in print, and what you see on screen will be much closer to the final result.
                </p>
              </div>
              
              <p className="text-muted-foreground mb-4">
                If you're using software like Adobe Illustrator, Photoshop, or similar, just choose CMYK colour mode when creating your document. 
                This gives you a more accurate idea of how your colours will look once printed.
              </p>
              
              <p className="text-muted-foreground">
                We have put together a guide for colour settings and export settings for the main graphics programs that customers are using to create their artwork.
              </p>
            </section>

            {/* Software Guides */}
            <section>
              <h3 className="text-lg font-semibold mb-4">Software-Specific Guides</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <h4 className="font-semibold mb-1">Corel Draw</h4>
                  <p className="text-sm text-muted-foreground">Professional vector graphics editor</p>
                </div>
                
                <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <h4 className="font-semibold mb-1">Adobe Illustrator</h4>
                  <p className="text-sm text-muted-foreground">Industry-standard vector design software</p>
                </div>
                
                <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <h4 className="font-semibold mb-1">Affinity Designer</h4>
                  <p className="text-sm text-muted-foreground">Modern vector graphics application</p>
                </div>
                
                <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <h4 className="font-semibold mb-1">Adobe Photoshop</h4>
                  <p className="text-sm text-muted-foreground">Raster graphics and photo editing</p>
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}