# Template to Product Mapping Guide

## Overview
This guide explains how to map artwork templates to your existing Odoo products. The mapping system allows you to connect each template size/type to specific products in your catalog.

## Why Template Mapping?
Instead of creating new products, the module uses your existing product catalog. This allows you to:
- Maintain your existing product structure
- Use your configured prices and pricelists
- Leverage existing inventory management
- Keep your current product categories and attributes

## Setting Up Template Mappings

### Method 1: Using the Setup Wizard (Recommended)

1. **Navigate to the Wizard**
   - Go to `Artwork > Configuration > Setup Template Mappings`
   - The wizard will show all unmapped templates

2. **Review Suggested Mappings**
   - The system suggests products based on matching names
   - For example: "template-dtf-a3" might suggest "DTF Transfer A3"

3. **Select Products**
   - Click on the product field for each template
   - Search and select the appropriate product from your catalog
   - Set minimum quantities (DTF usually has min 1, others min 10)

4. **Create Mappings**
   - Click "Create Mappings" to save all configurations
   - The system will notify you of successful creation

### Method 2: Manual Configuration

1. **Navigate to Template Mappings**
   - Go to `Artwork > Configuration > Template Mappings`
   - Click "Create" to add a new mapping

2. **Configure Each Mapping**
   - Template ID: Select the template (e.g., "A3", "DTF A4")
   - Product: Select your existing product
   - Min Quantity: Set minimum order quantity
   - Max Quantity: Optional maximum limit
   - Active: Keep checked for active mappings

## Template ID Reference

### Available Templates in Current System (42 Total)

**Screen Printed Transfers - Standard:**
- `template-A3` → A3 size (297×420mm) 
- `template-A4` → A4 size (210×297mm)
- `template-A5` → A5 size (148×210mm)
- `template-A6` → A6 size (105×148mm)
- `template-transfer-size` → 295×100mm
- `template-square` → 95×95mm
- `template-badge` → 100×70mm 
- `template-small` → 60×60mm

**Screen Printed Transfers - Metallic:**
- `metallic-A3` → A3 Metallic
- `metallic-A4` → A4 Metallic
- `metallic-A5` → A5 Metallic
- `metallic-A6` → A6 Metallic
- `metallic-transfer-size` → 295×100mm Metallic
- `metallic-square` → 95×95mm Metallic
- `metallic-badge` → 100×70mm Metallic
- `metallic-small` → 60×60mm Metallic

**Screen Printed Transfers - HD:**
- `hd-A3` → A3 HD
- `hd-A4` → A4 HD

**Screen Printed Transfers - Single Colour:**
- `single-A3` → A3 Single Colour
- `single-A4` → A4 Single Colour
- `single-A5` → A5 Single Colour
- `single-A6` → A6 Single Colour
- `single-transfer-size` → 295×100mm Single Colour
- `single-square` → 95×95mm Single Colour
- `single-badge` → 100×70mm Single Colour
- `single-small` → 60×60mm Single Colour

**Screen Printed Transfers - Zero:**
- `zero-A3` → A3 Zero
- `zero-A4` → A4 Zero
- `zero-transfer-size` → 295×100mm Zero
- `zero-square` → 95×95mm Zero
- `zero-badge` → 100×70mm Zero
- `zero-small` → 60×60mm Zero

**Screen Printed Transfers - Reflective:**
- `reflective-A3` → A3 Reflective

**Digital Transfers - DTF:**
- `dtf-A3` → DTF A3
- `dtf-A4` → DTF A4
- `dtf-transfer-size` → DTF 295×100mm
- `dtf-square` → DTF 95×95mm
- `dtf-badge` → DTF 100×70mm
- `dtf-small` → DTF 60×60mm

**Digital Transfers - UV DTF:**
- `uv-dtf-square` → UV DTF 95×95mm

**Digital Transfers - Woven Badges:**
- `woven-square` → Woven Badge 95×95mm

**Digital Transfers - Applique:**
- `applique-A3` → A3 Applique
- `applique-A4` → A4 Applique
- `applique-A5` → A5 Applique
- `applique-A6` → A6 Applique
- `applique-square` → 95×95mm Applique
- `applique-badge` → 100×70mm Applique
- `applique-small` → 60×60mm Applique

**Digital Transfers - Sublimation:**
- `sublimation-A3` → A3 Sublimation
- `sublimation-A4` → A4 Sublimation
- `sublimation-mug` → Mug Sized (240×100mm) Sublimation

*Note: All 42 templates are available for mapping to your products. Templates are organized by printing method and size.*

## Product Requirements

Your existing products should have:
- `sale_ok = True` (Can be sold)
- Proper pricing configured
- Correct tax settings
- Appropriate product category

## Example Mapping Scenarios

### Scenario 1: Simple Product Structure
If you have products like:
- "Heat Transfer A3"
- "Heat Transfer A4" 
- "DTF Transfer A3"
- "295×100mm Transfer"
- "Metallic Transfer A3"

Map them as:
- `template-A3` → "Heat Transfer A3"
- `template-A4` → "Heat Transfer A4"
- `dtf-A3` → "DTF Transfer A3"
- `template-transfer-size` → "295×100mm Transfer"
- `metallic-A3` → "Metallic Transfer A3"

### Scenario 2: Product Variants
If using product variants:
- Product: "Heat Transfers"
  - Variant: Size A3
  - Variant: Size A4

Map the specific variants:
- `template-A3` → "Heat Transfers (A3)"
- `template-A4` → "Heat Transfers (A4)"

### Scenario 3: Category-Based Products
If products are organized by type:
- "Full Color Transfers - A3"
- "Single Color Transfers - A3"
- "Special Effects - Glitter A3"

Map appropriately based on template type.

## Troubleshooting

### "No product mapped for this template"
1. Check if template mapping exists
2. Verify mapping is active
3. Ensure product still exists and is saleable

### Wrong Product Selected
1. Go to Template Mappings
2. Find the incorrect mapping
3. Edit and select correct product
4. Save changes

### Missing Templates
If new templates are added:
1. Run the Setup Wizard again
2. It will show only unmapped templates
3. Configure the new mappings

## Best Practices

1. **Consistent Naming**
   - Use clear product names that match template types
   - Include size in product name (A3, A4, etc.)

2. **Minimum Quantities**
   - DTF/UV DTF: Usually min 1
   - Screen printing: Usually min 10
   - Special effects: Varies by type

3. **Regular Reviews**
   - Periodically check mappings
   - Update when adding new products
   - Deactivate unused mappings

4. **Testing**
   - Test each template type
   - Verify correct product appears in cart
   - Check pricing calculations

## Integration with Pricing

The mapped products will use:
- Your existing pricelists
- Quantity-based discounts
- Customer-specific pricing
- Tax configurations
- Currency settings

## Reporting

You can analyze orders by:
- Product sales reports (grouped by mapped products)
- Template usage (via artwork projects)
- Customer preferences
- Popular template sizes

This mapping system ensures seamless integration between the creative design process and your existing e-commerce infrastructure.