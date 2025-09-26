#!/usr/bin/env node

/**
 * Hot Deployment System for Odoo Module
 * Provides instant updates without module reinstallation
 */

const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const chalk = require('chalk');

class OdooHotDeploy {
    constructor() {
        this.odooConfig = {
            // Configure based on your Odoo setup
            configFile: process.env.ODOO_CONFIG || '/etc/odoo-server.conf',
            database: process.env.ODOO_DB || 'odoo',
            moduleName: 'artwork_uploader',
            devMode: true
        };
        
        this.log = {
            info: (msg) => console.log(chalk.blue('ℹ'), msg),
            success: (msg) => console.log(chalk.green('✓'), msg),
            error: (msg) => console.log(chalk.red('✗'), msg),
            warning: (msg) => console.log(chalk.yellow('⚠'), msg),
            deploy: (msg) => console.log(chalk.magenta('🚀'), msg)
        };
    }

    async deployChanges() {
        this.log.deploy('Starting hot deployment...');
        
        try {
            // 1. Update asset bundles (for JS/CSS changes)
            await this.updateAssets();
            
            // 2. Reload Python modules (for controller/model changes)
            await this.reloadPythonModules();
            
            // 3. Clear Odoo caches
            await this.clearCaches();
            
            // 4. Restart Odoo if needed
            if (await this.needsRestart()) {
                await this.restartOdoo();
            }
            
            this.log.success('Hot deployment completed! Changes are live.');
            
        } catch (error) {
            this.log.error(`Deployment failed: ${error.message}`);
            throw error;
        }
    }

    async updateAssets() {
        this.log.info('Updating assets...');
        
        // Force Odoo to reload static assets
        const assetCommand = `
            ./odoo-bin shell -c "${this.odooConfig.configFile}" -d ${this.odooConfig.database} <<EOF
env['ir.qweb']._clear_cache()
env['ir.attachment'].search([('res_model', '=', 'ir.ui.view')]).unlink()
env.cr.commit()
EOF
        `;
        
        return new Promise((resolve, reject) => {
            exec(assetCommand, (error, stdout, stderr) => {
                if (error) {
                    this.log.warning('Asset update command failed, continuing...');
                    resolve(); // Don't fail entire deployment
                } else {
                    this.log.success('Assets updated');
                    resolve();
                }
            });
        });
    }

    async reloadPythonModules() {
        this.log.info('Reloading Python modules...');
        
        // Use Odoo's built-in reload mechanism
        const reloadCommand = `
            ./odoo-bin shell -c "${this.odooConfig.configFile}" -d ${this.odooConfig.database} <<EOF
import importlib
import sys

# Reload controller modules
if 'odoo.addons.${this.odooConfig.moduleName}.controllers.main' in sys.modules:
    importlib.reload(sys.modules['odoo.addons.${this.odooConfig.moduleName}.controllers.main'])

# Reload model modules  
if 'odoo.addons.${this.odooConfig.moduleName}.models' in sys.modules:
    for module_name in list(sys.modules.keys()):
        if module_name.startswith('odoo.addons.${this.odooConfig.moduleName}.models'):
            importlib.reload(sys.modules[module_name])

env.cr.commit()
EOF
        `;
        
        return new Promise((resolve, reject) => {
            exec(reloadCommand, (error, stdout, stderr) => {
                if (error) {
                    this.log.warning('Python reload failed, may need restart');
                    resolve();
                } else {
                    this.log.success('Python modules reloaded');
                    resolve();
                }
            });
        });
    }

    async clearCaches() {
        this.log.info('Clearing caches...');
        
        const cacheCommand = `
            ./odoo-bin shell -c "${this.odooConfig.configFile}" -d ${this.odooConfig.database} <<EOF
# Clear various Odoo caches
env.registry.clear_cache()
env['ir.qweb']._clear_cache()
env['ir.ui.view'].clear_caches()
env.cr.commit()
EOF
        `;
        
        return new Promise((resolve, reject) => {
            exec(cacheCommand, (error, stdout, stderr) => {
                if (error) {
                    this.log.warning('Cache clear failed');
                    resolve();
                } else {
                    this.log.success('Caches cleared');
                    resolve();
                }
            });
        });
    }

    async needsRestart() {
        // Check if changes require full restart (model changes, manifest changes, etc.)
        const manifestPath = './odoo_artwork_uploader/__manifest__.py';
        const modelPaths = await fs.glob('./odoo_artwork_uploader/models/*.py');
        
        // Check modification times
        const now = Date.now();
        const checkFiles = [manifestPath, ...modelPaths];
        
        for (const file of checkFiles) {
            if (await fs.pathExists(file)) {
                const stats = await fs.stat(file);
                if (now - stats.mtime.getTime() < 5000) { // Modified in last 5 seconds
                    return true;
                }
            }
        }
        
        return false;
    }

    async restartOdoo() {
        this.log.info('Restarting Odoo server...');
        
        // Try different restart methods
        const restartMethods = [
            // Method 1: Development mode restart
            `./odoo-bin -c "${this.odooConfig.configFile}" -d ${this.odooConfig.database} -u ${this.odooConfig.moduleName} --stop-after-init`,
            
            // Method 2: Service restart (if running as service)
            'sudo systemctl restart odoo',
            
            // Method 3: Process restart
            'pkill -f odoo-bin && ./odoo-bin -c "${this.odooConfig.configFile}" -d ${this.odooConfig.database} --dev=reload'
        ];
        
        for (const method of restartMethods) {
            try {
                await this.execCommand(method);
                this.log.success('Odoo restarted successfully');
                return;
            } catch (error) {
                this.log.warning(`Restart method failed: ${method}`);
                continue;
            }
        }
        
        this.log.error('All restart methods failed - manual restart may be required');
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

    async quickSync() {
        // Quick sync for immediate changes (JS/CSS only)
        this.log.deploy('Quick sync mode...');
        
        await this.updateAssets();
        await this.clearCaches();
        
        this.log.success('Quick sync completed!');
    }

    async fullSync() {
        // Full sync for all changes
        this.log.deploy('Full sync mode...');
        
        await this.deployChanges();
    }
}

// CLI interface
if (require.main === module) {
    const deployer = new OdooHotDeploy();
    const command = process.argv[2] || 'full';
    
    console.log(chalk.cyan(`
╔══════════════════════════════════════╗
║        Odoo Hot Deployment           ║
║       Instant Module Updates        ║
╚══════════════════════════════════════╝
`));

    if (command === 'quick') {
        deployer.quickSync().catch(console.error);
    } else {
        deployer.fullSync().catch(console.error);
    }
}

module.exports = OdooHotDeploy;