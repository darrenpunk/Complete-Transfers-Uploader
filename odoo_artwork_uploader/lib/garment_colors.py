"""
Garment Color Database for Odoo Artwork Uploader
Ported from React/Express garment-colors.ts
"""

# Garment color definitions with CMYK values
GARMENT_COLORS = {
    'gildan': {
        'name': 'Gildan',
        'colors': [
            {'name': 'Black', 'hex': '#000000', 'cmyk': {'c': 0, 'm': 0, 'y': 0, 'k': 100}},
            {'name': 'White', 'hex': '#FFFFFF', 'cmyk': {'c': 0, 'm': 0, 'y': 0, 'k': 0}},
            {'name': 'Ash', 'hex': '#B8B8B8', 'cmyk': {'c': 0, 'm': 0, 'y': 0, 'k': 28}},
            {'name': 'Sport Grey', 'hex': '#8C8C8C', 'cmyk': {'c': 0, 'm': 0, 'y': 0, 'k': 45}},
            {'name': 'Dark Heather', 'hex': '#616161', 'cmyk': {'c': 0, 'm': 0, 'y': 0, 'k': 62}},
            {'name': 'Red', 'hex': '#FF0000', 'cmyk': {'c': 0, 'm': 100, 'y': 100, 'k': 0}},
            {'name': 'Cardinal Red', 'hex': '#B71234', 'cmyk': {'c': 0, 'm': 90, 'y': 71, 'k': 28}},
            {'name': 'Cherry Red', 'hex': '#C5282F', 'cmyk': {'c': 0, 'm': 84, 'y': 76, 'k': 23}},
            {'name': 'Orange', 'hex': '#FF8C00', 'cmyk': {'c': 0, 'm': 45, 'y': 100, 'k': 0}},
            {'name': 'Gold', 'hex': '#FFD700', 'cmyk': {'c': 0, 'm': 16, 'y': 100, 'k': 0}},
            {'name': 'Yellow Haze', 'hex': '#FFFF99', 'cmyk': {'c': 0, 'm': 0, 'y': 40, 'k': 0}},
            {'name': 'Daisy', 'hex': '#FFFF00', 'cmyk': {'c': 0, 'm': 0, 'y': 100, 'k': 0}},
            {'name': 'Royal Blue', 'hex': '#0047AB', 'cmyk': {'c': 100, 'm': 58, 'y': 0, 'k': 33}},
            {'name': 'Navy', 'hex': '#000080', 'cmyk': {'c': 100, 'm': 100, 'y': 0, 'k': 50}},
            {'name': 'Irish Green', 'hex': '#00FF00', 'cmyk': {'c': 100, 'm': 0, 'y': 100, 'k': 0}},
            {'name': 'Forest Green', 'hex': '#228B22', 'cmyk': {'c': 76, 'm': 0, 'y': 76, 'k': 45}},
            {'name': 'Purple', 'hex': '#800080', 'cmyk': {'c': 0, 'm': 100, 'y': 0, 'k': 50}},
            {'name': 'Heliconia', 'hex': '#FF1493', 'cmyk': {'c': 0, 'm': 92, 'y': 42, 'k': 0}},
            {'name': 'Safety Pink', 'hex': '#FF69B4', 'cmyk': {'c': 0, 'm': 59, 'y': 29, 'k': 0}},
            {'name': 'Safety Orange', 'hex': '#FF4500', 'cmyk': {'c': 0, 'm': 73, 'y': 100, 'k': 0}},
            {'name': 'Safety Green', 'hex': '#32CD32', 'cmyk': {'c': 75, 'm': 0, 'y': 75, 'k': 20}},
            {'name': 'Maroon', 'hex': '#800000', 'cmyk': {'c': 0, 'm': 100, 'y': 100, 'k': 50}},
            {'name': 'Brown', 'hex': '#A52A2A', 'cmyk': {'c': 0, 'm': 74, 'y': 74, 'k': 35}},
            {'name': 'Tan', 'hex': '#D2B48C', 'cmyk': {'c': 0, 'm': 14, 'y': 33, 'k': 18}},
            {'name': 'Light Blue', 'hex': '#ADD8E6', 'cmyk': {'c': 24, 'm': 6, 'y': 0, 'k': 10}},
            {'name': 'Light Pink', 'hex': '#FFB6C1', 'cmyk': {'c': 0, 'm': 29, 'y': 24, 'k': 0}},
            {'name': 'Natural', 'hex': '#F5F5DC', 'cmyk': {'c': 0, 'm': 0, 'y': 10, 'k': 4}},
        ]
    },
    'fruit_of_the_loom': {
        'name': 'Fruit of the Loom',
        'colors': [
            {'name': 'Black', 'hex': '#000000', 'cmyk': {'c': 0, 'm': 0, 'y': 0, 'k': 100}},
            {'name': 'White', 'hex': '#FFFFFF', 'cmyk': {'c': 0, 'm': 0, 'y': 0, 'k': 0}},
            {'name': 'Heather Grey', 'hex': '#D3D3D3', 'cmyk': {'c': 0, 'm': 0, 'y': 0, 'k': 17}},
            {'name': 'Red', 'hex': '#FF0000', 'cmyk': {'c': 0, 'm': 100, 'y': 100, 'k': 0}},
            {'name': 'Navy', 'hex': '#000080', 'cmyk': {'c': 100, 'm': 100, 'y': 0, 'k': 50}},
            {'name': 'Royal Blue', 'hex': '#4169E1', 'cmyk': {'c': 74, 'm': 58, 'y': 0, 'k': 12}},
            {'name': 'Kelly Green', 'hex': '#4CBB17', 'cmyk': {'c': 70, 'm': 0, 'y': 87, 'k': 27}},
            {'name': 'Purple', 'hex': '#800080', 'cmyk': {'c': 0, 'm': 100, 'y': 0, 'k': 50}},
            {'name': 'Orange', 'hex': '#FFA500', 'cmyk': {'c': 0, 'm': 35, 'y': 100, 'k': 0}},
            {'name': 'Yellow', 'hex': '#FFFF00', 'cmyk': {'c': 0, 'm': 0, 'y': 100, 'k': 0}},
            {'name': 'Sky Blue', 'hex': '#87CEEB', 'cmyk': {'c': 43, 'm': 16, 'y': 0, 'k': 8}},
            {'name': 'Pink', 'hex': '#FFC0CB', 'cmyk': {'c': 0, 'm': 25, 'y': 20, 'k': 0}},
            {'name': 'Lime Green', 'hex': '#32CD32', 'cmyk': {'c': 75, 'm': 0, 'y': 75, 'k': 20}},
            {'name': 'Burgundy', 'hex': '#800020', 'cmyk': {'c': 0, 'm': 100, 'y': 75, 'k': 50}},
            {'name': 'Forest Green', 'hex': '#228B22', 'cmyk': {'c': 76, 'm': 0, 'y': 76, 'k': 45}},
        ]
    }
}

# Specialized color categories
SPECIALIZED_COLORS = {
    'hi_viz': [
        {'name': 'Hi-Viz Orange', 'hex': '#FF6600', 'cmyk': {'c': 0, 'm': 60, 'y': 100, 'k': 0}},
        {'name': 'Hi-Viz Yellow', 'hex': '#FFFF00', 'cmyk': {'c': 0, 'm': 0, 'y': 100, 'k': 0}},
        {'name': 'Hi-Viz Green', 'hex': '#00FF00', 'cmyk': {'c': 100, 'm': 0, 'y': 100, 'k': 0}},
        {'name': 'Hi-Viz Pink', 'hex': '#FF1493', 'cmyk': {'c': 0, 'm': 92, 'y': 42, 'k': 0}},
    ],
    'pastels': [
        {'name': 'Pastel Blue', 'hex': '#B8E6FF', 'cmyk': {'c': 28, 'm': 10, 'y': 0, 'k': 0}},
        {'name': 'Pastel Pink', 'hex': '#FFD1DC', 'cmyk': {'c': 0, 'm': 18, 'y': 14, 'k': 0}},
        {'name': 'Pastel Yellow', 'hex': '#FFFF99', 'cmyk': {'c': 0, 'm': 0, 'y': 40, 'k': 0}},
        {'name': 'Pastel Green', 'hex': '#90EE90', 'cmyk': {'c': 43, 'm': 0, 'y': 43, 'k': 7}},
        {'name': 'Pastel Purple', 'hex': '#DDA0DD', 'cmyk': {'c': 13, 'm': 28, 'y': 0, 'k': 13}},
    ],
    'specialty_inks': [
        {'name': 'Metallic Gold', 'hex': '#FFD700', 'cmyk': {'c': 0, 'm': 16, 'y': 100, 'k': 0}, 'specialty': 'metallic'},
        {'name': 'Metallic Silver', 'hex': '#C0C0C0', 'cmyk': {'c': 0, 'm': 0, 'y': 0, 'k': 25}, 'specialty': 'metallic'},
        {'name': 'Glow in Dark', 'hex': '#F0F8FF', 'cmyk': {'c': 6, 'm': 3, 'y': 0, 'k': 0}, 'specialty': 'glow'},
        {'name': 'Reflective', 'hex': '#E5E5E5', 'cmyk': {'c': 0, 'm': 0, 'y': 0, 'k': 10}, 'specialty': 'reflective'},
    ]
}

class GarmentColorManager:
    """Manages garment color data and lookups"""
    
    @staticmethod
    def get_all_colors():
        """Get all available garment colors"""
        all_colors = []
        
        # Add manufacturer colors
        for manufacturer_key, manufacturer_data in GARMENT_COLORS.items():
            for color in manufacturer_data['colors']:
                color_info = color.copy()
                color_info['manufacturer'] = manufacturer_data['name']
                color_info['manufacturer_key'] = manufacturer_key
                all_colors.append(color_info)
        
        # Add specialized colors
        for category_key, colors in SPECIALIZED_COLORS.items():
            for color in colors:
                color_info = color.copy()
                color_info['category'] = category_key
                all_colors.append(color_info)
        
        return all_colors
    
    @staticmethod
    def find_color_by_hex(hex_color):
        """Find color information by hex value"""
        hex_color = hex_color.upper().lstrip('#')
        if not hex_color.startswith('#'):
            hex_color = f'#{hex_color}'
        
        all_colors = GarmentColorManager.get_all_colors()
        
        for color in all_colors:
            if color['hex'].upper() == hex_color.upper():
                return color
        
        return None
    
    @staticmethod
    def find_closest_color(hex_color):
        """Find closest matching color by hex value"""
        hex_color = hex_color.upper().lstrip('#')
        target_rgb = GarmentColorManager.hex_to_rgb(hex_color)
        
        if not target_rgb:
            return None
        
        all_colors = GarmentColorManager.get_all_colors()
        closest_color = None
        min_distance = float('inf')
        
        for color in all_colors:
            color_rgb = GarmentColorManager.hex_to_rgb(color['hex'].lstrip('#'))
            if color_rgb:
                distance = GarmentColorManager.color_distance(target_rgb, color_rgb)
                if distance < min_distance:
                    min_distance = distance
                    closest_color = color
        
        return closest_color
    
    @staticmethod
    def hex_to_rgb(hex_color):
        """Convert hex color to RGB tuple"""
        try:
            hex_color = hex_color.lstrip('#')
            return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
        except (ValueError, IndexError):
            return None
    
    @staticmethod
    def color_distance(rgb1, rgb2):
        """Calculate Euclidean distance between two RGB colors"""
        return sum((a - b) ** 2 for a, b in zip(rgb1, rgb2)) ** 0.5
    
    @staticmethod
    def get_cmyk_string(color_info):
        """Get formatted CMYK string for color"""
        cmyk = color_info.get('cmyk', {})
        return f"C:{cmyk.get('c', 0)} M:{cmyk.get('m', 0)} Y:{cmyk.get('y', 0)} K:{cmyk.get('k', 0)}"
    
    @staticmethod
    def get_colors_by_manufacturer(manufacturer_key):
        """Get colors for specific manufacturer"""
        if manufacturer_key in GARMENT_COLORS:
            return GARMENT_COLORS[manufacturer_key]['colors']
        return []
    
    @staticmethod
    def get_specialized_colors(category=None):
        """Get specialized colors by category"""
        if category and category in SPECIALIZED_COLORS:
            return SPECIALIZED_COLORS[category]
        return SPECIALIZED_COLORS