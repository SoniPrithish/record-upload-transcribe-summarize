import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Extract audio from video file
 */
async function extractAudio(videoPath, outputDir) {
    return new Promise((resolve, reject) => {
        const audioPath = path.join(outputDir, `audio-${Date.now()}.mp3`);

        console.log(chalk.blue('Extracting audio from video...'));

        ffmpeg(videoPath)
            .output(audioPath)
            .audioCodec('libmp3lame')
            .audioBitrate(128)
            .on('end', () => {
                console.log(chalk.green('✓ Audio extracted successfully'));
                resolve(audioPath);
            })
            .on('error', (error) => {
                console.error(chalk.red('✗ Error extracting audio:'), error.message);
                reject(error);
            })
            .run();
    });
}

/**
 * Transcribe audio using Google Gemini API
 */
export async function transcribeVideo(videoPath, outputDir, modelName = 'gemini-1.5-flash-8b') {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY not found in environment variables');
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const fileManager = new GoogleAIFileManager(apiKey);

        console.log(chalk.blue('Starting transcription with Gemini...'));

        // Extract audio first (Gemini can handle video, but audio is smaller/faster)
        const audioPath = await extractAudio(videoPath, outputDir);

        try {
            // Upload file to Gemini
            console.log(chalk.blue('Uploading audio to Gemini...'));
            const uploadResult = await fileManager.uploadFile(audioPath, {
                mimeType: 'audio/mp3',
                displayName: path.basename(audioPath),
            });

            const fileUri = uploadResult.file.uri;
            console.log(chalk.green(`✓ File uploaded: ${fileUri}`));

            // Wait for file to be active
            let file = await fileManager.getFile(uploadResult.file.name);
            while (file.state === 'PROCESSING') {
                console.log(chalk.blue('Processing file...'));
                await new Promise((resolve) => setTimeout(resolve, 2000));
                file = await fileManager.getFile(uploadResult.file.name);
            }

            if (file.state === 'FAILED') {
                throw new Error('Gemini file processing failed');
            }

            // Generate transcript
            console.log(chalk.blue('Generating transcript...'));
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent([
                {
                    fileData: {
                        mimeType: uploadResult.file.mimeType,
                        fileUri: uploadResult.file.uri
                    }
                },
                { text: "Generate a timestamped transcript of this audio. Format it with [MM:SS] timestamps." }
            ]);

            const transcriptText = result.response.text();

            // Clean up audio file locally
            await fs.unlink(audioPath).catch(() => { });

            // Clean up file in Gemini (optional but good practice)
            // await fileManager.deleteFile(uploadResult.file.name).catch(() => {});

            // Save transcript to file
            const transcriptPath = path.join(outputDir, `transcript-${Date.now()}.txt`);
            await fs.writeFile(transcriptPath, transcriptText, 'utf-8');

            console.log(chalk.green('✓ Transcription completed'));
            console.log(chalk.green(`  Transcript saved to: ${transcriptPath}`));

            return {
                transcript: transcriptText,
                raw: result.response,
                filePath: transcriptPath,
            };
        } catch (error) {
            // Clean up audio file on error
            await fs.unlink(audioPath).catch(() => { });
            throw error;
        }
    } catch (error) {
        console.error(chalk.red('✗ Transcription error:'), error.message);
        throw error;
    }
}
