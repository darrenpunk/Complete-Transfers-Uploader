from odoo import models, fields, api
import json

class ArtworkCanvasElement(models.Model):
    _name = 'artwork.canvas.element'
    _description = 'Canvas Element Position'
    _order = 'sequence, id'
    
    name = fields.Char('Name', compute='_compute_name', store=True)
    project_id = fields.Many2one('artwork.project', string='Project', required=True, ondelete='cascade')
    logo_id = fields.Many2one('artwork.logo', string='Logo', required=True)
    sequence = fields.Integer('Sequence', default=10)
    
    # Position and dimensions
    x = fields.Float('X Position', default=0)
    y = fields.Float('Y Position', default=0)
    width = fields.Float('Width', default=100)
    height = fields.Float('Height', default=100)
    
    # Transformation
    rotation = fields.Float('Rotation (degrees)', default=0)
    scale_x = fields.Float('Scale X', default=1)
    scale_y = fields.Float('Scale Y', default=1)
    opacity = fields.Float('Opacity', default=1, help='0-1 range')
    
    # Styling
    garment_color = fields.Char('Element Garment Color', help='Override project garment color')
    garment_color_name = fields.Char('Element Garment Color Name')
    
    # Imposition settings
    is_imposition = fields.Boolean('Is Imposition', default=False)
    imposition_rows = fields.Integer('Rows', default=1)
    imposition_cols = fields.Integer('Columns', default=1)
    imposition_spacing_x = fields.Float('Horizontal Spacing', default=10)
    imposition_spacing_y = fields.Float('Vertical Spacing', default=10)
    
    # Lock states
    is_locked = fields.Boolean('Locked', default=False)
    lock_position = fields.Boolean('Lock Position', default=False)
    lock_size = fields.Boolean('Lock Size', default=False)
    lock_rotation = fields.Boolean('Lock Rotation', default=False)
    
    @api.depends('logo_id', 'x', 'y')
    def _compute_name(self):
        for record in self:
            if record.logo_id:
                record.name = f"{record.logo_id.name} at ({record.x:.0f}, {record.y:.0f})"
            else:
                record.name = f"Element at ({record.x:.0f}, {record.y:.0f})"
    
    def get_canvas_data(self):
        """Get canvas element data as dict"""
        self.ensure_one()
        return {
            'id': self.id,
            'logoId': self.logo_id.id,
            'x': self.x,
            'y': self.y,
            'width': self.width,
            'height': self.height,
            'rotation': self.rotation,
            'scaleX': self.scale_x,
            'scaleY': self.scale_y,
            'opacity': self.opacity,
            'garmentColor': self.garment_color or 'default',
            'isImposition': self.is_imposition,
            'impositionRows': self.imposition_rows,
            'impositionCols': self.imposition_cols,
            'impositionSpacingX': self.imposition_spacing_x,
            'impositionSpacingY': self.imposition_spacing_y,
            'isLocked': self.is_locked,
        }
    
    @api.model
    def create_from_canvas_data(self, project_id, canvas_data):
        """Create element from canvas data dict"""
        vals = {
            'project_id': project_id,
            'logo_id': canvas_data.get('logoId'),
            'x': canvas_data.get('x', 0),
            'y': canvas_data.get('y', 0),
            'width': canvas_data.get('width', 100),
            'height': canvas_data.get('height', 100),
            'rotation': canvas_data.get('rotation', 0),
            'scale_x': canvas_data.get('scaleX', 1),
            'scale_y': canvas_data.get('scaleY', 1),
            'opacity': canvas_data.get('opacity', 1),
            'garment_color': canvas_data.get('garmentColor') if canvas_data.get('garmentColor') != 'default' else False,
            'is_imposition': canvas_data.get('isImposition', False),
            'imposition_rows': canvas_data.get('impositionRows', 1),
            'imposition_cols': canvas_data.get('impositionCols', 1),
            'imposition_spacing_x': canvas_data.get('impositionSpacingX', 10),
            'imposition_spacing_y': canvas_data.get('impositionSpacingY', 10),
            'is_locked': canvas_data.get('isLocked', False),
        }
        return self.create(vals)