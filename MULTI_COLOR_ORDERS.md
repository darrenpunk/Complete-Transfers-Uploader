# Multi-Color Garment Orders

## Overview
The multi-color garment order feature allows customers to order the same artwork on different garment colors with specific quantities for each color. This is a common requirement in the custom apparel industry where bulk orders often need the same design on multiple shirt colors.

## Template Compatibility
Multi-color garment orders are **only available for full-colour printing templates**:
- ✅ **Full-Colour** - Standard screen printed heat applied transfers
- ✅ **HD** - High-definition full-colour screen printed transfers
- ✅ **Metallic** - Full-colour screen printed with metallic finish

**Not available for:**
- ❌ Single Colour templates
- ❌ Zero templates
- ❌ DTF (Direct to Film) templates
- ❌ Other specialized template types

## Use Case Example
**Customer Request:**
"I need the same logo on different colored shirts:
- 10 Black
- 4 Gold  
- 4 Charcoal
- 5 Heather Grey"

## How It Works

### User Workflow:

#### 1. Design Phase
- User uploads logos and positions artwork on template
- Selects default garment color (or leaves as default)

#### 2. PDF Preview
- Click "Continue" → PDF Preview Modal appears
- Review artwork and click "Approve"

#### 3. Project Naming Modal
**This is where multi-color orders are configured:**

- **Toggle "Multiple Garment Colors"** - Enable this switch to use multi-color mode
- **Add Colors** - Click "Add Color" to select garment colors from palette
- **Set Quantities** - Specify quantity for each color
- **Review Total** - Total quantity is calculated automatically
- **Add Comments** - Additional instructions (optional)

#### 4. Automatic Comment Generation
When multi-color mode is enabled, the system automatically generates properly formatted comments:

```
10 Black
4 Gold
4 Charcoal
5 Heather Grey

[Any additional comments entered by user]
```

#### 5. Add to Cart
- Comments with color breakdown are sent to Odoo
- Production team sees exact quantities per color
- No manual comment formatting needed

## Technical Implementation

### Database Schema
```typescript
// projects table
{
  garmentColor: text("garment_color").notNull(),    // Default/primary color
  garmentColors: jsonb("garment_colors"),           // Multi-color array
  quantity: integer("quantity").notNull().default(1) // Total quantity
}
```

### Garment Color Data Structure
```typescript
type GarmentColorItem = {
  color: string;      // Hex color code (e.g., "#000000")
  colorName: string;  // Human-readable name (e.g., "Black")
  quantity: number;   // Quantity for this specific color
}
```

### Component Architecture

**MultiColorSelector Component:**
- Grid-based color picker with 20 professional garment colors
- Add/remove colors dynamically
- Individual quantity inputs per color
- Real-time total calculation
- Duplicate color prevention
- Visual color swatches

**ProjectNameModal Enhancement:**
- Toggle switch for multi-color mode
- Integrated MultiColorSelector component
- Automatic comment generation from color selections
- Preserves user's additional comments

## Available Garment Colors

The color picker includes 20 standard garment colors:
- White, Black, Navy, Royal Blue, Red
- Gold, Charcoal, Heather Grey
- Kelly Green, Bottle Green, Maroon, Purple
- Orange, Yellow, Pink, Light Blue
- Ash Grey, Brown, Forest Green, Burgundy

Each color includes:
- Color swatch preview
- Human-readable name
- Hex color code

## Odoo Integration

### Database Persistence
Multi-color data is stored in the Replit database:
```typescript
// projects table
{
  garmentColors: jsonb("garment_colors"),  // Array of {color, colorName, quantity}
  quantity: integer("quantity"),            // Total quantity from all colors
}
```

### Comments Field
Multi-color information is automatically sent to Odoo via comments:
```json
{
  "name": "Welcome Inn Logo",
  "comments": "10 Black\n4 Gold\n4 Charcoal\n5 Heather Grey\n\nRush order - needed by Friday",
  "quantity": 23
}
```

### Data Flow
1. **User selects colors** → MultiColorSelector component captures data
2. **Project naming** → garmentColors array and totalQuantity returned from modal
3. **Frontend sends** → PATCH /api/projects/:id with garmentColors and quantity
4. **Backend stores** → Saved to PostgreSQL via Drizzle ORM
5. **PDF Generation** → Creates one page per garment color
6. **Add to cart** → garmentColors available for Odoo integration

### Future Enhancement: Direct JSON Payload
The Odoo model already supports structured color data:
```python
# odoo_artwork_uploader/models/artwork_project.py
garment_colors_json = fields.Text('Garment Colors JSON')
```

In the future, the add-to-cart endpoint can send garmentColors directly:
```json
{
  "garment_colors": [
    {"color": "#000000", "colorName": "Black", "quantity": 10},
    {"color": "#FFD700", "colorName": "Gold", "quantity": 4},
    {"color": "#36454F", "colorName": "Charcoal", "quantity": 4},
    {"color": "#959595", "colorName": "Heather Grey", "quantity": 5}
  ]
}
```

## PDF Generation

### Multi-Page Output
When a project has multi-color garment orders, the generated PDF includes:

**Page 1**: Transparent background (for production use)
- Clean artwork without any background
- Used for direct transfer production

**Pages 2+**: One page per garment color
- Each page shows the artwork on that specific garment color background
- Footer displays:
  - `Project: [Project Name]`
  - `Garment Color: [Color Name]`
  - `Quantity: [Quantity for this color]`

### Example PDF Structure
For an order: "10 Black, 4 Gold, 6 Charcoal"

- **Page 1**: Transparent background (artwork only)
- **Page 2**: Black background, footer "Garment Color: Black, Quantity: 10"
- **Page 3**: Gold background, footer "Garment Color: Gold, Quantity: 4"
- **Page 4**: Charcoal background, footer "Garment Color: Charcoal, Quantity: 6"

This allows production teams to visually see how the artwork looks on each garment color and verify quantities directly from the PDF.

### Backward Compatibility
For single-color orders (or templates that don't support multi-color):
- **Page 1**: Transparent background
- **Page 2**: Default garment color background with total quantity

The PDF generation automatically detects whether the project has multi-color data and generates the appropriate pages.

## Benefits

### For Customers:
✅ **No manual comment formatting** - System generates proper format automatically  
✅ **Visual color selection** - See actual garment colors, not just names  
✅ **Quantity validation** - Minimum 1 per color, real-time totals  
✅ **Error prevention** - Can't add duplicate colors  
✅ **Clear overview** - See all colors and quantities at a glance

### For Production Team:
✅ **Structured data** - Consistent comment format every time  
✅ **Clear breakdown** - Exact quantities per color clearly listed  
✅ **No ambiguity** - Proper color names with quantities  
✅ **Easy to parse** - Standard format for all multi-color orders

## Testing Checklist

- [ ] Toggle multi-color mode on/off
- [ ] Add multiple garment colors
- [ ] Set different quantities per color
- [ ] Verify total quantity calculation
- [ ] Remove colors from selection
- [ ] Prevent duplicate color addition
- [ ] Generate comments automatically
- [ ] Submit order with multi-color comments
- [ ] Verify comments appear in Odoo order

## Files Modified/Created

### New Files:
1. **client/src/components/multi-color-selector.tsx**
   - Standalone color selector component
   - Grid-based color picker with 20 colors
   - Quantity management per color
   - Total calculation

2. **MULTI_COLOR_ORDERS.md** (this file)
   - Complete feature documentation

### Modified Files:
1. **shared/schema.ts**
   - Added `garmentColors` JSONB field to projects table
   - Added `GarmentColorItem` TypeScript type
   - Database schema migration completed

2. **client/src/components/project-name-modal.tsx**
   - Added multi-color toggle switch
   - Integrated MultiColorSelector component
   - Automatic comment generation from color selections
   - Conditional UI based on multi-color mode

3. **replit.md**
   - Updated with multi-color feature documentation

## Migration Notes

### Database Migration
The `garmentColors` field was added to the projects table:
```bash
npm run db:push
```

### Backward Compatibility
- Single-color orders still work normally
- Existing projects unaffected
- Multi-color is opt-in via toggle
- Falls back to manual comments if toggle is off

## Future Enhancements

### Phase 2 (Future):
1. **Multi-Page PDF Generation**
   - Generate separate PDF pages for each garment color
   - Show artwork on colored background per page
   - Automatic page labeling with color names

2. **Structured API Integration**
   - Send `garmentColors` array to Odoo API
   - Create separate order lines per color
   - Automatic pricing per color/quantity

3. **PDF Background Variations**
   - Visual preview of artwork on each garment color
   - Print-ready mockups for each color variant

4. **Quantity Discounts**
   - Apply Odoo pricelist discounts per color
   - Show pricing breakdown in cart

## Support

For questions or issues:
- Contact: transferhelp@serigraf.com
- Support ticket system: Available in Help modal
