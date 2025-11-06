import { exec } from 'child_process';
import util from 'util';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execPromise = util.promisify(exec);

/**
 * Join a Zoom meeting via the Zoom Desktop Application
 * Uses 'zoommtg://' deep links and AppleScript for automation
 */
export async function joinZoomMeeting(config) {
    console.log(chalk.blue('Preparing to join Zoom meeting via Desktop App...'));

    // Extract Meeting ID and Password
    const meetingLink = config.zoom.meetingLink;
    let meetingId = '';
    let password = config.zoom.password || '';

    // Try to parse meeting ID from URL
    // Formats: https://zoom.us/j/123456789 or https://zoom.us/j/123456789?pwd=...
    const idMatch = meetingLink.match(/\/j\/(\d+)/);
    if (idMatch) {
        meetingId = idMatch[1];
    } else {
        // Try to match just a number if the link is weird, or throw error
        const numberMatch = meetingLink.match(/(\d{9,11})/);
        if (numberMatch) {
            meetingId = numberMatch[1];
        } else {
            throw new Error('Could not extract Meeting ID from link: ' + meetingLink);
        }
    }

    // If password is in URL but not in config, extract it
    if (!password) {
        const pwdMatch = meetingLink.match(/[?&]pwd=([^&]+)/);
        if (pwdMatch) {
            password = pwdMatch[1];
        }
    }

    const displayName = config.zoom.displayName || 'Zoom Recorder';

    // Construct zoommtg URL - Zoom desktop app deep link format
    // Format: zoommtg://zoom.us/join?confno=MEETING_ID&pwd=PASSWORD&uname=NAME
    // Note: Some versions also support: zoomus://zoom.us/join?confno=...
    let zoomUrl = `zoommtg://zoom.us/join?confno=${meetingId}`;

    if (password) {
        zoomUrl += `&pwd=${encodeURIComponent(password)}`;
    }

    zoomUrl += `&uname=${encodeURIComponent(displayName)}`;

    console.log(chalk.blue(`Generated Deep Link: ${zoomUrl.replace(/pwd=[^&]+/, 'pwd=***')}`));
    console.log(chalk.blue(`Meeting ID: ${meetingId}`));
    console.log(chalk.blue(`Password: ${password ? '***' : '(none)'}`));

    try {
        console.log(chalk.blue('Executing open command...'));
        const { stdout, stderr } = await execPromise(`open "${zoomUrl}"`);
        console.log(chalk.green('✓ Zoom application launched via deep link'));

        // Give Zoom time to process the deep link
        await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
        console.error(chalk.red('✗ Failed to open Zoom URL:'), error.message);
        throw error;
    }

    // Wait for Zoom preview window and joining meeting...
    console.log(chalk.blue('Waiting for Zoom preview window and joining meeting...'));

    // AppleScript to handle UI
    const appleScript = `
        tell application "zoom.us" to activate
        delay 3 -- Wait for app to come to front
        
        tell application "System Events"
            tell process "zoom.us"
                -- First, handle the preview window and click Join
                set counter to 0
                repeat until (exists window 1)
                    if counter > 20 then exit repeat
                    delay 1
                    set counter to counter + 1
                end repeat
                
                -- Look for the Join button in the preview window
                try
                    delay 2
                    -- The Join button is typically a button with "Join" text
                    click button "Join" of window 1
                    delay 5 -- Wait for meeting to actually join
                on error
                    -- If we can't find "Join" button, try clicking any button that might be the join button
                    try
                        click UI element "Join" of window 1
                        delay 5
                    end try
                end try
                
                -- Now wait for the actual meeting window
                set counter to 0
                repeat until (exists window "Zoom Meeting")
                    if counter > 30 then exit repeat
                    delay 1
                    set counter to counter + 1
                end repeat
                
                if (exists window "Zoom Meeting") then
                    -- Meeting joined! Now handle Audio/Video
                    delay 2
                    
                    -- Method 1: Try using keyboard shortcuts (most reliable)
                    try
                        -- Cmd+Shift+A to mute audio
                        keystroke "a" using {command down, shift down}
                        delay 1
                        -- Cmd+Shift+V to stop video
                        keystroke "v" using {command down, shift down}
                        delay 1
                    end try
                    
                    -- Method 2: Try menu bar (backup)
                    try
                        tell menu bar 1
                            tell menu bar item "Meeting"
                                tell menu "Meeting"
                                    if exists menu item "Mute Audio" then
                                        click menu item "Mute Audio"
                                    end if
                                    if exists menu item "Stop Video" then
                                        click menu item "Stop Video"
                                    end if
                                end tell
                            end tell
                        end tell
                    end try
                else
                    error "Could not find Zoom Meeting window"
                end if
            end tell
        end tell
    `;

    try {
        // Write AppleScript to a temporary file to avoid shell escaping issues
        const tmpDir = os.tmpdir();
        const scriptPath = path.join(tmpDir, `zoom-join-${Date.now()}.scpt`);

        await fs.writeFile(scriptPath, appleScript, 'utf8');

        try {
            await execPromise(`osascript "${scriptPath}"`);
            console.log(chalk.green('✓ Meeting joined and Audio/Video configured (Muted/Stopped)'));
        } finally {
            // Clean up the temporary file
            await fs.unlink(scriptPath).catch(() => { });
        }
    } catch (error) {
        console.warn(chalk.yellow('⚠ AppleScript automation had issues:'), error.message);
        console.warn(chalk.yellow('  The meeting may have joined, but audio/video might not be muted.'));
        console.warn(chalk.yellow('  Please ensure Terminal/Node has Accessibility permissions in System Settings.'));
    }

    // Return empty browser/page objects as we are not using Puppeteer anymore
    // But we return the meetingId for context if needed
    return { browser: null, page: null, meetingId };
}

/**
 * Monitor meeting status and detect when it ends
 * For Desktop app, we monitor the process existence
 */
export async function monitorMeeting(page) {
    // Desktop Mode: Monitor the Zoom Meeting window
    return new Promise((resolve) => {
        console.log(chalk.blue('Monitoring Zoom Meeting window...'));
        const checkInterval = setInterval(async () => {
            try {
                // Check if "Zoom Meeting" window exists using AppleScript
                // This is better than checking process existence because you might leave the meeting but keep Zoom open
                const appleScript = `
                    tell application "System Events"
                        if exists (window 1 of process "zoom.us" whose name contains "Zoom Meeting") then
                            return "true"
                        else
                            return "false"
                        end if
                    end tell
                `;
                const { stdout } = await execPromise(`osascript -e '${appleScript}'`);

                if (stdout.trim() === 'false') {
                    // Meeting window gone
                    console.log(chalk.yellow('Zoom Meeting window closed. Ending recording...'));
                    clearInterval(checkInterval);
                    resolve('ended');
                }
            } catch (e) {
                // Error likely means Zoom process is gone too
                console.log(chalk.yellow('Zoom application closed. Ending recording...'));
                clearInterval(checkInterval);
                resolve('ended');
            }
        }, 5000); // Check every 5 seconds
    });
}

/**
 * Quit Zoom application completely
 */
export async function quitZoom() {
    console.log(chalk.blue('Closing Zoom application...'));

    try {
        // Use AppleScript to gracefully quit Zoom
        const appleScript = `
            tell application "zoom.us"
                quit
            end tell
        `;

        await execPromise(`osascript -e '${appleScript}'`);
        console.log(chalk.green('✓ Zoom application closed successfully'));

        // Give it a moment to fully quit
        await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
        // If AppleScript fails, try using killall as backup
        console.warn(chalk.yellow('⚠ AppleScript quit failed, trying alternative method...'));
        try {
            await execPromise('killall "zoom.us"');
            console.log(chalk.green('✓ Zoom application closed'));
        } catch (killError) {
            console.warn(chalk.yellow('⚠ Could not close Zoom:'), killError.message);
            console.warn(chalk.yellow('  Zoom may already be closed or requires manual intervention.'));
        }
    }
}
