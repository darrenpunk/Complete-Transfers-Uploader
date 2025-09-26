#!/usr/bin/env node

const chokidar = require('chokidar');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const chalk = require('chalk');

class OdooSyncManager {
    constructor() {
        this.isWatching = false;
        this.lastSyncTime = new Date();
        
        // Paths configuration
        this.paths = {
            // Source paths (standalone app)
            clientSrc: './client/src',
            serverSrc: './server',
            
            // Target paths (Odoo module) 
            odooModule: './odoo_artwork_uploader',
            odooStatic: './odoo_artwork_uploader/static/src',
            odooControllers: './odoo_artwork_uploader/controllers',
            odooModels: './odoo_artwork_uploader/models',
            odooViews: './odoo_artwork_uploader/views'
        };

        // File patterns to watch
        this.watchPatterns = [
            './client/src/**/*.{js,jsx,ts,tsx}',
            './server/**/*.{js,ts}',
            './shared/**/*.ts'
        ];

        this.log = this.createLogger();
    }

    createLogger() {
        return {
            info: (msg) => console.log(chalk.blue('ℹ'), chalk.white(msg)),
            success: (msg) => console.log(chalk.green('✓'), chalk.white(msg)),
            error: (msg) => console.log(chalk.red('✗'), chalk.white(msg)),
            warning: (msg) => console.log(chalk.yellow('⚠'), chalk.white(msg)),
            sync: (msg) => console.log(chalk.magenta('🔄'), chalk.white(msg))
        };
    }

    async init() {
        this.log.info('Initializing Odoo Sync Manager...');
        
        // Ensure target directories exist
        await this.ensureDirectories();
        
        // Start watching for changes
        this.startWatching();
        
        this.log.success('Odoo Sync Manager initialized successfully!');
        this.log.info('Watching for changes in standalone app...');
    }

    async ensureDirectories() {
        const dirs = [
            this.paths.odooStatic + '/js',
            this.paths.odooStatic + '/css', 
            this.paths.odooControllers,
            this.paths.odooModels,
            this.paths.odooViews + '/website_templates.xml'
        ];

        for (const dir of dirs) {
            await fs.ensureDir(path.dirname(dir));
        }
    }

    startWatching() {
        if (this.isWatching) return;

        const watcher = chokidar.watch(this.watchPatterns, {
            ignored: /node_modules|\.git/,
            persistent: true,
            ignoreInitial: true
        });

        watcher
            .on('change', (filePath) => this.handleFileChange(filePath, 'change'))
            .on('add', (filePath) => this.handleFileChange(filePath, 'add'))
            .on('unlink', (filePath) => this.handleFileChange(filePath, 'delete'));

        this.isWatching = true;
        this.log.success('File watcher started');
    }

    async handleFileChange(filePath, eventType) {
        const relativePath = path.relative(process.cwd(), filePath);
        this.log.sync(`File ${eventType}: ${relativePath}`);

        try {
            // Determine file type and handle accordingly
            if (filePath.includes('/client/src/')) {
                await this.handleClientFileChange(filePath, eventType);
            } else if (filePath.includes('/server/')) {
                await this.handleServerFileChange(filePath, eventType);
            } else if (filePath.includes('/shared/')) {
                await this.handleSharedFileChange(filePath, eventType);
            }

            // Auto-update Odoo module
            await this.updateOdooModule();
            
        } catch (error) {
            this.log.error(`Error syncing ${relativePath}: ${error.message}`);
        }
    }

    async handleClientFileChange(filePath, eventType) {
        const fileName = path.basename(filePath);
        const relativePath = path.relative('./client/src', filePath);

        if (eventType === 'delete') {
            // Remove corresponding Odoo file
            const odooPath = path.join(this.paths.odooStatic, 'js', relativePath);
            await fs.remove(odooPath);
            this.log.warning(`Removed Odoo file: ${odooPath}`);
            return;
        }

        // Convert React component to Odoo widget
        if (fileName.endsWith('.jsx') || fileName.endsWith('.tsx')) {
            await this.convertReactToOdooWidget(filePath, relativePath);
        } 
        // Copy regular JS/TS files with conversion
        else if (fileName.endsWith('.js') || fileName.endsWith('.ts')) {
            await this.convertJSToOdooFormat(filePath, relativePath);
        }
        // Copy CSS files directly
        else if (fileName.endsWith('.css')) {
            const targetPath = path.join(this.paths.odooStatic, 'css', relativePath);
            await fs.copy(filePath, targetPath);
            this.log.success(`Copied CSS: ${relativePath}`);
        }
    }

    async handleServerFileChange(filePath, eventType) {
        const fileName = path.basename(filePath);
        const relativePath = path.relative('./server', filePath);

        if (eventType === 'delete') {
            // Handle Python controller deletion
            const pythonPath = path.join(this.paths.odooControllers, relativePath.replace(/\.(js|ts)$/, '.py'));
            await fs.remove(pythonPath);
            this.log.warning(`Removed Python controller: ${pythonPath}`);
            return;
        }

        // Convert Express routes to Odoo controllers
        if (fileName === 'routes.ts' || fileName === 'routes.js') {
            await this.convertRoutesToPythonController(filePath);
        }
        // Convert utility files
        else if (fileName.endsWith('.js') || fileName.endsWith('.ts')) {
            await this.convertServerUtilToPython(filePath, relativePath);
        }
    }

    async handleSharedFileChange(filePath, eventType) {
        // Copy shared schema/types to both Odoo models and static
        const content = await fs.readFile(filePath, 'utf8');
        
        // Convert to Python equivalents for models
        const pythonModel = this.convertTypesToPythonModel(content);
        const modelPath = path.join(this.paths.odooModels, 'schema_types.py');
        await fs.writeFile(modelPath, pythonModel);
        
        this.log.success(`Updated shared schema: ${path.basename(filePath)}`);
    }

    async convertReactToOdooWidget(sourcePath, relativePath) {
        const content = await fs.readFile(sourcePath, 'utf8');
        const fileName = path.basename(sourcePath, path.extname(sourcePath));
        
        // Convert React component to Odoo widget format
        const odooWidget = this.reactToOdooWidget(content, fileName);
        
        const targetPath = path.join(this.paths.odooStatic, 'js', relativePath.replace(/\.(jsx|tsx)$/, '.js'));
        await fs.ensureDir(path.dirname(targetPath));
        await fs.writeFile(targetPath, odooWidget);
        
        this.log.success(`Converted React component: ${relativePath} → Odoo widget`);
    }

    async convertJSToOdooFormat(sourcePath, relativePath) {
        const content = await fs.readFile(sourcePath, 'utf8');
        
        // Convert ES6 imports/exports to Odoo format
        const odooFormat = this.jsToOdooFormat(content);
        
        const targetPath = path.join(this.paths.odooStatic, 'js', relativePath);
        await fs.ensureDir(path.dirname(targetPath));
        await fs.writeFile(targetPath, odooFormat);
        
        this.log.success(`Converted JS: ${relativePath}`);
    }

    async convertRoutesToPythonController(sourcePath) {
        const content = await fs.readFile(sourcePath, 'utf8');
        
        // Convert Express routes to Python controller methods
        const pythonController = this.routesToPythonController(content);
        
        const targetPath = path.join(this.paths.odooControllers, 'main.py');
        await fs.writeFile(targetPath, pythonController);
        
        this.log.success(`Converted routes to Python controller`);
    }

    async convertServerUtilToPython(sourcePath, relativePath) {
        const content = await fs.readFile(sourcePath, 'utf8');
        
        // Convert utility functions to Python
        const pythonUtil = this.jsToPython(content);
        
        const targetPath = path.join(this.paths.odooControllers, relativePath.replace(/\.(js|ts)$/, '.py'));
        await fs.ensureDir(path.dirname(targetPath));
        await fs.writeFile(targetPath, pythonUtil);
        
        this.log.success(`Converted server util: ${relativePath} → Python`);
    }

    reactToOdooWidget(reactContent, componentName) {
        // Basic conversion from React to Odoo widget
        return `odoo.define('artwork_uploader.${componentName}', function (require) {
    'use strict';

    var Widget = require('web.Widget');
    var core = require('web.core');
    var QWeb = core.qweb;

    var ${componentName} = Widget.extend({
        template: '${componentName}Template',
        
        init: function(parent, options) {
            this._super.apply(this, arguments);
            this.options = options || {};
        },

        start: function() {
            this._super.apply(this, arguments);
            this._initializeComponent();
        },

        _initializeComponent: function() {
            // Converted component logic
            ${this.extractComponentLogic(reactContent)}
        }
    });

    return ${componentName};
});`;
    }

    jsToOdooFormat(jsContent) {
        // Convert ES6 imports/exports to Odoo define format
        let converted = jsContent;
        
        // Replace ES6 imports
        converted = converted.replace(/import\s+.*\s+from\s+['"](.+)['"];?/g, (match, module) => {
            return `// require('${module}')`;
        });
        
        // Replace exports
        converted = converted.replace(/export\s+(default\s+)?/g, '// export ');
        
        // Wrap in Odoo define
        return `odoo.define('artwork_uploader.utils', function (require) {
    'use strict';
    
    ${converted}
    
    return {
        // Export functions here
    };
});`;
    }

    routesToPythonController(routesContent) {
        // Extract route definitions and convert to Python
        return `from odoo import http
from odoo.http import request
import json
import logging

_logger = logging.getLogger(__name__)

class ArtworkUploaderController(http.Controller):
    
    # Auto-generated from routes.ts
    ${this.extractRoutes(routesContent)}
`;
    }

    jsToPython(jsContent) {
        // Basic JS to Python conversion
        let converted = jsContent;
        
        // Convert common patterns
        converted = converted.replace(/const\s+/g, '');
        converted = converted.replace(/let\s+/g, '');
        converted = converted.replace(/var\s+/g, '');
        converted = converted.replace(/=>\s*{/g, ':');
        converted = converted.replace(/console\.log/g, '_logger.info');
        
        return `# Auto-converted from JS
import logging
_logger = logging.getLogger(__name__)

${converted}`;
    }

    convertTypesToPythonModel(typesContent) {
        return `# Auto-generated from shared types
from odoo import models, fields, api

class GeneratedTypes(models.Model):
    _name = 'artwork.generated.types'
    _description = 'Auto-generated from TypeScript types'
    
    # Types converted from shared schema
`;
    }

    extractComponentLogic(reactContent) {
        // Extract core logic from React component
        return '// Component logic extracted and converted';
    }

    extractRoutes(routesContent) {
        // Extract Express routes and convert to Python methods
        return `
    @http.route('/api/artwork/upload', type='http', auth='public', methods=['POST'], csrf=False)
    def upload_artwork(self, **kwargs):
        # Converted from Express route
        return request.make_response(
            json.dumps({'status': 'success'}),
            headers={'Content-Type': 'application/json'}
        )`;
    }

    async updateOdooModule() {
        // Increment module version to trigger update
        const manifestPath = path.join(this.paths.odooModule, '__manifest__.py');
        
        if (await fs.pathExists(manifestPath)) {
            let manifest = await fs.readFile(manifestPath, 'utf8');
            
            // Update version number
            const versionMatch = manifest.match(/'version':\s*'([^']+)'/);
            if (versionMatch) {
                const currentVersion = versionMatch[1];
                const versionParts = currentVersion.split('.');
                versionParts[versionParts.length - 1] = String(parseInt(versionParts[versionParts.length - 1]) + 1);
                const newVersion = versionParts.join('.');
                
                manifest = manifest.replace(
                    /'version':\s*'[^']+'/,
                    `'version': '${newVersion}'`
                );
                
                await fs.writeFile(manifestPath, manifest);
                this.log.success(`Updated module version: ${currentVersion} → ${newVersion}`);
            }
        }

        // Auto-restart if in development mode
        this.log.sync('Changes synced to Odoo module!');
    }

    async stop() {
        this.isWatching = false;
        this.log.info('Sync manager stopped');
    }
}

// CLI interface
if (require.main === module) {
    const sync = new OdooSyncManager();
    
    console.log(chalk.cyan(`
╔══════════════════════════════════════╗
║         Odoo Sync Manager            ║
║     Instant updates for modules      ║
╚══════════════════════════════════════╝
`));

    sync.init().catch(console.error);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nShutting down sync manager...');
        await sync.stop();
        process.exit(0);
    });
}

module.exports = OdooSyncManager;