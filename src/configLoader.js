import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG_PATH = path.join(__dirname, '../config/config.json');

/**
 * Load and validate configuration from config.json
 */
export async function loadConfig() {
    try {
        const configData = await fs.readFile(CONFIG_PATH, 'utf-8');
        const config = JSON.parse(configData);

        // Validate required fields
        if (!config.zoom || !config.zoom.meetingLink || !config.zoom.displayName) {
            throw new Error('Missing required zoom configuration (meetingLink, displayName)');
        }

        if (!config.cloudStorage || !config.cloudStorage.provider) {
            throw new Error('Missing cloudStorage.provider configuration');
        }

        if (!['google-drive', 'onedrive', 'local'].includes(config.cloudStorage.provider)) {
            throw new Error('cloudStorage.provider must be either "google-drive", "onedrive", or "local"');
        }

        // Set defaults
        config.recording = config.recording || {};
        config.recording.outputDir = config.recording.outputDir || './recordings';
        config.recording.quality = config.recording.quality || 'high';

        config.ai = config.ai || {};
        config.ai.transcriptionModel = config.ai.transcriptionModel || 'whisper-1';
        config.ai.summaryModel = config.ai.summaryModel || 'gpt-4';

        console.log(chalk.green('✓ Configuration loaded successfully'));
        return config;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(chalk.red('✗ Configuration file not found at:'), CONFIG_PATH);
            console.error(chalk.yellow('Please copy config.json.example to config.json and fill in your details'));
        } else {
            console.error(chalk.red('✗ Error loading configuration:'), error.message);
        }
        throw error;
    }
}

