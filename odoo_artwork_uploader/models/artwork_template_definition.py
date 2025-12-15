from odoo import models, fields, api

class ArtworkTemplateDefinition(models.Model):
    _name = 'artwork.template.definition'
    _description = 'Artwork Template Definition'
    _order = 'category, sequence, name'
    
    name = fields.Char('Template Name', required=True, help='Display name for this template (e.g., "A3 Full Colour")')
    template_id = fields.Char('Template ID', required=True, 
                              help='Unique identifier used by the artwork uploader app (e.g., "template-A3")')
    category = fields.Selection([
        ('full_colour', 'Screen Printed - Full Colour'),
        ('metallic', 'Screen Printed - Metallic'),
        ('hd', 'Screen Printed - HD'),
        ('single_colour', 'Screen Printed - Single Colour'),
        ('zero', 'Screen Printed - Zero'),
        ('reflective', 'Screen Printed - Reflective'),
        ('dtf', 'Digital - DTF'),
        ('uvdtf', 'Digital - UV DTF'),
        ('sublimation', 'Digital - Sublimation'),
        ('woven', 'Digital - Woven Badges'),
        ('applique', 'Digital - Applique Badges'),
        ('other', 'Other'),
    ], string='Category', required=True, default='full_colour')
    
    width_mm = fields.Float('Width (mm)', help='Template width in millimeters')
    height_mm = fields.Float('Height (mm)', help='Template height in millimeters')
    
    active = fields.Boolean('Active', default=True)
    sequence = fields.Integer('Sequence', default=10, help='Used to order templates within a category')
    
    notes = fields.Text('Notes', help='Additional information about this template')
    
    _sql_constraints = [
        ('template_id_unique', 'unique(template_id)', 'Template ID must be unique!'),
    ]
    
    @api.model
    def _sync_to_replit_app(self):
        """Generate template data for syncing to Replit app (future feature)"""
        templates = self.search([('active', '=', True)])
        return [{
            'id': t.template_id,
            'name': t.name,
            'category': t.category,
            'width': t.width_mm,
            'height': t.height_mm,
        } for t in templates]
    
    @api.model
    def init_default_templates(self):
        """Initialize with default templates if none exist"""
        if self.search_count([]) > 0:
            return
        
        default_templates = [
            # Screen Printed Transfers - Full Colour
            {'template_id': 'template-A3', 'name': 'A3', 'category': 'full_colour', 'width_mm': 297, 'height_mm': 420, 'sequence': 1},
            {'template_id': 'template-A4', 'name': 'A4', 'category': 'full_colour', 'width_mm': 210, 'height_mm': 297, 'sequence': 2},
            {'template_id': 'template-A5', 'name': 'A5', 'category': 'full_colour', 'width_mm': 148, 'height_mm': 210, 'sequence': 3},
            {'template_id': 'template-A6', 'name': 'A6', 'category': 'full_colour', 'width_mm': 105, 'height_mm': 148, 'sequence': 4},
            {'template_id': 'template-transfer-size', 'name': '295×100mm', 'category': 'full_colour', 'width_mm': 295, 'height_mm': 100, 'sequence': 5},
            {'template_id': 'template-295x300', 'name': '295×300mm', 'category': 'full_colour', 'width_mm': 295, 'height_mm': 300, 'sequence': 6},
            {'template_id': 'template-square', 'name': '95×95mm', 'category': 'full_colour', 'width_mm': 95, 'height_mm': 95, 'sequence': 7},
            {'template_id': 'template-badge', 'name': '100×70mm', 'category': 'full_colour', 'width_mm': 100, 'height_mm': 70, 'sequence': 8},
            {'template_id': 'template-small', 'name': '60×60mm', 'category': 'full_colour', 'width_mm': 60, 'height_mm': 60, 'sequence': 9},
            
            # Screen Printed Transfers - Full Colour Metallic
            {'template_id': 'metallic-A3', 'name': 'A3 Metallic', 'category': 'metallic', 'width_mm': 297, 'height_mm': 420, 'sequence': 1},
            {'template_id': 'metallic-A4', 'name': 'A4 Metallic', 'category': 'metallic', 'width_mm': 210, 'height_mm': 297, 'sequence': 2},
            {'template_id': 'metallic-A5', 'name': 'A5 Metallic', 'category': 'metallic', 'width_mm': 148, 'height_mm': 210, 'sequence': 3},
            {'template_id': 'metallic-A6', 'name': 'A6 Metallic', 'category': 'metallic', 'width_mm': 105, 'height_mm': 148, 'sequence': 4},
            {'template_id': 'metallic-transfer-size', 'name': '295×100mm Metallic', 'category': 'metallic', 'width_mm': 295, 'height_mm': 100, 'sequence': 5},
            {'template_id': 'metallic-295x300', 'name': '295×300mm Metallic', 'category': 'metallic', 'width_mm': 295, 'height_mm': 300, 'sequence': 6},
            {'template_id': 'metallic-square', 'name': '95×95mm Metallic', 'category': 'metallic', 'width_mm': 95, 'height_mm': 95, 'sequence': 7},
            {'template_id': 'metallic-badge', 'name': '100×70mm Metallic', 'category': 'metallic', 'width_mm': 100, 'height_mm': 70, 'sequence': 8},
            {'template_id': 'metallic-small', 'name': '60×60mm Metallic', 'category': 'metallic', 'width_mm': 60, 'height_mm': 60, 'sequence': 9},
            
            # Screen Printed Transfers - Full Colour HD
            {'template_id': 'hd-A3', 'name': 'A3 HD', 'category': 'hd', 'width_mm': 297, 'height_mm': 420, 'sequence': 1},
            {'template_id': 'hd-A4', 'name': 'A4 HD', 'category': 'hd', 'width_mm': 210, 'height_mm': 297, 'sequence': 2},
            {'template_id': 'hd-295x300', 'name': '295×300mm HD', 'category': 'hd', 'width_mm': 295, 'height_mm': 300, 'sequence': 3},
            
            # Screen Printed Transfers - Single Colour
            {'template_id': 'single-A3', 'name': 'A3 Single Colour', 'category': 'single_colour', 'width_mm': 297, 'height_mm': 420, 'sequence': 1},
            {'template_id': 'single-A4', 'name': 'A4 Single Colour', 'category': 'single_colour', 'width_mm': 210, 'height_mm': 297, 'sequence': 2},
            {'template_id': 'single-A5', 'name': 'A5 Single Colour', 'category': 'single_colour', 'width_mm': 148, 'height_mm': 210, 'sequence': 3},
            {'template_id': 'single-A6', 'name': 'A6 Single Colour', 'category': 'single_colour', 'width_mm': 105, 'height_mm': 148, 'sequence': 4},
            {'template_id': 'single-transfer-size', 'name': '295×100mm Single Colour', 'category': 'single_colour', 'width_mm': 295, 'height_mm': 100, 'sequence': 5},
            {'template_id': 'single-295x300', 'name': '295×300mm Single Colour', 'category': 'single_colour', 'width_mm': 295, 'height_mm': 300, 'sequence': 6},
            {'template_id': 'single-square', 'name': '95×95mm Single Colour', 'category': 'single_colour', 'width_mm': 95, 'height_mm': 95, 'sequence': 7},
            {'template_id': 'single-badge', 'name': '100×70mm Single Colour', 'category': 'single_colour', 'width_mm': 100, 'height_mm': 70, 'sequence': 8},
            {'template_id': 'single-small', 'name': '60×60mm Single Colour', 'category': 'single_colour', 'width_mm': 60, 'height_mm': 60, 'sequence': 9},
            
            # Screen Printed Transfers - Zero
            {'template_id': 'zero-A3', 'name': 'A3 Zero', 'category': 'zero', 'width_mm': 297, 'height_mm': 420, 'sequence': 1},
            {'template_id': 'zero-A4', 'name': 'A4 Zero', 'category': 'zero', 'width_mm': 210, 'height_mm': 297, 'sequence': 2},
            {'template_id': 'zero-A5', 'name': 'A5 Zero', 'category': 'zero', 'width_mm': 148, 'height_mm': 210, 'sequence': 3},
            {'template_id': 'zero-A6', 'name': 'A6 Zero', 'category': 'zero', 'width_mm': 105, 'height_mm': 148, 'sequence': 4},
            {'template_id': 'zero-transfer-size', 'name': '295×100mm Zero', 'category': 'zero', 'width_mm': 295, 'height_mm': 100, 'sequence': 5},
            {'template_id': 'zero-295x300', 'name': '295×300mm Zero', 'category': 'zero', 'width_mm': 295, 'height_mm': 300, 'sequence': 6},
            {'template_id': 'zero-square', 'name': '95×95mm Zero', 'category': 'zero', 'width_mm': 95, 'height_mm': 95, 'sequence': 7},
            {'template_id': 'zero-badge', 'name': '100×70mm Zero', 'category': 'zero', 'width_mm': 100, 'height_mm': 70, 'sequence': 8},
            {'template_id': 'zero-small', 'name': '60×60mm Zero', 'category': 'zero', 'width_mm': 60, 'height_mm': 60, 'sequence': 9},
            
            # Screen Printed Transfers - Reflective
            {'template_id': 'reflective-A3', 'name': 'A3 Reflective', 'category': 'reflective', 'width_mm': 297, 'height_mm': 420, 'sequence': 1},
            {'template_id': 'reflective-A4', 'name': 'A4 Reflective', 'category': 'reflective', 'width_mm': 210, 'height_mm': 297, 'sequence': 2},
            {'template_id': 'reflective-A5', 'name': 'A5 Reflective', 'category': 'reflective', 'width_mm': 148, 'height_mm': 210, 'sequence': 3},
            {'template_id': 'reflective-A6', 'name': 'A6 Reflective', 'category': 'reflective', 'width_mm': 105, 'height_mm': 148, 'sequence': 4},
            {'template_id': 'reflective-transfer-size', 'name': '295×100mm Reflective', 'category': 'reflective', 'width_mm': 295, 'height_mm': 100, 'sequence': 5},
            {'template_id': 'reflective-295x300', 'name': '295×300mm Reflective', 'category': 'reflective', 'width_mm': 295, 'height_mm': 300, 'sequence': 6},
            {'template_id': 'reflective-square', 'name': '95×95mm Reflective', 'category': 'reflective', 'width_mm': 95, 'height_mm': 95, 'sequence': 7},
            {'template_id': 'reflective-badge', 'name': '100×70mm Reflective', 'category': 'reflective', 'width_mm': 100, 'height_mm': 70, 'sequence': 8},
            {'template_id': 'reflective-small', 'name': '60×60mm Reflective', 'category': 'reflective', 'width_mm': 60, 'height_mm': 60, 'sequence': 9},
            
            # Digital Transfers - DTF
            {'template_id': 'dtf-SRA3', 'name': 'SRA3 DTF', 'category': 'dtf', 'width_mm': 320, 'height_mm': 450, 'sequence': 1},
            {'template_id': 'dtf-large', 'name': '1000×550mm DTF', 'category': 'dtf', 'width_mm': 1000, 'height_mm': 550, 'sequence': 2},
            {'template_id': 'dtf-295x300', 'name': '295×300mm DTF', 'category': 'dtf', 'width_mm': 295, 'height_mm': 300, 'sequence': 3},
            
            # Digital Transfers - UV DTF
            {'template_id': 'uvdtf-A3', 'name': 'A3 UV DTF', 'category': 'uvdtf', 'width_mm': 297, 'height_mm': 420, 'sequence': 1},
            
            # Digital Transfers - Woven Badges
            {'template_id': 'woven-A6', 'name': 'A6 Woven', 'category': 'woven', 'width_mm': 105, 'height_mm': 148, 'sequence': 1},
            {'template_id': 'woven-square', 'name': '95×95mm Woven', 'category': 'woven', 'width_mm': 95, 'height_mm': 95, 'sequence': 2},
            {'template_id': 'woven-badge', 'name': '100×70mm Woven', 'category': 'woven', 'width_mm': 100, 'height_mm': 70, 'sequence': 3},
            {'template_id': 'woven-small', 'name': '60×60mm Woven', 'category': 'woven', 'width_mm': 60, 'height_mm': 60, 'sequence': 4},
            
            # Digital Transfers - Applique Badges
            {'template_id': 'applique-A6', 'name': 'A6 Applique', 'category': 'applique', 'width_mm': 105, 'height_mm': 148, 'sequence': 1},
            {'template_id': 'applique-square', 'name': '95×95mm Applique', 'category': 'applique', 'width_mm': 95, 'height_mm': 95, 'sequence': 2},
            {'template_id': 'applique-badge', 'name': '100×70mm Applique', 'category': 'applique', 'width_mm': 100, 'height_mm': 70, 'sequence': 3},
            {'template_id': 'applique-small', 'name': '60×60mm Applique', 'category': 'applique', 'width_mm': 60, 'height_mm': 60, 'sequence': 4},
            
            # Digital Transfers - Sublimation
            {'template_id': 'sublimation-A2-fabric', 'name': 'A2 Fabric', 'category': 'sublimation', 'width_mm': 420, 'height_mm': 594, 'sequence': 1},
            {'template_id': 'sublimation-A3-fabric', 'name': 'A3 Fabric', 'category': 'sublimation', 'width_mm': 297, 'height_mm': 420, 'sequence': 2},
            {'template_id': 'sublimation-A4-fabric', 'name': 'A4 Fabric', 'category': 'sublimation', 'width_mm': 210, 'height_mm': 297, 'sequence': 3},
            {'template_id': 'sublimation-A3', 'name': 'A3 Hard Surface', 'category': 'sublimation', 'width_mm': 297, 'height_mm': 420, 'sequence': 4},
            {'template_id': 'sublimation-A4', 'name': 'A4 Hard Surface', 'category': 'sublimation', 'width_mm': 210, 'height_mm': 297, 'sequence': 5},
            {'template_id': 'sublimation-mug', 'name': 'Mug Size', 'category': 'sublimation', 'width_mm': 230, 'height_mm': 95, 'sequence': 6},
            {'template_id': 'sublimation-A5', 'name': 'A5 Sublimation', 'category': 'sublimation', 'width_mm': 148, 'height_mm': 210, 'sequence': 7},
            {'template_id': 'sublimation-A6', 'name': 'A6 Sublimation', 'category': 'sublimation', 'width_mm': 105, 'height_mm': 148, 'sequence': 8},
            {'template_id': 'sublimation-transfer-size', 'name': '295×100mm Sublimation', 'category': 'sublimation', 'width_mm': 295, 'height_mm': 100, 'sequence': 9},
            {'template_id': 'sublimation-295x300', 'name': '295×300mm Sublimation', 'category': 'sublimation', 'width_mm': 295, 'height_mm': 300, 'sequence': 10},
            {'template_id': 'sublimation-square', 'name': '95×95mm Sublimation', 'category': 'sublimation', 'width_mm': 95, 'height_mm': 95, 'sequence': 11},
            {'template_id': 'sublimation-badge', 'name': '100×70mm Sublimation', 'category': 'sublimation', 'width_mm': 100, 'height_mm': 70, 'sequence': 12},
            {'template_id': 'sublimation-small', 'name': '60×60mm Sublimation', 'category': 'sublimation', 'width_mm': 60, 'height_mm': 60, 'sequence': 13},
        ]
        
        for template_data in default_templates:
            self.create(template_data)
