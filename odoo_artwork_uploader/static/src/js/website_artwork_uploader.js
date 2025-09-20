/** @odoo-module **/
/**
 * Website Frontend Artwork Uploader Initializer
 * Mounts the OWL component to the DOM when page loads
 */

import { mount, App, Component } from "@odoo/owl";
import { ArtworkUploader } from "./artwork_uploader";
import { templates } from "@web/core/assets";

// Simple website-compatible version that doesn't rely on Odoo services
class WebsiteArtworkUploader extends Component {
    setup() {
        // Extract data from DOM dataset
        const rootElement = document.getElementById('artwork-uploader-root');
        this.templates = JSON.parse(rootElement.dataset.templates || '[]');
        this.garmentColors = JSON.parse(rootElement.dataset.garmentColors || '[]');
        this.inkColors = JSON.parse(rootElement.dataset.inkColors || '[]');
        
        console.log('🎨 Website Artwork Uploader setup complete', {
            templatesCount: this.templates.length,
            garmentColorsCount: this.garmentColors.length,
            inkColorsCount: this.inkColors.length
        });
    }
    
    async createProject(templateType) {
        console.log('Creating project with template:', templateType);
        // Implement basic project creation
        alert(`Would create project with template: ${templateType}`);
    }
}

// Use simple template for now
WebsiteArtworkUploader.template = `
    <div class="artwork-uploader-website">
        <div class="row mb-4">
            <div class="col-12 text-center">
                <h2>Create Your Design</h2>
                <p class="text-muted">Upload your logo and position it on your chosen template</p>
            </div>
        </div>
        
        <!-- Template Selection -->
        <div class="row mb-4">
            <div class="col-12">
                <h4>Choose Your Template</h4>
                <div class="template-grid row">
                    <t t-foreach="templates" t-as="template">
                        <div class="col-md-4 col-sm-6 mb-3">
                            <div class="card template-card h-100 hover-shadow" style="cursor: pointer;" 
                                 t-on-click="() => this.createProject(template.name)">
                                <div class="card-body text-center">
                                    <i class="fa fa-file-image-o fa-2x text-primary mb-2"></i>
                                    <h6 class="card-title" t-esc="template.name"/>
                                    <p class="card-text text-muted small">Click to select</p>
                                </div>
                            </div>
                        </div>
                    </t>
                </div>
            </div>
        </div>
        
        <!-- Fallback if no templates -->
        <div class="row" t-if="templates.length === 0">
            <div class="col-12 text-center">
                <div class="alert alert-info">
                    <h5>No templates available</h5>
                    <p>Please contact support to set up templates for this system.</p>
                </div>
            </div>
        </div>
    </div>
`;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const rootElement = document.getElementById('artwork-uploader-root');
    
    if (rootElement) {
        console.log('🎨 Initializing Website Artwork Uploader...');
        
        try {
            // Create app instance
            const app = new App(WebsiteArtworkUploader, {
                templates,
                dev: window.location.hostname === 'localhost'
            });
            
            // Mount to DOM
            app.mount(rootElement);
            
            console.log('✅ Website Artwork Uploader initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize Website Artwork Uploader:', error);
            
            // Show error message instead of spinner
            rootElement.innerHTML = `
                <div class="alert alert-danger text-center">
                    <h4>Failed to load Design Tool</h4>
                    <p class="mb-3">The application could not start. This might be a temporary issue.</p>
                    <button class="btn btn-primary me-2" onclick="location.reload()">
                        <i class="fa fa-refresh"></i> Refresh Page
                    </button>
                    <small class="text-muted d-block mt-2">Error: ${error.message}</small>
                </div>
            `;
        }
    } else {
        console.warn('⚠️ Artwork uploader root element not found');
    }
});