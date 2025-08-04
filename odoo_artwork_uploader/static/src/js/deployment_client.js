/**
 * Hot Deployment Client for Artwork Uploader Module
 * Provides JavaScript interface for deploying updates without module reinstall
 */

class ArtworkDeploymentClient {
    constructor() {
        this.baseUrl = '/artwork/deploy';
        this.token = null;
    }

    async apiCall(endpoint, method = 'POST', data = null) {
        const url = `${this.baseUrl}${endpoint}`;
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || `HTTP ${response.status}`);
            }
            
            return result;
        } catch (error) {
            console.error(`Deployment API call failed: ${endpoint}`, error);
            throw error;
        }
    }

    async getStatus() {
        return await this.apiCall('/status', 'GET');
    }

    async reloadViews() {
        console.log('Reloading views...');
        const result = await this.apiCall('/reload-views');
        console.log('Views reloaded:', result);
        return result;
    }

    async reloadModels() {
        console.log('Reloading models...');
        const result = await this.apiCall('/reload-models');
        console.log('Models reloaded:', result);
        return result;
    }

    async updateFile(filePath, content, isBase64 = false) {
        console.log(`Updating file: ${filePath}`);
        const result = await this.apiCall('/update-file', 'POST', {
            file_path: filePath,
            content: content,
            is_base64: isBase64
        });
        console.log('File updated:', result);
        return result;
    }

    async runSql(sqlCommands) {
        console.log('Executing SQL commands...');
        const result = await this.apiCall('/run-sql', 'POST', {
            sql: sqlCommands
        });
        console.log('SQL executed:', result);
        return result;
    }

    async fullReload() {
        console.log('Performing full hot reload...');
        const result = await this.apiCall('/full-reload');
        console.log('Full reload completed:', result);
        return result;
    }

    async createBackup() {
        console.log('Creating module backup...');
        const result = await this.apiCall('/backup-module');
        console.log('Backup created:', result);
        return result;
    }

    // Convenience methods for common deployment scenarios
    async deployViewChanges(viewFiles) {
        try {
            // Update view files
            for (const [filePath, content] of Object.entries(viewFiles)) {
                await this.updateFile(filePath, content);
            }
            
            // Reload views
            await this.reloadViews();
            
            return { success: true, message: 'View changes deployed successfully' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async deployModelChanges(modelFiles, sqlCommands = []) {
        try {
            // Update model files
            for (const [filePath, content] of Object.entries(modelFiles)) {
                await this.updateFile(filePath, content);
            }
            
            // Run SQL if provided
            if (sqlCommands.length > 0) {
                await this.runSql(sqlCommands);
            }
            
            // Reload models
            await this.reloadModels();
            
            return { success: true, message: 'Model changes deployed successfully' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async deployControllerChanges(controllerFiles) {
        try {
            // Update controller files
            for (const [filePath, content] of Object.entries(controllerFiles)) {
                await this.updateFile(filePath, content);
            }
            
            // Full reload needed for controllers
            await this.fullReload();
            
            return { success: true, message: 'Controller changes deployed successfully' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Development helper methods
    async quickFix(filePath, content) {
        try {
            await this.createBackup();
            await this.updateFile(filePath, content);
            await this.fullReload();
            return { success: true, message: 'Quick fix deployed successfully' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async rollbackFile(filePath) {
        // This would restore from .backup file
        const backupPath = filePath + '.backup';
        try {
            const response = await fetch(`/web/content?model=ir.attachment&field=datas&filename=${backupPath}`);
            const content = await response.text();
            await this.updateFile(filePath, content);
            return { success: true, message: 'File rolled back successfully' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Global instance
window.ArtworkDeployment = new ArtworkDeploymentClient();

// Console helpers for development
if (typeof console !== 'undefined') {
    console.log('Artwork Deployment Client loaded. Use window.ArtworkDeployment for hot deployments.');
    
    // Add convenient console shortcuts
    window.deploy = {
        status: () => window.ArtworkDeployment.getStatus(),
        views: () => window.ArtworkDeployment.reloadViews(),
        models: () => window.ArtworkDeployment.reloadModels(),
        full: () => window.ArtworkDeployment.fullReload(),
        backup: () => window.ArtworkDeployment.createBackup(),
        file: (path, content) => window.ArtworkDeployment.updateFile(path, content),
        sql: (commands) => window.ArtworkDeployment.runSql(commands)
    };
    
    console.log('Console shortcuts available: deploy.status(), deploy.views(), deploy.models(), deploy.full(), etc.');
}