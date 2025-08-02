import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Check, AlertCircle, Download } from "lucide-react";
import { CompleteTransferLogo } from "./complete-transfer-logo";
import { Button } from "@/components/ui/button";

interface ArtworkRequirementsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ArtworkRequirementsModal({ open, onOpenChange }: ArtworkRequirementsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <CompleteTransferLogo size="md" className="mb-4" />
          <DialogTitle className="flex items-center gap-2 text-xl text-[#961E75]">
            <FileText className="w-5 h-5" />
            Artwork Requirements
          </DialogTitle>
          <DialogDescription>
            Please follow our artwork requirements to avoid delays and ensure the best quality transfers
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[calc(90vh-120px)] px-6 pb-6">
          <div className="prose prose-sm max-w-none space-y-6 mt-6">
            {/* Introduction */}
            <section>
              <p className="text-muted-foreground">
                Please take some time to read and follow our artwork requirements. This will help avoid any delays in processing your orders 
                and avoid any extra processing costs, due to missing fonts or low-resolution images.
              </p>
            </section>

            {/* Vector Artwork */}
            <section>
              <h2 className="text-lg font-semibold mb-3 text-[#961E75]">Vector artwork</h2>
              
              <p className="text-muted-foreground mb-3">
                Our transfers look their very best when the artwork is a vector. They will look sharp and have clean lines.
              </p>
              
              <p className="text-muted-foreground mb-3">
                We want our customers to receive the best quality transfers possible.....and your customer we are sure will also want 
                the best quality image on their garments!
              </p>
              
              <p className="text-muted-foreground mb-3">
                To ensure fine details and your image prints sharply and at the highest quality, make sure that your graphics are 
                vectors where possible. Artwork containing small or fine elements will <strong>ONLY</strong> be accepted as vectors.
              </p>

              <div className="bg-muted/30 rounded-lg p-4 mb-4">
                <h4 className="font-semibold mb-2 text-[#961E75]">What is a Vector?</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Vector artwork is a term that describes any art made with vector illustration software like Adobe Illustrator. 
                  Vector artwork is built from vector graphics, which are images created with mathematical formulas. In comparison, 
                  raster art (also referred to as bitmaps or raster images) is created with colorised pixels. Enlarge pixel-based 
                  art in a raster file too much and it looks jaggy, whereas you can enlarge vector art to any size without 
                  negatively affecting its appearance.
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                <h4 className="font-semibold mb-2 text-[#961E75]">Do all images need to be vectors?</h4>
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  Not all images need to be vectored.....Photographs do not require to be vectored. They do require to be 300dpi 
                  at print size and if the background is removed, it must be done correctly with no loose or semi-transparent pixels.
                </p>
              </div>

              {/* Vector vs Raster Comparison Image */}
              <div className="flex justify-center my-6">
                <img 
                  src="https://www.completetransfers.com/web/image/503384/Vector_bitmap.jpg"
                  alt="Vectorised vs Bitmap/Raster Comparison"
                  className="max-w-full h-auto rounded-lg shadow-sm"
                />
              </div>
            </section>

            {/* Vectorising Service */}
            <section className="bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-950/30 dark:to-purple-950/30 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold mb-3 text-[#961E75]">Our Vectorising & Background Removal Service</h3>
              <p className="text-muted-foreground mb-4">
                We can vector your artwork from any file format, giving you a high-quality vector that you can save on file 
                and use again in the future. We can also remove backgrounds in Photographs for you cleanly and precisely.
              </p>
              <Button className="bg-[#961E75] hover:bg-[#7a1860]">
                <Download className="w-4 h-4 mr-2" />
                GET A VECTORISING QUOTE
              </Button>
            </section>

            {/* Main Requirements Grid */}
            <section>
              <h2 className="text-lg font-semibold mb-4 text-[#961E75]">Artwork Requirements</h2>
              <p className="text-muted-foreground mb-6">
                Our pricing and our estimated despatch dates for all our transfers are based on receiving correctly sized 
                print-ready PDFs. We do not edit your files once submitted to the order.
              </p>

              <div className="grid gap-6">
                {/* Fonts */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <img 
                      src="https://www.completetransfers.com/web/image/255309/Convert-to-curves.gif"
                      alt="Convert fonts to curves"
                      className="w-24 h-24 object-contain rounded"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold mb-2 text-[#961E75] flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Fonts
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Fonts can cause problems if you've used a font or typeface that we don't have, the document will 
                        print incorrectly. All fonts within your artwork need to be converted to outlines, or paths. 
                        This effectively means that the text is no longer text - it has become a graphic, and the text 
                        cannot be altered.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Fine Details */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <img 
                      src="https://www.completetransfers.com/web/image/255316/check2.gif"
                      alt="Check fine details"
                      className="w-24 h-24 object-contain rounded"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold mb-2 text-[#961E75] flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Fine Details
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        To ensure fine details & small text in your image print clearly make sure that the smallest 
                        areas are at least as thick as our minimum print tolerance of 0.35mm / 1pt
                      </p>
                      <img 
                        src="https://www.completetransfers.com/web/image/255589/35mm.png"
                        alt="0.35mm minimum thickness"
                        className="h-8 w-auto"
                      />
                    </div>
                  </div>
                </div>

                {/* Mirrored Artwork */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <img 
                      src="https://www.completetransfers.com/web/image/503433/mirror.gif"
                      alt="Do not mirror artwork"
                      className="w-24 h-24 object-contain rounded"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold mb-2 text-[#961E75]">Mirrored Artwork</h3>
                      <p className="text-sm text-muted-foreground">
                        All artworks submitted should not be mirrored, they will be automatically mirrored for the 
                        transfer process by our system. Submitting mirrored artwork may lead to your transfer being 
                        printed backwards.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Colours */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <img 
                      src="https://www.completetransfers.com/web/image/254409/CB.png"
                      alt="CMYK colours"
                      className="w-24 h-24 object-contain rounded"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold mb-2 text-[#961E75]">Colours</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        All files should be <strong>CMYK</strong> colour mode. RGB colours or RGB files will be 
                        automatically converted to CMYK which may lead to a colour shift in your artwork.
                      </p>
                      <p className="text-sm text-muted-foreground mb-2">
                        We use FOGRA 39 colour profile. We recommend you assign this colour profile to your file - 
                        this can be set using European Prepress colour settings in your graphics package.
                      </p>
                      <p className="text-sm text-muted-foreground italic">
                        <strong>Pantone Shades:</strong> Please assign any Pantone shades you require to your artwork. 
                        Not all Pantone shades can be reproduced exactly by the CMYK process, we cannot guarantee exact matching.
                      </p>
                    </div>
                  </div>
                </div>

                {/* File Type */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <img 
                      src="https://www.completetransfers.com/web/image/255437/export-pdf.png"
                      alt="Export as PDF"
                      className="w-24 h-24 object-contain rounded"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold mb-2 text-[#961E75]">File Type</h3>
                      <p className="text-sm text-muted-foreground">
                        Our artwork system for our transfers is a semi-automated system and requires all files to be PDF. 
                        Please submit all artwork as High Quality PDF in CMYK colour mode.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Backgrounds */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <img 
                      src="https://www.completetransfers.com/web/image/255439/background.gif"
                      alt="No backgrounds"
                      className="w-24 h-24 object-contain rounded"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold mb-2 text-[#961E75]">Backgrounds and White Elements</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        Any white elements that are to be printed should be left as white in your file.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Please don't put a coloured background in your file, our system detects any white elements 
                        in the file automatically. You can add a separate visual of the artwork on the coloured 
                        garment for reference on a second page of the PDF that you upload.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* File Prep Steps */}
            <section>
              <h2 className="text-lg font-semibold mb-4 text-[#961E75]">File Prep for Custom Cut Transfers</h2>
              
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                <ol className="space-y-3">
                  <li className="flex gap-2">
                    <span className="font-semibold text-green-700 dark:text-green-300">1.</span>
                    <span className="text-sm">Create a new CMYK document or art-board in your graphic design program. Make the size of the document the size of the transfer you need to order.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-green-700 dark:text-green-300">2.</span>
                    <div className="text-sm">
                      <p>Import your vector graphic.</p>
                      <ul className="list-disc list-inside mt-1 space-y-1 text-muted-foreground">
                        <li>Convert all fonts to outlines / curves</li>
                        <li>Check fine detail is not smaller than our minimum line thickness</li>
                        <li>Remove any backgrounds or white elements that are not needed</li>
                        <li>Do not mirror your artwork</li>
                      </ul>
                    </div>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-green-700 dark:text-green-300">3.</span>
                    <span className="text-sm">Size the graphic to the exact size you need it to print</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-green-700 dark:text-green-300">4.</span>
                    <span className="text-sm">Export as a High Quality PDF.</span>
                  </li>
                </ol>
              </div>

              {/* Custom Cut Process Image */}
              <div className="flex justify-center mt-4">
                <img 
                  src="https://www.completetransfers.com/web/image/255303/CustomCut.gif"
                  alt="Custom Cut Transfer Process"
                  className="max-w-full h-auto rounded-lg shadow-sm"
                />
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}