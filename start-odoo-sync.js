#!/usr/bin/env node

/**
 * Simple command to start Odoo sync with instant updates
 */

const { spawn } = require('child_process');
const chalk = require('chalk');

console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════╗
║                    🚀 ODOO INSTANT SYNC                     ║
║                                                              ║
║  This will automatically sync changes from your             ║
║  standalone app to the Odoo module in real-time!            ║
║                                                              ║
║  Make changes in:                                            ║
║    • client/src/    → Auto-converts to Odoo widgets         ║
║    • server/        → Auto-converts to Python controllers   ║
║    • shared/        → Auto-updates Odoo models              ║
║                                                              ║
║  Press Ctrl+C to stop                                       ║
╚══════════════════════════════════════════════════════════════╝
`));

console.log(chalk.green('✓ Starting file watcher...'));

// Start the sync manager
const syncProcess = spawn('node', ['sync-to-odoo.js'], {
    stdio: 'inherit',
    cwd: process.cwd()
});

syncProcess.on('close', (code) => {
    if (code !== 0) {
        console.log(chalk.red(`Sync process exited with code ${code}`));
    } else {
        console.log(chalk.blue('Sync stopped'));
    }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log(chalk.yellow('\nStopping sync...'));
    syncProcess.kill('SIGINT');
    process.exit(0);
});