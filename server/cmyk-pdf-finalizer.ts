import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

export class CMYKPDFFinalizer {
  /**
   * Finalize a PDF with proper CMYK color profile embedding
   * This ensures color accuracy for professional printing
   */
  static async finalizeCMYKPDF(
    pdfBuffer: Buffer,
    options: {
      iccProfilePath?: string;
      preserveVectors?: boolean;
      enforceColorAccuracy?: boolean;
    } = {}
  ): Promise<Buffer> {
    const {
      iccProfilePath,
      preserveVectors = true,
      enforceColorAccuracy = true
    } = options;

    // Use the uploaded FOGRA51 profile or fallback
    const uploadedICCPath = path.join(process.cwd(), 'attached_assets', 'PSO Coated FOGRA51 (EFI)_1753573621935.icc');
    const fallbackICCPath = path.join(process.cwd(), 'server', 'fogra51.icc');
    
    const finalICCPath = iccProfilePath || (fs.existsSync(uploadedICCPath) ? uploadedICCPath : fallbackICCPath);
    const hasICC = fs.existsSync(finalICCPath);

    if (!hasICC) {
      console.log('CMYK Finalizer: No ICC profile available, returning original PDF');
      return pdfBuffer;
    }

    const tempDir = path.join(process.cwd(), 'uploads', 'temp_cmyk_finalize');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const inputPath = path.join(tempDir, `input_${timestamp}.pdf`);
    const outputPath = path.join(tempDir, `output_${timestamp}.pdf`);

    try {
      // Write input PDF
      fs.writeFileSync(inputPath, pdfBuffer);
      console.log(`CMYK Finalizer: Processing PDF with ICC profile: ${path.basename(finalICCPath)}`);

      // Build Ghostscript command for proper CMYK finalization
      const gsArgs = [
        'gs',
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        '-dPDFSETTINGS=/prepress', // High quality for print
        '-dEmbedAllFonts=true',
        '-dSubsetFonts=true',
        '-dCompressFonts=true',
        '-dAutoRotatePages=/None',
        '-dDownsampleColorImages=false', // Don't downsample
        '-dDownsampleGrayImages=false',
        '-dDownsampleMonoImages=false',
        '-dColorImageFilter=/FlateEncode', // Lossless compression
        '-dGrayImageFilter=/FlateEncode',
        '-dMonoImageFilter=/CCITTFaxEncode',
      ];

      if (enforceColorAccuracy) {
        // For already CMYK PDFs, preserve colors exactly
        gsArgs.push(
          '-dColorConversionStrategy=/LeaveColorUnchanged',
          '-dProcessColorModel=/DeviceCMYK',
          '-dOverrideICC=true',
          `-sOutputICCProfile="${finalICCPath}"`,
          '-dRenderIntent=0' // Perceptual rendering intent
        );
      } else {
        // Convert to CMYK if needed
        gsArgs.push(
          '-dColorConversionStrategy=/CMYK',
          '-dProcessColorModel=/DeviceCMYK',
          `-sDefaultCMYKProfile="${finalICCPath}"`,
          `-sOutputICCProfile="${finalICCPath}"`,
          '-dOverrideICC=true'
        );
      }

      gsArgs.push(
        `-sOutputFile="${outputPath}"`,
        `"${inputPath}"`
      );

      const gsCommand = gsArgs.join(' ');
      console.log('CMYK Finalizer: Executing Ghostscript command...');
      
      const { stdout, stderr } = await execAsync(gsCommand);
      
      if (stderr && !stderr.includes('warning')) {
        console.error('CMYK Finalizer: Ghostscript stderr:', stderr);
      }

      if (!fs.existsSync(outputPath)) {
        throw new Error('Ghostscript did not produce output file');
      }

      const outputStats = fs.statSync(outputPath);
      console.log(`CMYK Finalizer: Successfully created finalized PDF (${outputStats.size} bytes)`);

      // Verify ICC profile was embedded
      try {
        const verifyCommand = `gs -dNOPAUSE -dBATCH -dNODISPLAY -q -c "(${outputPath}) (r) file runpdfbegin /OutputIntents pdfgetobject {(ICC Profile embedded) print} {(No ICC profile found) print} ifelse" 2>&1`;
        const { stdout: verifyOutput } = await execAsync(verifyCommand);
        console.log('CMYK Finalizer: ICC verification:', verifyOutput.trim());
      } catch (verifyError) {
        console.log('CMYK Finalizer: Could not verify ICC profile');
      }

      const finalizedPDF = fs.readFileSync(outputPath);

      // Clean up temp files
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);

      return finalizedPDF;

    } catch (error) {
      console.error('CMYK Finalizer: Error during PDF finalization:', error);
      
      // Clean up on error
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      
      // Try basic ICC embedding as fallback
      try {
        console.log('CMYK Finalizer: Attempting basic ICC embedding...');
        return await this.basicICCEmbed(pdfBuffer, finalICCPath);
      } catch (fallbackError) {
        console.error('CMYK Finalizer: Basic ICC embedding also failed:', fallbackError);
        return pdfBuffer; // Return original if all fails
      }
    }
  }

  /**
   * Basic ICC profile embedding using minimal Ghostscript options
   */
  private static async basicICCEmbed(pdfBuffer: Buffer, iccPath: string): Promise<Buffer> {
    const tempDir = path.join(process.cwd(), 'uploads', 'temp_basic_icc');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const inputPath = path.join(tempDir, `basic_input_${timestamp}.pdf`);
    const outputPath = path.join(tempDir, `basic_output_${timestamp}.pdf`);

    try {
      fs.writeFileSync(inputPath, pdfBuffer);

      // Minimal command just to embed ICC
      const gsCommand = [
        'gs',
        '-dNOPAUSE',
        '-dBATCH',
        '-sDEVICE=pdfwrite',
        '-dColorConversionStrategy=/LeaveColorUnchanged',
        `-sOutputICCProfile="${iccPath}"`,
        `-sOutputFile="${outputPath}"`,
        `"${inputPath}"`
      ].join(' ');

      await execAsync(gsCommand);

      if (fs.existsSync(outputPath)) {
        const result = fs.readFileSync(outputPath);
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
        return result;
      }
    } catch (error) {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }

    return pdfBuffer;
  }
}