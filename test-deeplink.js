import { exec } from 'child_process';
import util from 'util';
import chalk from 'chalk';

const execPromise = util.promisify(exec);

/**
 * Test the deep link manually
 */
async function testDeepLink() {
    const meetingId = '73857951350';
    const password = 'XJewPbCLa3R0CCz1qPkaQcePQUt46j.1';
    const displayName = 'Test User';

    console.log(chalk.blue('Testing Zoom Deep Link...'));
    console.log(chalk.blue(`Meeting ID: ${meetingId}`));
    console.log(chalk.blue(`Password: ${password}`));

    // Try different URL formats
    const formats = [
        `zoommtg://zoom.us/join?confno=${meetingId}&pwd=${encodeURIComponent(password)}&uname=${encodeURIComponent(displayName)}`,
        `zoomus://zoom.us/join?confno=${meetingId}&pwd=${encodeURIComponent(password)}`,
        `zoommtg://zoom.us/join?action=join&confno=${meetingId}`,
    ];

    for (let i = 0; i < formats.length; i++) {
        console.log(chalk.yellow(`\nTrying format ${i + 1}:`));
        console.log(formats[i].replace(/pwd=[^&]+/, 'pwd=***'));

        try {
            await execPromise(`open "${formats[i]}"`);
            console.log(chalk.green('✓ Command executed'));
            await new Promise(r => setTimeout(r, 5000));

            const answer = await new Promise((resolve) => {
                process.stdin.once('data', (data) => {
                    resolve(data.toString().trim().toLowerCase());
                });
                console.log(chalk.cyan('Did it join the meeting? (y/n): '));
            });

            if (answer === 'y') {
                console.log(chalk.green(`\n✓ SUCCESS! Format ${i + 1} works!`));
                console.log(chalk.green('Use this format in zoomJoiner.js'));
                process.exit(0);
            }
        } catch (error) {
            console.error(chalk.red('✗ Error:'), error.message);
        }
    }

    console.log(chalk.red('\n✗ None of the formats worked'));
    process.exit(1);
}

testDeepLink();
