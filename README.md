# pro-speech

App that listens to/reads your daily conversations and reports your common language mistakes.

## Project Structure

```
pro-speech/
├── apps/
│   ├── backend/         # Go + Gin API
│   └── mobile/          # React Native mobile app
├── packages/            # Shared code (future)
```

## Getting Started

### Backend

```bash
cd apps/backend

export LEMONFOX_API_KEY=your_lemonfox_key
export OPENAI_API_KEY=your_openai_key

# Optional
export OPENAI_ANALYSIS_MODEL=gpt-4o-mini
export PRO_SPEECH_DATA_PATH=data/pro_speech.json
export PRO_SPEECH_VOICE_PROFILE_PATH=data/voice_profile.json
export FFMPEG_PATH=/opt/homebrew/bin/ffmpeg

go run main.go
```

The backend exposes:

- `POST /api/sessions/audio` - transcribes and analyzes an uploaded recording, saves it to the daily history, and returns the updated daily report.
- `POST /api/sessions/text` - analyzes a transcript directly for development/testing.
- `GET /api/voice-profile` - returns whether the app user's voice profile is enrolled.
- `POST /api/voice-profile` - enrolls or updates the app user's voice profile from an uploaded voice sample.
- `DELETE /api/voice-profile` - clears the enrolled voice profile.
- `GET /api/reports/today?date=YYYY-MM-DD` - returns the daily top-3 report for a date.

Voice matching uses Lemonfox diarized speaker labels plus a local acoustic fingerprint generated with `ffmpeg`. If a voice profile is enrolled but the backend cannot confidently match it to a diarized speaker, the session is not analyzed so the app does not report on someone else's speech.

### Mobile App

```bash
cd apps/mobile
npm install

# iOS (requires CocoaPods: gem install cocoapods)
cd ios && pod install && cd ..
npx react-native run-ios

# Android
npx react-native run-android
```

The mobile app can enroll a short voice sample, records user-started listening sessions, uploads each stopped session to the backend, and shows the daily "Top 3 mistakes today" report after 8:00 PM local time. The current implementation is a foreground MVP; always-on background listening and a local 8:00 PM notification require a native background audio/notification pass.
