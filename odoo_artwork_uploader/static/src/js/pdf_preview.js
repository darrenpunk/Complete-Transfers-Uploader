/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";

export class PDFPreview extends Component {
    setup() {
        this.state = useState({
            loading: true,
            currentPage: 1,
            totalPages: 2,
            pdfUrl: null,
            error: null,
        });
        
        onWillStart(async () => {
            await this.loadPDF();
        });
    }
    
    async loadPDF() {
        try {
            this.state.loading = true;
            this.state.error = null;
            
            const projectId = this.props.projectId;
            if (!projectId) {
                throw new Error('No project ID provided');
            }
            
            // Generate PDF URL
            this.state.pdfUrl = `/artwork/api/projects/${projectId}/generate-pdf`;
            
            // Optionally, verify PDF generation
            const response = await fetch(this.state.pdfUrl, { method: 'HEAD' });
            if (!response.ok) {
                throw new Error('Failed to generate PDF');
            }
            
            this.state.loading = false;
        } catch (error) {
            this.state.error = error.message;
            this.state.loading = false;
        }
    }
    
    nextPage() {
        if (this.state.currentPage < this.state.totalPages) {
            this.state.currentPage++;
        }
    }
    
    previousPage() {
        if (this.state.currentPage > 1) {
            this.state.currentPage--;
        }
    }
    
    downloadPDF() {
        if (this.state.pdfUrl) {
            window.open(this.state.pdfUrl, '_blank');
        }
    }
    
    approve() {
        this.props.onApprove();
    }
    
    reject() {
        this.props.onReject();
    }
    
    get pageDescription() {
        if (this.state.currentPage === 1) {
            return 'Page 1: Artwork on garment background';
        } else {
            return 'Page 2: Gang sheet layout';
        }
    }
}

PDFPreview.template = "artwork_uploader.PDFPreview";
PDFPreview.props = {
    projectId: { type: String },
    onApprove: { type: Function },
    onReject: { type: Function },
};