from odoo import models, fields, api

class ArtworkTemplateMapping(models.Model):
    _name = 'artwork.template.mapping'
    _description = 'Artwork Template to Product Mapping'
    _rec_name = 'template_id'
    
    template_id = fields.Selection([
        # Screen Printed Transfers - Full Colour (10 templates)
        ('template-A3', 'A3'),
        ('template-A4', 'A4'),
        ('template-A5', 'A5'),
        ('template-A6', 'A6'),
        ('template-transfer-size', '295×100mm'),
        ('template-295x300', '295×300mm'),
        ('template-square', '95×95mm'),
        ('template-badge', '100×70mm'),
        ('template-small', '60×60mm'),
        
        # Screen Printed Transfers - Full Colour Metallic (9 templates)
        ('metallic-A3', 'A3 Metallic'),
        ('metallic-A4', 'A4 Metallic'),
        ('metallic-A5', 'A5 Metallic'),
        ('metallic-A6', 'A6 Metallic'),
        ('metallic-transfer-size', '295×100mm Metallic'),
        ('metallic-295x300', '295×300mm Metallic'),
        ('metallic-square', '95×95mm Metallic'),
        ('metallic-badge', '100×70mm Metallic'),
        ('metallic-small', '60×60mm Metallic'),
        
        # Screen Printed Transfers - Full Colour HD (3 templates)
        ('hd-A3', 'A3 HD'),
        ('hd-A4', 'A4 HD'),
        ('hd-295x300', '295×300mm HD'),
        
        # Screen Printed Transfers - Single Colour (9 templates)
        ('single-A3', 'A3 Single Colour'),
        ('single-A4', 'A4 Single Colour'),
        ('single-A5', 'A5 Single Colour'),
        ('single-A6', 'A6 Single Colour'),
        ('single-transfer-size', '295×100mm Single Colour'),
        ('single-295x300', '295×300mm Single Colour'),
        ('single-square', '95×95mm Single Colour'),
        ('single-badge', '100×70mm Single Colour'),
        ('single-small', '60×60mm Single Colour'),
        
        # Screen Printed Transfers - Zero (9 templates)
        ('zero-A3', 'A3 Zero'),
        ('zero-A4', 'A4 Zero'),
        ('zero-A5', 'A5 Zero'),
        ('zero-A6', 'A6 Zero'),
        ('zero-transfer-size', '295×100mm Zero'),
        ('zero-295x300', '295×300mm Zero'),
        ('zero-square', '95×95mm Zero'),
        ('zero-badge', '100×70mm Zero'),
        ('zero-small', '60×60mm Zero'),
        
        # Digital Transfers - DTF (3 templates)
        ('dtf-SRA3', 'SRA3'),
        ('dtf-large', '1000×550mm DTF'),
        ('dtf-295x300', '295×300mm DTF'),
        
        # Digital Transfers - UV DTF (1 template)
        ('uvdtf-A3', 'A3 UV DTF'),
        
        # Digital Transfers - Custom Badges (4 templates)
        ('woven-A6', 'A6 Woven'),
        ('woven-square', '95×95mm Woven'),
        ('woven-badge', '100×70mm Woven'),
        ('woven-small', '60×60mm Woven'),
        
        # Digital Transfers - Applique Badges (4 templates)
        ('applique-A6', 'A6 Applique'),
        ('applique-square', '95×95mm Applique'),
        ('applique-badge', '100×70mm Applique'),
        ('applique-small', '60×60mm Applique'),
        
        # Screen Printed Transfers - Reflective (9 templates)
        ('reflective-A3', 'A3 Reflective'),
        ('reflective-A4', 'A4 Reflective'),
        ('reflective-A5', 'A5 Reflective'),
        ('reflective-A6', 'A6 Reflective'),
        ('reflective-transfer-size', '295×100mm Reflective'),
        ('reflective-295x300', '295×300mm Reflective'),
        ('reflective-square', '95×95mm Reflective'),
        ('reflective-badge', '100×70mm Reflective'),
        ('reflective-small', '60×60mm Reflective'),
        
        # Digital Transfers - Sublimation (13 templates)
        ('sublimation-A2-fabric', 'A2 Fabric'),
        ('sublimation-A3-fabric', 'A3 Fabric'),
        ('sublimation-A4-fabric', 'A4 Fabric'),
        ('sublimation-A3', 'A3 Hard Surface'),
        ('sublimation-A4', 'A4 Hard Surface'),
        ('sublimation-mug', 'Mug Size'),
        ('sublimation-A5', 'A5 Sublimation'),
        ('sublimation-A6', 'A6 Sublimation'),
        ('sublimation-transfer-size', '295×100mm Sublimation'),
        ('sublimation-295x300', '295×300mm Sublimation'),
        ('sublimation-square', '95×95mm Sublimation'),
        ('sublimation-badge', '100×70mm Sublimation'),
        ('sublimation-small', '60×60mm Sublimation'),
    ], string='Template ID', required=True)
    
    product_id = fields.Many2one('product.product', string='Product', required=True, 
                                 help='The product in your Odoo catalog that corresponds to this template')
    
    active = fields.Boolean('Active', default=True)
    
    # Additional fields for flexibility
    min_quantity = fields.Integer('Minimum Quantity', default=10,
                                  help='Minimum quantity required for this template')
    max_quantity = fields.Integer('Maximum Quantity',
                                  help='Maximum quantity allowed (leave empty for no limit)')
    
    notes = fields.Text('Notes', help='Additional notes about this mapping')
    
    _sql_constraints = [
        ('template_unique', 'unique(template_id)', 'Each template can only be mapped once!'),
    ]
    
    @api.model
    def get_product_for_template(self, template_id):
        """Get the mapped product for a given template ID"""
        mapping = self.search([('template_id', '=', template_id), ('active', '=', True)], limit=1)
        if mapping:
            return mapping.product_id
        return False
    
    @api.model
    def get_min_quantity_for_template(self, template_id):
        """Get the minimum quantity for a given template ID"""
        mapping = self.search([('template_id', '=', template_id), ('active', '=', True)], limit=1)
        if mapping:
            return mapping.min_quantity
        return 10  # Default minimum