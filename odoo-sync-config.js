#!/usr/bin/env node

/**
 * Odoo Sync Configuration Manager
 * Detects and configures Odoo module paths
 */

const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const chalk = require('chalk');

class OdooConfigManager {
    constructor() {
        this.configFile = './odoo-sync.config.json';
        this.defaultConfig = {
            // Odoo installation detection
            odoo: {
                installPath: null,        // Auto-detected or manual
                addonsPath: null,         // Where custom modules go
                moduleName: 'artwork_uploader',
                configFile: null,         // odoo.conf path
                database: null,           // Database name
                dockerContainer: null,    // Docker container name if using Docker
                remoteHost: null,         // SSH host if remote
                remoteUser: null          // SSH user if remote
            },
            
            // Source paths (this project)
            source: {
                clientSrc: './client/src',
                serverSrc: './server',
                sharedSrc: './shared'
            },
            
            // Sync options
            sync: {
                autoRestart: true,        // Auto-restart Odoo when needed
                method: 'local',          // local, docker, ssh
                watchMode: 'realtime',    // realtime, manual, scheduled
                backupBeforeSync: true    // Backup before overwriting
            }
        };
    }

    async init() {
        console.log(chalk.cyan(`
╔══════════════════════════════════════╗
║        Odoo Sync Configuration       ║
║      Let's find your Odoo module!    ║
╚══════════════════════════════════════╝
`));

        // Load existing config or create new one
        const config = await this.loadOrCreateConfig();
        
        // Auto-detect Odoo installation
        const detectedPaths = await this.detectOdooInstallation();
        
        if (detectedPaths.length > 0) {
            console.log(chalk.green('✓ Found potential Odoo installations:'));
            detectedPaths.forEach((path, index) => {
                console.log(`  ${index + 1}. ${path.type}: ${chalk.yellow(path.path)}`);
            });
        }

        // Interactive configuration
        await this.configureInteractively(config, detectedPaths);
        
        // Save configuration
        await this.saveConfig(config);
        
        console.log(chalk.green('\n✓ Configuration saved! You can now run the sync.'));
    }

    async loadOrCreateConfig() {
        if (await fs.pathExists(this.configFile)) {
            console.log(chalk.blue('ℹ Found existing configuration, loading...'));
            return await fs.readJSON(this.configFile);
        } else {
            console.log(chalk.blue('ℹ Creating new configuration...'));
            return { ...this.defaultConfig };
        }
    }

    async detectOdooInstallation() {
        const detectedPaths = [];
        
        // Common Odoo installation paths
        const commonPaths = [
            '/opt/odoo',
            '/usr/lib/python3/dist-packages/odoo',
            './odoo',
            '../odoo',
            '/home/odoo',
            process.env.ODOO_HOME
        ].filter(Boolean);

        // Check each path
        for (const basePath of commonPaths) {
            try {
                if (await fs.pathExists(basePath)) {
                    // Look for addons directories
                    const addonsPath = path.join(basePath, 'addons');
                    const customAddonsPath = path.join(basePath, 'custom-addons');
                    
                    if (await fs.pathExists(addonsPath)) {
                        detectedPaths.push({
                            type: 'Standard Installation',
                            path: basePath,
                            addonsPath: addonsPath
                        });
                    }
                    
                    if (await fs.pathExists(customAddonsPath)) {
                        detectedPaths.push({
                            type: 'Custom Addons',
                            path: basePath,
                            addonsPath: customAddonsPath
                        });
                    }
                }
            } catch (error) {
                // Skip paths we can't access
            }
        }

        // Check for Docker containers
        try {
            const dockerContainers = await this.findDockerContainers();
            detectedPaths.push(...dockerContainers);
        } catch (error) {
            // Docker not available
        }

        // Check current directory for local Odoo module
        if (await fs.pathExists('./odoo_artwork_uploader')) {
            detectedPaths.push({
                type: 'Local Development Module',
                path: process.cwd(),
                addonsPath: './',
                modulePath: './odoo_artwork_uploader'
            });
        }

        return detectedPaths;
    }

    async findDockerContainers() {
        return new Promise((resolve) => {
            exec('docker ps --format "table {{.Names}}\\t{{.Image}}" | grep -i odoo', (error, stdout) => {
                if (error) {
                    resolve([]);
                    return;
                }

                const containers = stdout.split('\n')
                    .filter(line => line.trim())
                    .slice(1) // Skip header
                    .map(line => {
                        const [name, image] = line.split('\t');
                        return {
                            type: 'Docker Container',
                            path: `docker:${name}`,
                            containerName: name,
                            image: image
                        };
                    });

                resolve(containers);
            });
        });
    }

    async configureInteractively(config, detectedPaths) {
        console.log(chalk.yellow('\n⚠ Interactive configuration coming...'));
        console.log('For now, let me set up the most common scenarios:\n');

        // Scenario 1: Local development (current setup)
        if (detectedPaths.find(p => p.type === 'Local Development Module')) {
            console.log(chalk.green('✓ Detected: Local development setup'));
            config.odoo.installPath = process.cwd();
            config.odoo.addonsPath = './';
            config.sync.method = 'local';
            return;
        }

        // Scenario 2: Standard Odoo installation
        const standardInstall = detectedPaths.find(p => p.type === 'Standard Installation');
        if (standardInstall) {
            console.log(chalk.green(`✓ Using: ${standardInstall.path}`));
            config.odoo.installPath = standardInstall.path;
            config.odoo.addonsPath = standardInstall.addonsPath;
            config.sync.method = 'local';
            return;
        }

        // Scenario 3: Docker container
        const dockerContainer = detectedPaths.find(p => p.type === 'Docker Container');
        if (dockerContainer) {
            console.log(chalk.green(`✓ Using Docker: ${dockerContainer.containerName}`));
            config.odoo.dockerContainer = dockerContainer.containerName;
            config.sync.method = 'docker';
            return;
        }

        // Manual configuration needed
        console.log(chalk.yellow('⚠ No Odoo installation detected automatically.'));
        console.log('Please edit odoo-sync.config.json manually with your paths.');
    }

    async saveConfig(config) {
        await fs.writeJSON(this.configFile, config, { spaces: 2 });
        console.log(chalk.green(`✓ Configuration saved to: ${this.configFile}`));
    }

    static async getConfig() {
        const configFile = './odoo-sync.config.json';
        if (await fs.pathExists(configFile)) {
            return await fs.readJSON(configFile);
        }
        throw new Error('Configuration not found. Run: node odoo-sync-config.js');
    }
}

// CLI interface
if (require.main === module) {
    const config = new OdooConfigManager();
    config.init().catch(console.error);
}

module.exports = OdooConfigManager;