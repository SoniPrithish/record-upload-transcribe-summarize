import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let ffmpegProcess = null;
let recordingPath = null;

/**
 * Start screen recording using ffmpeg with macOS avfoundation
 */
export async function startScreenRecording(outputDir, quality = 'high') {
    try {
        // Ensure output directory exists
        await fs.mkdir(outputDir, { recursive: true });

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        recordingPath = path.join(outputDir, `zoom-recording-${timestamp}.mp4`);

        // Determine video quality settings
        const qualitySettings = {
            high: { resolution: '1920x1080', bitrate: '5000k', framerate: 30 },
            medium: { resolution: '1280x720', bitrate: '2500k', framerate: 30 },
            low: { resolution: '854x480', bitrate: '1000k', framerate: 24 }
        };

        const settings = qualitySettings[quality] || qualitySettings.high;

        console.log(chalk.blue(`Starting screen recording: ${recordingPath}`));
        console.log(chalk.blue(`Quality: ${quality} (${settings.resolution} @ ${settings.framerate}fps)`));

        // Use avfoundation on macOS to capture screen + audio
        // Note: To capture system audio, you need to install BlackHole or similar virtual audio device
        // and set it as your audio output, or use a multi-output device
        // For now, we capture screen video only. Audio capture requires additional setup.
        // To add audio: change '-i', '1:0' where 1 is the audio device index
        const ffmpegArgs = [
            '-f', 'avfoundation',
            '-framerate', settings.framerate.toString(),
            '-video_size', settings.resolution,
            '-i', '1:0',  // 1 = screen capture device, 0 = audio device (requires setup)
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',  // Audio codec
            '-b:a', '128k', // Audio bitrate
            '-movflags', '+faststart',
            recordingPath
        ];

        ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

        ffmpegProcess.stdout.on('data', (data) => {
            // FFmpeg outputs to stderr, not stdout
        });

        ffmpegProcess.stderr.on('data', (data) => {
            const output = data.toString();
            // Filter out verbose output, only show important messages
            if (output.includes('frame=') || output.includes('error') || output.includes('Error')) {
                process.stdout.write(output);
            }
        });

        ffmpegProcess.on('error', (error) => {
            if (error.code === 'ENOENT') {
                console.error(chalk.red('✗ FFmpeg not found. Please install FFmpeg:'));
                console.error(chalk.yellow('  brew install ffmpeg'));
            } else {
                console.error(chalk.red('✗ FFmpeg error:'), error.message);
            }
        });

        // Wait a moment to ensure recording started
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log(chalk.green('✓ Screen recording started'));
        return recordingPath;
    } catch (error) {
        console.error(chalk.red('✗ Error starting screen recording:'), error.message);
        throw error;
    }
}

/**
 * Stop screen recording
 */
export async function stopScreenRecording() {
    return new Promise((resolve, reject) => {
        if (!ffmpegProcess) {
            console.log(chalk.yellow('⚠ No active recording to stop'));
            resolve(null);
            return;
        }

        console.log(chalk.blue('Stopping screen recording...'));

        // Send 'q' to ffmpeg to quit gracefully
        ffmpegProcess.stdin.write('q');
        ffmpegProcess.stdin.end();

        ffmpegProcess.on('close', async (code) => {
            if (code === 0 || code === null) {
                console.log(chalk.green(`✓ Screen recording stopped. Saved to: ${recordingPath}`));

                // Verify file exists
                try {
                    const stats = await fs.stat(recordingPath);
                    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                    console.log(chalk.green(`✓ Recording file size: ${fileSizeMB} MB`));
                    resolve(recordingPath);
                } catch (error) {
                    console.error(chalk.red('✗ Recording file not found'));
                    reject(error);
                }
            } else {
                console.error(chalk.red(`✗ FFmpeg exited with code ${code}`));
                reject(new Error(`FFmpeg exited with code ${code}`));
            }
            ffmpegProcess = null;
        });
    });
}

/**
 * Check if Zoom process is running (alternative method to detect meeting end)
 */
export async function isZoomRunning() {
    return new Promise((resolve) => {
        const ps = spawn('ps', ['aux']);
        let output = '';

        ps.stdout.on('data', (data) => {
            output += data.toString();
        });

        ps.on('close', () => {
            const isRunning = output.includes('zoom') || output.includes('Zoom');
            resolve(isRunning);
        });

        ps.on('error', () => {
            resolve(true); // Assume running if we can't check
        });
    });
}

/**
 * Get the current recording path
 */
export function getRecordingPath() {
    return recordingPath;
}

