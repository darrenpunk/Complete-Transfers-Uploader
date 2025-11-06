# Multi-Color Garment Orders

## Overview
The multi-color garment order feature allows customers to order the same artwork on different garment colors with specific quantities for each color. This is a common requirement in the custom apparel industry where bulk orders often need the same design on multiple shirt colors.

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

### Comments Field
Multi-color information is sent to Odoo via the comments field:
```json
{
  "name": "Welcome Inn Logo",
  "comments": "10 Black\n4 Gold\n4 Charcoal\n5 Heather Grey\n\nRush order - needed by Friday"
}
```

### Future Enhancement: garment_colors_json
The Odoo model already supports structured color data:
```python
# odoo_artwork_uploader/models/artwork_project.py
garment_colors_json = fields.Text('Garment Colors JSON')
```

In the future, this can be enhanced to send:
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
