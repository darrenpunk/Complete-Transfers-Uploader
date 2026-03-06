const fs = require('fs');
const path = 'server/robust-pdf-generator.ts';
let content = fs.readFileSync(path, 'utf8');

const oldBlock = /if \(data\.garmentColors && Array\.isArray\(data\.garmentColors\) && data\.garmentColors\.length > 0\) \{[\s\S]*?\} else if \(hasElementLevelColors\) \{/;

const newBlock = `if (data.garmentColors && Array.isArray(data.garmentColors) && data.garmentColors.length > 0) {
          console.log(\`🎨 Multi-Color Order: Creating \${data.garmentColors.length} pages for different garment colors\`);
          
          for (const garmentColorItem of data.garmentColors) {
            const colorPage = pdfDoc.addPage([pageWidth, pageHeight]);
            const colorHex = garmentColorItem.color || '#FFFFFF';
            const colorName = garmentColorItem.colorName || getGarmentColorName(colorHex);
            const qty = garmentColorItem.quantity || 0;
            
            // Fill page with garment color background
            const parsedColor = await this.parseGarmentColor(colorHex);
            colorPage.drawRectangle({
              x: 0,
              y: 0,
              width: pageWidth,
              height: pageHeight,
              color: parsedColor,
            });
            
            garmentColorPages.push({
              page: colorPage,
              color: colorHex,
              colorName,
              quantity: qty
            });
            
            console.log(\`✅ Created page for \${colorName} (Qty: \${qty})\`);
          }
          
          // Use first garment color page as page2 for logo embedding
          page2 = garmentColorPages.length > 0 ? garmentColorPages[0].page : null;
        } else if (hasElementLevelColors) {`;

if (content.match(oldBlock)) {
  content = content.replace(oldBlock, newBlock);
  fs.writeFileSync(path, content);
  console.log('Successfully fixed PDF generator');
} else {
  console.error('Could not find the target block in server/robust-pdf-generator.ts');
  // Fallback to a simpler regex if the first one fails
  const fallbackRegex = /for \(const garmentColorItem of data\.garmentColors\) \{[\s\S]*?page2 = garmentColorPages\[0\]\?\.page \|\| null;\s+\} else if \(hasElementLevelColors\) \{/;
  if (content.match(fallbackRegex)) {
    content = content.replace(fallbackRegex, newBlock);
    fs.writeFileSync(path, content);
    console.log('Successfully fixed PDF generator using fallback');
  } else {
    process.exit(1);
  }
}
