import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Generate AI summary from transcript
 */
export async function generateSummary(transcript, outputDir, modelName = 'gemini-1.5-flash-8b') {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY not found in environment variables');
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        console.log(chalk.blue('Generating AI summary with Gemini...'));

        // Extract just the text content if transcript is formatted
        const transcriptText = typeof transcript === 'string'
            ? transcript
            : transcript.transcript || transcript.text || JSON.stringify(transcript);

        const prompt = `Please analyze the following meeting transcript and provide a comprehensive summary. Structure your response as follows:

## Meeting Summary

### Key Points
[List the main topics and key points discussed]

### Decisions Made
[List any decisions or conclusions reached]

### Action Items
[List any action items, tasks, or follow-ups mentioned, including who is responsible if mentioned]

### Important Details
[Any other important information, dates, deadlines, or context]

### Participants Mentioned
[List any participants or stakeholders mentioned]

---

Transcript:
${transcriptText.substring(0, 30000)}${transcriptText.length > 30000 ? '\n\n[Transcript truncated for length]' : ''}`;

        const result = await model.generateContent(prompt);
        const summary = result.response.text();

        // Save summary to file
        const summaryPath = path.join(outputDir, `summary-${Date.now()}.md`);
        await fs.writeFile(summaryPath, summary, 'utf-8');

        console.log(chalk.green('✓ Summary generated successfully'));
        console.log(chalk.green(`  Summary saved to: ${summaryPath}`));

        return {
            summary: summary,
            filePath: summaryPath,
        };
    } catch (error) {
        console.error(chalk.red('✗ Summary generation error:'), error.message);
        throw error;
    }
}
