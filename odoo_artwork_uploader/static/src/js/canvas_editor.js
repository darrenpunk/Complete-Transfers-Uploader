/** @odoo-module **/

import { Component, useState, useRef, onMounted } from "@odoo/owl";

export class CanvasEditor extends Component {
    setup() {
        this.canvasRef = useRef("canvas");
        this.state = useState({
            selectedElement: null,
            elements: [],
            zoom: 1,
            showGrid: false,
        });
        
        onMounted(() => {
            this.initializeCanvas();
        });
    }
    
    initializeCanvas() {
        const canvas = this.canvasRef.el;
        if (!canvas) return;
        
        // Set canvas dimensions based on template
        const template = this.props.template;
        if (template) {
            canvas.width = template.width;
            canvas.height = template.height;
        }
        
        // Add event listeners
        canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        canvas.addEventListener('wheel', this.handleWheel.bind(this));
        
        this.redraw();
    }
    
    handleMouseDown(event) {
        const rect = this.canvasRef.el.getBoundingClientRect();
        const x = (event.clientX - rect.left) / this.state.zoom;
        const y = (event.clientY - rect.top) / this.state.zoom;
        
        // Check if clicking on an element
        const clickedElement = this.getElementAt(x, y);
        if (clickedElement) {
            this.state.selectedElement = clickedElement;
            this.isDragging = true;
            this.dragStart = { x, y };
            this.elementStart = {
                x: clickedElement.x,
                y: clickedElement.y
            };
        }
    }
    
    handleMouseMove(event) {
        if (!this.isDragging || !this.state.selectedElement) return;
        
        const rect = this.canvasRef.el.getBoundingClientRect();
        const x = (event.clientX - rect.left) / this.state.zoom;
        const y = (event.clientY - rect.top) / this.state.zoom;
        
        const dx = x - this.dragStart.x;
        const dy = y - this.dragStart.y;
        
        this.state.selectedElement.x = this.elementStart.x + dx;
        this.state.selectedElement.y = this.elementStart.y + dy;
        
        this.redraw();
    }
    
    handleMouseUp() {
        if (this.isDragging && this.state.selectedElement) {
            // Save position
            this.props.onElementUpdate(this.state.selectedElement);
        }
        this.isDragging = false;
    }
    
    handleWheel(event) {
        event.preventDefault();
        
        const delta = event.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(0.1, this.state.zoom * delta), 5);
        
        this.state.zoom = newZoom;
        this.redraw();
    }
    
    getElementAt(x, y) {
        // Check elements in reverse order (top to bottom)
        for (let i = this.state.elements.length - 1; i >= 0; i--) {
            const element = this.state.elements[i];
            if (x >= element.x && x <= element.x + element.width &&
                y >= element.y && y <= element.y + element.height) {
                return element;
            }
        }
        return null;
    }
    
    addElement(logo) {
        const element = {
            id: Date.now(),
            logoId: logo.id,
            x: 50,
            y: 50,
            width: logo.width || 100,
            height: logo.height || 100,
            rotation: 0,
            scale: 1,
            image: logo.url,
        };
        
        this.state.elements.push(element);
        this.redraw();
        
        // Notify parent
        this.props.onElementAdd(element);
    }
    
    rotateSelected(degrees) {
        if (!this.state.selectedElement) return;
        
        this.state.selectedElement.rotation = 
            (this.state.selectedElement.rotation + degrees) % 360;
        
        this.redraw();
        this.props.onElementUpdate(this.state.selectedElement);
    }
    
    scaleSelected(factor) {
        if (!this.state.selectedElement) return;
        
        this.state.selectedElement.scale *= factor;
        this.state.selectedElement.width *= factor;
        this.state.selectedElement.height *= factor;
        
        this.redraw();
        this.props.onElementUpdate(this.state.selectedElement);
    }
    
    deleteSelected() {
        if (!this.state.selectedElement) return;
        
        const index = this.state.elements.indexOf(this.state.selectedElement);
        if (index > -1) {
            this.state.elements.splice(index, 1);
            this.state.selectedElement = null;
            this.redraw();
            this.props.onElementDelete(this.state.selectedElement.id);
        }
    }
    
    centerAll() {
        const canvas = this.canvasRef.el;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        // Calculate bounding box of all elements
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        this.state.elements.forEach(element => {
            minX = Math.min(minX, element.x);
            minY = Math.min(minY, element.y);
            maxX = Math.max(maxX, element.x + element.width);
            maxY = Math.max(maxY, element.y + element.height);
        });
        
        const groupWidth = maxX - minX;
        const groupHeight = maxY - minY;
        const groupCenterX = minX + groupWidth / 2;
        const groupCenterY = minY + groupHeight / 2;
        
        const offsetX = centerX - groupCenterX;
        const offsetY = centerY - groupCenterY;
        
        // Move all elements
        this.state.elements.forEach(element => {
            element.x += offsetX;
            element.y += offsetY;
            this.props.onElementUpdate(element);
        });
        
        this.redraw();
    }
    
    redraw() {
        const canvas = this.canvasRef.el;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Apply zoom
        ctx.save();
        ctx.scale(this.state.zoom, this.state.zoom);
        
        // Draw background
        if (this.props.backgroundColor) {
            ctx.fillStyle = this.props.backgroundColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        // Draw grid if enabled
        if (this.state.showGrid) {
            this.drawGrid(ctx);
        }
        
        // Draw elements
        this.state.elements.forEach(element => {
            this.drawElement(ctx, element);
        });
        
        // Draw selection
        if (this.state.selectedElement) {
            this.drawSelection(ctx, this.state.selectedElement);
        }
        
        ctx.restore();
    }
    
    drawGrid(ctx) {
        const gridSize = 20;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 0.5;
        
        for (let x = 0; x < this.canvasRef.el.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.canvasRef.el.height);
            ctx.stroke();
        }
        
        for (let y = 0; y < this.canvasRef.el.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.canvasRef.el.width, y);
            ctx.stroke();
        }
    }
    
    drawElement(ctx, element) {
        ctx.save();
        
        // Apply transformations
        ctx.translate(element.x + element.width / 2, element.y + element.height / 2);
        ctx.rotate((element.rotation * Math.PI) / 180);
        ctx.scale(element.scale, element.scale);
        
        // Draw image
        if (element.image) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, -element.width / 2, -element.height / 2, 
                            element.width, element.height);
            };
            img.src = element.image;
        }
        
        ctx.restore();
    }
    
    drawSelection(ctx, element) {
        ctx.strokeStyle = '#961E75';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        
        ctx.save();
        ctx.translate(element.x + element.width / 2, element.y + element.height / 2);
        ctx.rotate((element.rotation * Math.PI) / 180);
        
        ctx.strokeRect(-element.width / 2 - 5, -element.height / 2 - 5,
                      element.width + 10, element.height + 10);
        
        ctx.restore();
        ctx.setLineDash([]);
    }
}

CanvasEditor.template = "artwork_uploader.CanvasEditor";
CanvasEditor.props = {
    template: { type: Object, optional: true },
    backgroundColor: { type: String, optional: true },
    onElementAdd: { type: Function },
    onElementUpdate: { type: Function },
    onElementDelete: { type: Function },
};