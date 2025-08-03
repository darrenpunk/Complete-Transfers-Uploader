/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class ArtworkUploader extends Component {
    setup() {
        this.rpc = useService("rpc");
        this.notification = useService("notification");
        
        this.state = useState({
            currentProject: null,
            logos: [],
            canvasElements: [],
            selectedTemplate: null,
            garmentColor: '#000000',
            loading: false,
        });
        
        onWillStart(async () => {
            // Initialize component
            await this.loadTemplates();
        });
    }
    
    async loadTemplates() {
        // Load available templates from backend
        const templates = await this.rpc("/artwork/api/templates");
        this.templates = templates;
    }
    
    async createProject(templateSize) {
        this.state.loading = true;
        try {
            const project = await this.rpc("/artwork/api/projects", {
                name: "Untitled Project",
                templateSize: templateSize,
                garmentColor: this.state.garmentColor,
            });
            this.state.currentProject = project;
            this.notification.add("Project created successfully", { type: "success" });
        } catch (error) {
            this.notification.add("Error creating project", { type: "danger" });
        } finally {
            this.state.loading = false;
        }
    }
    
    async uploadLogo(file) {
        if (!this.state.currentProject) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64Data = e.target.result.split(',')[1];
            
            try {
                const logo = await this.rpc(`/artwork/api/projects/${this.state.currentProject.id}/logos`, {
                    file: base64Data,
                    filename: file.name,
                });
                
                this.state.logos.push(logo);
                this.notification.add("Logo uploaded successfully", { type: "success" });
            } catch (error) {
                this.notification.add("Error uploading logo", { type: "danger" });
            }
        };
        reader.readAsDataURL(file);
    }
    
    async generatePDF() {
        if (!this.state.currentProject) return;
        
        window.open(`/artwork/api/projects/${this.state.currentProject.id}/generate-pdf`, '_blank');
    }
    
    async addToCart() {
        if (!this.state.currentProject) return;
        
        try {
            const result = await this.rpc(`/artwork/api/projects/${this.state.currentProject.id}/add-to-cart`);
            if (result.success) {
                window.location.href = '/shop/cart';
            }
        } catch (error) {
            this.notification.add("Error adding to cart", { type: "danger" });
        }
    }
}

ArtworkUploader.template = "artwork_uploader.ArtworkUploader";

registry.category("public_components").add("artwork_uploader", ArtworkUploader);