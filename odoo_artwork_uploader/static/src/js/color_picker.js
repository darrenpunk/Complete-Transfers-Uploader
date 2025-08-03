/** @odoo-module **/

import { Component, useState } from "@odoo/owl";

export class ColorPicker extends Component {
    setup() {
        this.state = useState({
            selectedColor: this.props.value || '#000000',
            showPicker: false,
            activeTab: 'gildan',
        });
        
        // Garment color data
        this.garmentColors = {
            gildan: [
                { name: 'White', hex: '#FFFFFF' },
                { name: 'Black', hex: '#000000' },
                { name: 'Sport Grey', hex: '#B0B0B0' },
                { name: 'Navy', hex: '#1F2F56' },
                { name: 'Royal', hex: '#0066CC' },
                { name: 'Red', hex: '#ED1C24' },
                { name: 'Cardinal Red', hex: '#9D2235' },
                { name: 'Maroon', hex: '#6D2837' },
                { name: 'Light Blue', hex: '#9BCBEB' },
                { name: 'Sapphire', hex: '#0F4C81' },
                { name: 'Purple', hex: '#7B3F99' },
                { name: 'Irish Green', hex: '#00A650' },
                { name: 'Forest Green', hex: '#264435' },
                { name: 'Military Green', hex: '#4B5320' },
                { name: 'Gold', hex: '#FFB81C' },
                { name: 'Orange', hex: '#FF6900' },
                { name: 'Sand', hex: '#CEB888' },
                { name: 'Charcoal', hex: '#36454F' },
                { name: 'Light Pink', hex: '#FFCCCB' },
                { name: 'Safety Green', hex: '#C9FF00' },
                { name: 'Safety Orange', hex: '#FF6700' },
                { name: 'Safety Pink', hex: '#FF69B4' },
                { name: 'Ash', hex: '#B2BEB5' },
                { name: 'Carolina Blue', hex: '#99BADD' },
                { name: 'Garnet', hex: '#6D2837' },
                { name: 'Texas Orange', hex: '#BF5700' },
                { name: 'Tropical Blue', hex: '#00A9CE' }
            ],
            fruitOfTheLoom: [
                { name: 'White', hex: '#FFFFFF' },
                { name: 'Black', hex: '#000000' },
                { name: 'Heather Grey', hex: '#B6B6B6' },
                { name: 'Navy', hex: '#1C2841' },
                { name: 'Royal Blue', hex: '#1652AC' },
                { name: 'Red', hex: '#E3002B' },
                { name: 'Light Graphite', hex: '#8B8B8B' },
                { name: 'Sky Blue', hex: '#87CEEB' },
                { name: 'Kelly Green', hex: '#009B48' },
                { name: 'Bottle Green', hex: '#1F4F2F' },
                { name: 'Burgundy', hex: '#6B0F1A' },
                { name: 'Classic Olive', hex: '#708238' },
                { name: 'Orange', hex: '#FF7F00' },
                { name: 'Purple', hex: '#663399' },
                { name: 'Yellow', hex: '#FFD700' },
                { name: 'Lime', hex: '#BFFF00' },
                { name: 'Chocolate', hex: '#5D2914' },
                { name: 'Deep Navy', hex: '#0F1E3D' },
                { name: 'Fuchsia', hex: '#FF1493' },
                { name: 'Azure Blue', hex: '#0080FF' },
                { name: 'Natural', hex: '#F5F5DC' },
                { name: 'Zinc', hex: '#BAC4C8' },
                { name: 'Sunflower', hex: '#FFD500' },
                { name: 'Light Pink', hex: '#FFB6C1' },
                { name: 'Retro Heather Green', hex: '#6B8E23' },
                { name: 'Retro Heather Royal', hex: '#4169E1' },
                { name: 'Vintage Heather Navy', hex: '#465865' }
            ]
        };
    }
    
    togglePicker() {
        this.state.showPicker = !this.state.showPicker;
    }
    
    selectColor(color) {
        this.state.selectedColor = color.hex;
        this.props.onChange(color);
        this.state.showPicker = false;
    }
    
    switchTab(tab) {
        this.state.activeTab = tab;
    }
    
    get displayColors() {
        return this.garmentColors[this.state.activeTab] || [];
    }
    
    get selectedColorName() {
        for (const brand of Object.keys(this.garmentColors)) {
            const color = this.garmentColors[brand].find(c => c.hex === this.state.selectedColor);
            if (color) {
                return `${color.name} (${brand.charAt(0).toUpperCase() + brand.slice(1)})`;
            }
        }
        return this.state.selectedColor;
    }
}

ColorPicker.template = "artwork_uploader.ColorPicker";
ColorPicker.props = {
    value: { type: String, optional: true },
    onChange: { type: Function },
};