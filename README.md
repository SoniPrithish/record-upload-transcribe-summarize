# Zoom Meeting Recorder & Transcriber

An automated Node.js tool for macOS that joins Zoom meetings via the desktop app, records the screen with audio, and generates AI-powered transcriptions and summaries using Google's Gemini API.

## Features

- 🤖 **Automated Zoom Joining**: Automatically joins Zoom meetings via the native desktop application using deep links
- 🎥 **Screen Recording**: Records the meeting screen with system audio using FFmpeg
- 🔇 **Privacy First**: Automatically mutes microphone and turns off camera when joining via AppleScript
- 💾 **Local Storage**: Saves recordings directly to a specified directory (e.g., Google Drive for Desktop synced folder)
- 📝 **Transcription**: Generates timestamped transcripts using Google Gemini API
- 🤖 **AI Summaries**: Creates structured summaries with key points, decisions, and action items using Gemini
- ⏰ **Scheduling**: Automatically joins meetings at scheduled times using cron expressions

## Prerequisites

- **Node.js** (v18 or higher)
- **FFmpeg** installed on your system
  ```bash
  brew install ffmpeg
  ```
- **macOS** (for screen recording with avfoundation and AppleScript automation)
- **Zoom Desktop App** installed on your Mac
- **Google Gemini API Key** (see Configuration section)
- **Accessibility Permissions** for Terminal/Node to control Zoom via AppleScript

## Installation

1. Clone or navigate to the project directory:
   ```bash
   cd zoom-recorder
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up configuration files (see Configuration section below)

## Configuration

### 1. Environment Variables

Create a `.env` file in the root directory:

```env
# Google Gemini API Key for transcription and summarization
GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. Configuration File

Copy the example configuration file and fill in your details:

```bash
cp config/config.json.example config/config.json
```

Edit `config/config.json`:

```json
{
  "zoom": {
    "meetingLink": "https://us04web.zoom.us/j/123456789?pwd=yourpassword",
    "password": "",
    "displayName": "Your Name"
  },
  "cloudStorage": {
    "provider": "local",
    "folderName": "Zoom Recordings"
  },
  "recording": {
    "outputDir": "/Users/yourname/Library/CloudStorage/GoogleDrive-youremail@gmail.com/My Drive/Zoom Recordings",
    "quality": "medium"
  },
  "ai": {
    "transcriptionModel": "gemini-1.5-flash",
    "summaryModel": "gemini-1.5-flash"
  },
  "schedule": {
    "enabled": true,
    "cronExpression": "20 16 * * 2,4",
    "timezone": "America/Los_Angeles"
  }
}
```

#### Configuration Options

- **zoom.meetingLink**: The full Zoom meeting URL (password will be auto-extracted if present in URL)
- **zoom.password**: Meeting password (leave empty to auto-extract from URL)
- **zoom.displayName**: Your display name in the meeting
- **cloudStorage.provider**: Set to `"local"` (cloud upload APIs have been removed)
- **cloudStorage.folderName**: Descriptive name for the folder
- **recording.outputDir**: Absolute path to save recordings (can be a Google Drive synced folder)
- **recording.quality**: `"high"`, `"medium"`, or `"low"`
- **ai.transcriptionModel**: Gemini model (default: `"gemini-1.5-flash"`)
- **ai.summaryModel**: Gemini model (default: `"gemini-1.5-flash"`)
- **schedule.enabled**: Enable/disable automatic scheduling
- **schedule.cronExpression**: Cron expression for when to join meetings (e.g., `"20 16 * * 2,4"` = 4:20 PM on Tuesdays and Thursdays)
- **schedule.timezone**: Timezone for the schedule (e.g., `"America/Los_Angeles"`)

## Getting API Keys

### Google Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key and add it to your `.env` file

## Usage

### Run Immediately

To join a meeting and start recording right away:
```bash
npm start -- --now
```

### Run on Schedule

To run the scheduler (will wait for the configured cron time):
```bash
npm start
```

The tool will:
1. Launch the Zoom desktop app and join the meeting via deep link
2. Use AppleScript to mute microphone and turn off camera
3. Start screen recording with audio
4. Monitor the Zoom Meeting window
5. Stop recording when the meeting window closes
6. Generate transcription and summary using Gemini AI

Files will be saved to:
- Recordings: Your configured `outputDir`
- Transcripts: `outputDir/../transcripts/`

## How It Works

1. **Zoom Joining**: Uses `zoommtg://` deep links to launch the Zoom desktop app directly
2. **AppleScript Automation**: Controls the Zoom window to mute/stop video via macOS System Events
3. **Screen Recording**: Uses FFmpeg with macOS avfoundation to capture screen and system audio
4. **Meeting Detection**: Monitors the "Zoom Meeting" window via AppleScript to detect when it closes
5. **Transcription**: Extracts audio from video and uploads to Gemini API for transcription
6. **Summary**: Uses Gemini to generate structured summaries from the transcript

## System Audio Setup

To capture system audio (Zoom meeting audio), you need to set up a virtual audio device:

1. Install BlackHole (free virtual audio driver):
   ```bash
   brew install blackhole-2ch
   ```

2. Create a Multi-Output Device in Audio MIDI Setup:
   - Open "Audio MIDI Setup" (in Applications/Utilities)
   - Click the "+" button and select "Create Multi-Output Device"
   - Check both your speakers/headphones AND BlackHole 2ch
   - Set this as your system output device before joining the meeting

3. The recorder will capture audio from BlackHole

## Troubleshooting

### FFmpeg not found
```bash
brew install ffmpeg
```

### Zoom doesn't join automatically
- Verify the meeting link format is correct
- Check that the Zoom desktop app is installed
- Ensure the password is correctly extracted or specified

### AppleScript permission denied
- Go to System Settings → Privacy & Security → Accessibility
- Add Terminal (or your IDE) to the list of allowed apps
- You may need to restart the app after granting permissions

### No audio in recording
- Verify you've set up BlackHole and Multi-Output Device (see System Audio Setup)
- Check that the Multi-Output Device is set as your system output
- Run `ffmpeg -f avfoundation -list_devices true -i ""` to see available audio devices

### Transcription fails
- Verify your Gemini API key is valid
- Check that the video file was created successfully
- Ensure you have sufficient API quota

## Security Notes

- Never commit `.env` file or `config/config.json` to version control
- Store API keys securely
- Recordings may contain sensitive information - handle with care
- The app requires Accessibility permissions to control Zoom

## Limitations

- Currently designed for macOS only
- Requires Zoom desktop app to be installed
- System audio capture requires additional setup (BlackHole)
- Screen recording captures the entire screen (not just Zoom window)

## License

ISC

## Contributing

Feel free to submit issues and enhancement requests!
