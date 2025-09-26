/**
 * Website Frontend Artwork Uploader - Traditional JavaScript Version
 * Compatible with Odoo 16 website frontend (no OWL dependency)
 */

odoo.define('artwork_uploader.website_frontend', function (require) {
    'use strict';

    var publicWidget = require('web.public.widget');
    var core = require('web.core');
    var ajax = require('web.ajax');

    var ArtworkUploaderWebsite = publicWidget.Widget.extend({
        selector: '#artwork-uploader-root',
        
        events: {
            'click .template-card': '_onTemplateClick',
            'click .btn-upload': '_onUploadClick',
            'change input[type="file"]': '_onFileChange',
        },

        init: function() {
            this._super.apply(this, arguments);
            this.templates = [];
            this.garmentColors = [];
            this.inkColors = [];
            this.currentProject = null;
            this.logos = [];
        },

        start: function() {
            var self = this;
            return this._super.apply(this, arguments).then(function() {
                self._loadDataFromDOM();
                self._renderTemplateSelector();
                console.log('🎨 Artwork Uploader initialized', {
                    templatesCount: self.templates.length,
                    garmentColorsCount: self.garmentColors.length,
                    inkColorsCount: self.inkColors.length
                });
            });
        },

        _loadDataFromDOM: function() {
            var $root = this.$el;
            try {
                this.templates = JSON.parse($root.data('templates') || '[]');
                this.garmentColors = JSON.parse($root.data('garment-colors') || '[]');
                this.inkColors = JSON.parse($root.data('ink-colors') || '[]');
            } catch (e) {
                console.error('Error parsing uploader data:', e);
                this.templates = [];
                this.garmentColors = [];
                this.inkColors = [];
            }
        },

        _renderTemplateSelector: function() {
            var self = this;
            var screenPrintedTemplates = this.templates.filter(function(t) { 
                return t.group === 'Screen Printed Transfers'; 
            });
            var digitalTemplates = this.templates.filter(function(t) { 
                return t.group === 'Digital Transfers'; 
            });

            var html = `
                <div class="artwork-uploader-website">
                    <div class="row mb-4">
                        <div class="col-12 text-center">
                            <h2>Create Your Design</h2>
                            <p class="text-muted">Upload your logo and position it on your chosen template</p>
                        </div>
                    </div>`;

            // Screen Printed Transfers Section
            if (screenPrintedTemplates.length > 0) {
                html += `
                    <div class="row mb-4">
                        <div class="col-12">
                            <h4 class="mb-3">
                                <i class="fa fa-print text-primary me-2"></i>
                                Screen Printed Transfers
                            </h4>
                            <div class="template-grid row">`;
                
                screenPrintedTemplates.slice(0, 6).forEach(function(template) {
                    html += `
                        <div class="col-md-4 col-sm-6 mb-3">
                            <div class="card template-card h-100 shadow-sm" style="cursor: pointer;" 
                                 data-template-id="${template.id}" data-template-name="${template.name}">
                                <div class="card-body text-center">
                                    <i class="fa fa-print fa-2x text-primary mb-2"></i>
                                    <h6 class="card-title">${template.label || template.name}</h6>
                                    <p class="card-text text-muted small">${template.description || ''}</p>
                                </div>
                            </div>
                        </div>`;
                });
                
                html += `
                            </div>
                        </div>
                    </div>`;
            }

            // Digital Transfers Section  
            if (digitalTemplates.length > 0) {
                html += `
                    <div class="row mb-4">
                        <div class="col-12">
                            <h4 class="mb-3">
                                <i class="fa fa-laptop text-success me-2"></i>
                                Digital Transfers
                            </h4>
                            <div class="template-grid row">`;

                digitalTemplates.slice(0, 6).forEach(function(template) {
                    html += `
                        <div class="col-md-4 col-sm-6 mb-3">
                            <div class="card template-card h-100 shadow-sm" style="cursor: pointer;"
                                 data-template-id="${template.id}" data-template-name="${template.name}">
                                <div class="card-body text-center">
                                    <i class="fa fa-laptop fa-2x text-success mb-2"></i>
                                    <h6 class="card-title">${template.label || template.name}</h6>
                                    <p class="card-text text-muted small">${template.description || ''}</p>
                                </div>
                            </div>
                        </div>`;
                });

                html += `
                            </div>
                        </div>
                    </div>`;
            }

            html += `</div>`;
            
            this.$el.html(html);
        },

        _onTemplateClick: function(ev) {
            ev.preventDefault();
            var $target = $(ev.currentTarget);
            var templateId = $target.data('template-id');
            var templateName = $target.data('template-name');
            
            console.log('Template selected:', templateId, templateName);
            
            // Redirect to complete standalone app
            window.location.href = '/?template=' + templateId + '&project=' + encodeURIComponent(templateName);
        },

        _onUploadClick: function(ev) {
            ev.preventDefault();
            this.$('input[type="file"]').click();
        },

        _onFileChange: function(ev) {
            var files = ev.target.files;
            if (files.length > 0) {
                this._uploadFiles(files);
            }
        },

        _uploadFiles: function(files) {
            console.log('Uploading files:', files.length);
            // For now, just log the files
            // TODO: Implement actual upload functionality
            for (var i = 0; i < files.length; i++) {
                console.log('File:', files[i].name, files[i].type);
            }
        }
    });

    publicWidget.registry.ArtworkUploaderWebsite = ArtworkUploaderWebsite;
    
    return {
        ArtworkUploaderWebsite: ArtworkUploaderWebsite
    };
});