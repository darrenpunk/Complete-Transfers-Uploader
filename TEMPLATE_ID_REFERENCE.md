# Template ID Reference for Odoo Mappings

## Full Colour Transfers (Screen Printed)
- `template-A3` → A3 (297×420mm)
- `template-A4` → A4 (210×297mm)
- `template-A5` → A5 (148×210mm)
- `template-A6` → A6 (148×105mm)
- `template-transfer-size` → 295×100mm
- `template-square` → 95×95mm
- `template-badge` → 100×70mm
- `template-small` → 60×60mm

## Full Colour Metallic (Screen Printed)
- `metallic-A3` → A3 Metallic
- `metallic-A4` → A4 Metallic
- `metallic-A5` → A5 Metallic
- `metallic-A6` → A6 Metallic
- `metallic-transfer-size` → 295×100mm Metallic
- `metallic-square` → 95×95mm Metallic
- `metallic-badge` → 100×70mm Metallic
- `metallic-small` → 60×60mm Metallic

## Full Colour HD (Screen Printed)
- `hd-A3` → A3 HD
- `hd-A4` → A4 HD

## Single Colour (Screen Printed)
- `single-A3` → A3 Single Colour
- `single-A4` → A4 Single Colour
- `single-A5` → A5 Single Colour
- `single-A6` → A6 Single Colour
- `single-transfer-size` → 295×100mm Single Colour
- `single-square` → 95×95mm Single Colour
- `single-badge` → 100×70mm Single Colour
- `single-small` → 60×60mm Single Colour

## Zero (Screen Printed)
- `zero-A3` → A3 Zero
- `zero-A4` → A4 Zero
- `zero-A5` → A5 Zero
- `zero-A6` → A6 Zero
- `zero-transfer-size` → 295×100mm Zero
- `zero-square` → 95×95mm Zero
- `zero-badge` → 100×70mm Zero
- `zero-small` → 60×60mm Zero

## DTF (Digital Transfers)
- `dtf-SRA3` → SRA3
- `dtf-large` → 1000×550mm DTF

## UV DTF (Digital Transfers)
- `uvdtf-A3` → A3 UV DTF

## Woven Badges (Digital Transfers)
- `woven-A6` → A6 Woven
- `woven-square` → 95×95mm Woven
- `woven-badge` → 100×70mm Woven
- `woven-small` → 60×60mm Woven

## Applique Badges (Digital Transfers)
- `applique-A6` → A6 Applique
- `applique-square` → 95×95mm Applique
- `applique-badge` → 100×70mm Applique
- `applique-small` → 60×60mm Applique

## Reflective (Screen Printed)
- `reflective-A3` → A3 Reflective
- `reflective-A4` → A4 Reflective
- `reflective-A5` → A5 Reflective
- `reflective-A6` → A6 Reflective
- `reflective-transfer-size` → 295×100mm Reflective
- `reflective-square` → 95×95mm Reflective
- `reflective-badge` → 100×70mm Reflective
- `reflective-small` → 60×60mm Reflective

## Sublimation (Screen Printed)
- `sublimation-A3` → A3 Sublimation
- `sublimation-A4` → A4 Sublimation
- `sublimation-A5` → A5 Sublimation
- `sublimation-A6` → A6 Sublimation
- `sublimation-transfer-size` → 295×100mm Sublimation
- `sublimation-square` → 95×95mm Sublimation
- `sublimation-badge` → 100×70mm Sublimation
- `sublimation-small` → 60×60mm Sublimation

---

## Usage in Odoo

When creating Template Mappings in Odoo:
1. Go to **Artwork → Configuration → Template Mappings**
2. Click **New**
3. **Template ID**: Select the exact ID from the list above (e.g., `template-A3`)
4. **Product**: Link to your Odoo product
5. **Save**

The pricing system will use these mappings to fetch real product prices.
