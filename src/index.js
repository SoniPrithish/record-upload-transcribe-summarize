import { loadConfig } from './configLoader.js';
import { joinZoomMeeting, monitorMeeting, quitZoom } from './zoomJoiner.js';
import { startScreenRecording, stopScreenRecording, getRecordingPath } from './screenRecorder.js';
import { uploadToCloud } from './cloudUpload.js';
import { transcribeVideo } from './transcription.js';
import { generateSummary } from './summary.js';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import cron from 'node-cron';

dotenv.config();

/**
 * Core recording session logic
 */
async function runRecordingSession(config) {
    let recordingPath = null;
    let transcriptPath = null;
    let summaryPath = null;

    try {
        // Ensure output directories exist
        const outputDir = config.recording.outputDir;
        const transcriptsDir = path.join(outputDir, '../transcripts');
        await fs.mkdir(outputDir, { recursive: true });
        await fs.mkdir(transcriptsDir, { recursive: true });

        // Step 1: Join Zoom meeting
        console.log(chalk.cyan('\n[Step 1/5] Joining Zoom meeting...\n'));
        // We no longer get a browser instance as we use the Desktop App
        const { meetingId } = await joinZoomMeeting(config);

        // Step 2: Start screen recording
        console.log(chalk.cyan('\n[Step 2/5] Starting screen recording...\n'));
        recordingPath = await startScreenRecording(outputDir, config.recording.quality);

        // Step 3: Monitor meeting until it ends
        console.log(chalk.cyan('\n[Step 3/5] Monitoring meeting...\n'));
        console.log(chalk.yellow('⚠ Meeting is being recorded. Press Ctrl+C to stop manually.\n'));

        // Monitor the desktop app window
        const meetingStatus = await monitorMeeting(null);
        console.log(chalk.blue(`\nMeeting status: ${meetingStatus}`));

        // Step 4: Stop recording
        console.log(chalk.cyan('\n[Step 4/5] Stopping recording...\n'));
        // Add a small buffer to ensure we catch the end
        await new Promise(resolve => setTimeout(resolve, 2000));
        recordingPath = await stopScreenRecording();

        // Close Zoom application completely
        await quitZoom();

        // Step 5: Verify recording and prepare for processing
        console.log(chalk.cyan('\n[Step 5/5] Verifying recording...\n'));
        try {
            // We use uploadToCloud as a verification step for local files
            const uploadResult = await uploadToCloud(
                recordingPath,
                config.cloudStorage.provider,
                config.cloudStorage.folderName
            );
            console.log(chalk.green(`✓ Recording verified: ${uploadResult.webUrl}`));
        } catch (uploadError) {
            console.error(chalk.yellow('⚠ Recording verification failed, but continuing...'));
            console.error(chalk.yellow(`  Error: ${uploadError.message}`));
        }

        // Step 6: Transcribe video (Optional / Post-processing)
        console.log(chalk.cyan('\n[Post-Processing] Transcribing and summarizing...\n'));
        try {
            const transcriptResult = await transcribeVideo(
                recordingPath,
                transcriptsDir,
                config.ai.transcriptionModel
            );
            transcriptPath = transcriptResult.filePath;

            // Generate summary
            const summaryResult = await generateSummary(
                transcriptResult.transcript,
                transcriptsDir,
                config.ai.summaryModel
            );
            summaryPath = summaryResult.filePath;

            console.log(chalk.green('\n✓ Transcription and summary completed'));
        } catch (transcriptionError) {
            console.error(chalk.yellow('⚠ Transcription failed:'));
            console.error(chalk.yellow(`  Error: ${transcriptionError.message}`));
        }

        // Final report
        console.log(chalk.cyan.bold('\n╔══════════════════════════════════════════════════════════╗'));
        console.log(chalk.cyan.bold('║                    Session Complete                      ║'));
        console.log(chalk.cyan.bold('╚══════════════════════════════════════════════════════════╝\n'));

        console.log(chalk.green('Files generated:'));
        if (recordingPath) {
            console.log(chalk.white(`  📹 Recording: ${recordingPath}`));
        }
        if (transcriptPath) {
            console.log(chalk.white(`  📝 Transcript: ${transcriptPath}`));
        }
        if (summaryPath) {
            console.log(chalk.white(`  📄 Summary: ${summaryPath}`));
        }

    } catch (error) {
        console.error(chalk.red.bold('\n✗ Session error:'), error.message);
        console.error(error.stack);

        // Cleanup on error
        try {
            if (recordingPath) {
                const recording = getRecordingPath();
                if (recording) {
                    await stopScreenRecording().catch(() => { });
                }
            }
        } catch (cleanupError) {
            console.error(chalk.yellow('⚠ Cleanup error:'), cleanupError.message);
        }
    }
}

/**
 * Main orchestrator function
 */
async function main() {
    console.log(chalk.cyan.bold('\n╔══════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║        Zoom Meeting Recorder & Transcriber               ║'));
    console.log(chalk.cyan.bold('╚══════════════════════════════════════════════════════════╝\n'));

    try {
        const config = await loadConfig();
        const runImmediately = process.argv.includes('--now');

        if (runImmediately) {
            console.log(chalk.yellow('Running immediately due to --now flag...'));
            await runRecordingSession(config);
            process.exit(0);
        } else if (config.schedule && config.schedule.enabled) {
            const cronExpression = config.schedule.cronExpression;
            console.log(chalk.green(`\n📅 Scheduler enabled`));
            console.log(chalk.white(`   Waiting for schedule: ${cronExpression}`));
            console.log(chalk.white(`   (Timezone: ${config.schedule.timezone || 'System Default'})`));
            console.log(chalk.gray('\nPress Ctrl+C to exit scheduler.\n'));

            const task = cron.schedule(cronExpression, async () => {
                console.log(chalk.magenta(`\n⏰ Scheduled time reached! Starting recording session...`));
                await runRecordingSession(config);
                console.log(chalk.gray('\nWaiting for next scheduled run...'));
            }, {
                timezone: config.schedule.timezone
            });
        } else {
            console.log(chalk.yellow('No schedule enabled. Running immediately...'));
            await runRecordingSession(config);
            process.exit(0);
        }

    } catch (error) {
        console.error(chalk.red('Fatal error:'), error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n\n⚠ Interrupted by user. Cleaning up...'));
    try {
        const recording = getRecordingPath();
        if (recording) {
            await stopScreenRecording();
        }
    } catch (error) {
        console.error(chalk.red('Error during cleanup:'), error.message);
    }
    process.exit(0);
});

// Run main function
main().catch((error) => {
    console.error(chalk.red('Unhandled error:'), error);
    process.exit(1);
});
