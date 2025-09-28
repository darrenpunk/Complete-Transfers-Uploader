#!/usr/bin/env node

/**
 * Quick setup for Odoo.sh sync
 */

const { exec } = require('child_process');
const fs = require('fs-extra');
const chalk = require('chalk');

async function setupOdooSh() {
    console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════╗
║                🌥️  ODOO.SH QUICK SETUP                     ║
║                                                              ║
║  Let's connect your standalone app to Odoo.sh!              ║
╚══════════════════════════════════════════════════════════════╝
`));

    console.log(chalk.yellow('📝 Please provide your Odoo.sh details:\n'));

    // Create the config with user-friendly prompts
    const config = {
        git: {
            targetBranch: 'development',  // Start with development
            autoCommit: true,
            autoPush: true,
            commitMessage: '[AUTO] Sync from standalone app'
        },
        odoo: {
            moduleName: 'artwork_uploader',
            projectUrl: 'https://YOUR-PROJECT.odoo.sh'  // User needs to update this
        },
        sync: {
            debounceDelay: 3000,  // 3 seconds for Odoo.sh
            incrementVersion: true
        }
    };

    await fs.writeJSON('./odoo-sh-sync.config.json', config, { spaces: 2 });

    console.log(chalk.green('✓ Configuration created: odoo-sh-sync.config.json'));
    console.log(chalk.yellow('\n📋 Next steps:'));
    console.log('1. Update odoo-sh-sync.config.json with your Odoo.sh project URL');
    console.log('2. Make sure your git remote points to Odoo.sh');
    console.log('3. Run: node odoo-sh-sync.js');
    console.log('\n' + chalk.cyan('🔗 Need help connecting to Odoo.sh?'));
    console.log('Visit: https://www.odoo.com/documentation/16.0/administration/odoo_sh/getting_started/branches.html');
}

setupOdooSh().catch(console.error);