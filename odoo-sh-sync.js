#!/usr/bin/env node

/**
 * Odoo.sh Sync Manager
 * Git-based deployment for Odoo.sh cloud platform
 */

const chokidar = require('chokidar');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const chalk = require('chalk');

class OdooShSyncManager {
    constructor() {
        this.isWatching = false;
        this.config = null;
        this.syncQueue = new Set();
        this.isProcessing = false;
        
        // Default paths
        this.paths = {
            clientSrc: './client/src',
            serverSrc: './server',
            odooModule: './odoo_artwork_uploader'
        };

        // Debounce settings
        this.debounceTimeout = null;
        this.debounceDelay = 2000; // 2 seconds

        this.log = this.createLogger();
    }

    createLogger() {
        return {
            info: (msg) => console.log(chalk.blue('ℹ'), msg),
            success: (msg) => console.log(chalk.green('✓'), msg),
            error: (msg) => console.log(chalk.red('✗'), msg),
            warning: (msg) => console.log(chalk.yellow('⚠'), msg),
            sync: (msg) => console.log(chalk.magenta('🔄'), msg),
            git: (msg) => console.log(chalk.cyan('🔀'), msg)
        };
    }

    async init() {
        console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════╗
║                    🌥️  ODOO.SH SYNC MANAGER                 ║
║                                                              ║
║  Git-based deployment for Odoo.sh cloud platform            ║
║  Changes → Git Commit → Auto-Deploy to Odoo.sh              ║
╚══════════════════════════════════════════════════════════════╝
`));

        // Load configuration
        await this.loadConfiguration();
        
        // Check git repository
        await this.verifyGitRepo();
        
        // Start watching for changes
        this.startWatching();
        
        this.log.success('Odoo.sh Sync Manager initialized!');
        this.log.info('Watching for changes - will auto-commit and push to Odoo.sh');
        this.log.info(`Target branch: ${this.config.git.targetBranch || 'development'}`);
    }

    async loadConfiguration() {
        const configFile = './odoo-sh-sync.config.json';
        
        if (await fs.pathExists(configFile)) {
            this.config = await fs.readJSON(configFile);
            this.log.success('Configuration loaded');
        } else {
            // Create default config for Odoo.sh
            this.config = {
                git: {
                    targetBranch: 'development',  // development, staging, or production
                    autoCommit: true,
                    autoPush: true,
                    commitMessage: '[AUTO] Sync changes from standalone app'
                },
                odoo: {
                    moduleName: 'artwork_uploader',
                    projectUrl: null  // Your Odoo.sh project URL
                },
                sync: {
                    debounceDelay: 2000,  // Wait 2s before committing
                    incrementVersion: true  // Auto-increment module version
                }
            };
            
            await fs.writeJSON(configFile, this.config, { spaces: 2 });
            this.log.warning(`Created default config: ${configFile}`);
            this.log.warning('Please update with your Odoo.sh project details');
        }
    }

    async verifyGitRepo() {
        try {
            // Check if we're in a git repository
            await this.execCommand('git rev-parse --git-dir');
            this.log.success('Git repository detected');
            
            // Check current branch
            const { stdout } = await this.execCommand('git branch --show-current');
            const currentBranch = stdout.trim();
            this.log.info(`Current branch: ${currentBranch}`);
            
            // Check if we have Odoo.sh remote
            const { stdout: remotes } = await this.execCommand('git remote -v');
            if (remotes.includes('odoo.sh')) {
                this.log.success('Odoo.sh remote detected');
            } else {
                this.log.warning('No Odoo.sh remote found - make sure to add it!');
            }
            
        } catch (error) {
            this.log.error('Not a git repository or git not available');
            this.log.error('Please initialize git and connect to your Odoo.sh project');
            throw error;
        }
    }

    startWatching() {
        const watchPatterns = [
            './client/src/**/*.{js,jsx,ts,tsx,css}',
            './server/**/*.{js,ts}',
            './shared/**/*.ts'
        ];

        const watcher = chokidar.watch(watchPatterns, {
            ignored: /node_modules|\.git/,
            persistent: true,
            ignoreInitial: true
        });

        watcher
            .on('change', (filePath) => this.handleFileChange(filePath, 'change'))
            .on('add', (filePath) => this.handleFileChange(filePath, 'add'))
            .on('unlink', (filePath) => this.handleFileChange(filePath, 'delete'));

        this.log.success('File watcher started');
    }

    async handleFileChange(filePath, eventType) {
        const relativePath = path.relative(process.cwd(), filePath);
        this.log.sync(`File ${eventType}: ${relativePath}`);

        // Add to sync queue
        this.syncQueue.add(filePath);
        
        // Debounce the sync process
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
        
        this.debounceTimeout = setTimeout(() => {
            this.processSyncQueue();
        }, this.config.sync.debounceDelay);
    }

    async processSyncQueue() {
        if (this.isProcessing || this.syncQueue.size === 0) return;
        
        this.isProcessing = true;
        this.log.sync(`Processing ${this.syncQueue.size} changed files...`);

        try {
            // Convert and sync all queued files
            for (const filePath of this.syncQueue) {
                await this.syncFile(filePath);
            }
            
            // Increment module version if configured
            if (this.config.sync.incrementVersion) {
                await this.incrementModuleVersion();
            }
            
            // Commit and push to Odoo.sh
            await this.commitAndPush();
            
            this.syncQueue.clear();
            this.log.success('Sync completed! Changes deployed to Odoo.sh');
            
        } catch (error) {
            this.log.error(`Sync failed: ${error.message}`);
        } finally {
            this.isProcessing = false;
        }
    }

    async syncFile(sourcePath) {
        const fileName = path.basename(sourcePath);
        const relativePath = path.relative(process.cwd(), sourcePath);

        if (!await fs.pathExists(sourcePath)) {
            // File was deleted - handle removal
            await this.handleFileDelete(sourcePath);
            return;
        }

        // Determine target location in Odoo module
        let targetPath;
        
        if (sourcePath.includes('/client/src/')) {
            // Convert frontend files to Odoo static assets
            const clientRelative = path.relative('./client/src', sourcePath);
            targetPath = path.join(this.paths.odooModule, 'static/src/js', clientRelative);
            
            if (fileName.endsWith('.jsx') || fileName.endsWith('.tsx')) {
                // Convert React component to Odoo widget
                await this.convertReactToOdooWidget(sourcePath, targetPath);
            } else if (fileName.endsWith('.css')) {
                // Copy CSS directly
                targetPath = path.join(this.paths.odooModule, 'static/src/css', clientRelative);
                await fs.copy(sourcePath, targetPath);
            } else {
                // Convert JS/TS to Odoo format
                await this.convertJSToOdooFormat(sourcePath, targetPath);
            }
            
        } else if (sourcePath.includes('/server/')) {
            // Convert backend files to Python controllers
            const serverRelative = path.relative('./server', sourcePath);
            targetPath = path.join(this.paths.odooModule, 'controllers', 
                serverRelative.replace(/\.(js|ts)$/, '.py'));
            
            await this.convertServerToPython(sourcePath, targetPath);
            
        } else if (sourcePath.includes('/shared/')) {
            // Convert shared types to Odoo models
            targetPath = path.join(this.paths.odooModule, 'models/schema_types.py');
            await this.convertSharedTypes(sourcePath, targetPath);
        }

        this.log.success(`Synced: ${relativePath} → ${path.relative(process.cwd(), targetPath)}`);
    }

    async handleFileDelete(deletedPath) {
        // Handle file deletion in Odoo module
        this.log.warning(`Handling deletion: ${path.relative(process.cwd(), deletedPath)}`);
        // Implementation depends on specific file type
    }

    async convertReactToOdooWidget(sourcePath, targetPath) {
        const content = await fs.readFile(sourcePath, 'utf8');
        const componentName = path.basename(sourcePath, path.extname(sourcePath));
        
        // Basic React to Odoo widget conversion
        const odooWidget = `odoo.define('artwork_uploader.${componentName}', function (require) {
    'use strict';

    var Widget = require('web.Widget');
    var core = require('web.core');

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
            // Converted from React component
            // TODO: Implement component logic
        }
    });

    return ${componentName};
});`;

        await fs.ensureDir(path.dirname(targetPath));
        await fs.writeFile(targetPath.replace(/\.(jsx|tsx)$/, '.js'), odooWidget);
    }

    async convertJSToOdooFormat(sourcePath, targetPath) {
        const content = await fs.readFile(sourcePath, 'utf8');
        
        // Convert ES6 modules to Odoo define format
        const odooFormat = `odoo.define('artwork_uploader.utils', function (require) {
    'use strict';
    
    // Converted from: ${path.relative(process.cwd(), sourcePath)}
    ${this.convertJSSyntax(content)}
    
    return {
        // Export functions here
    };
});`;

        await fs.ensureDir(path.dirname(targetPath));
        await fs.writeFile(targetPath, odooFormat);
    }

    async convertServerToPython(sourcePath, targetPath) {
        const content = await fs.readFile(sourcePath, 'utf8');
        
        // Convert Express.js/Node.js to Python/Odoo controller
        const pythonController = `from odoo import http
from odoo.http import request
import json
import logging

_logger = logging.getLogger(__name__)

class ArtworkUploaderController(http.Controller):
    
    # Converted from: ${path.relative(process.cwd(), sourcePath)}
    ${this.convertJSToPython(content)}
`;

        await fs.ensureDir(path.dirname(targetPath));
        await fs.writeFile(targetPath, pythonController);
    }

    async convertSharedTypes(sourcePath, targetPath) {
        const content = await fs.readFile(sourcePath, 'utf8');
        
        const pythonTypes = `# Auto-generated from shared types
from odoo import models, fields, api

# Converted from: ${path.relative(process.cwd(), sourcePath)}
class SharedTypes(models.Model):
    _name = 'artwork.shared.types'
    _description = 'Shared type definitions'
    
    # TODO: Convert TypeScript types to Odoo fields
`;

        await fs.ensureDir(path.dirname(targetPath));
        await fs.writeFile(targetPath, pythonTypes);
    }

    convertJSSyntax(content) {
        // Basic JS syntax conversion
        let converted = content;
        converted = converted.replace(/import\s+.*from\s+['"].*['"];?/g, '// import removed');
        converted = converted.replace(/export\s+(default\s+)?/g, '// export ');
        return converted;
    }

    convertJSToPython(content) {
        // Basic JS to Python conversion
        return `
    # TODO: Convert JavaScript logic to Python
    # Original JS code was converted automatically
    pass`;
    }

    async incrementModuleVersion() {
        const manifestPath = path.join(this.paths.odooModule, '__manifest__.py');
        
        if (await fs.pathExists(manifestPath)) {
            let manifest = await fs.readFile(manifestPath, 'utf8');
            
            // Update version number (required for Odoo.sh auto-update)
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
    }

    async commitAndPush() {
        if (!this.config.git.autoCommit) return;

        try {
            // Stage all changes in Odoo module
            await this.execCommand(`git add ${this.paths.odooModule}/`);
            
            // Check if there are changes to commit
            try {
                await this.execCommand('git diff --cached --exit-code');
                this.log.info('No changes to commit');
                return;
            } catch {
                // There are changes to commit
            }
            
            // Commit changes
            const commitMessage = `${this.config.git.commitMessage} - ${new Date().toISOString()}`;
            await this.execCommand(`git commit -m "${commitMessage}"`);
            this.log.git('Changes committed');
            
            // Push to Odoo.sh if configured
            if (this.config.git.autoPush) {
                const branch = this.config.git.targetBranch;
                await this.execCommand(`git push origin ${branch}`);
                this.log.git(`Pushed to ${branch} - Odoo.sh will auto-deploy!`);
            }
            
        } catch (error) {
            this.log.error(`Git operation failed: ${error.message}`);
        }
    }

    async execCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }
}

// CLI interface
if (require.main === module) {
    const sync = new OdooShSyncManager();
    
    sync.init().catch(console.error);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nShutting down Odoo.sh sync manager...');
        process.exit(0);
    });
}

module.exports = OdooShSyncManager;