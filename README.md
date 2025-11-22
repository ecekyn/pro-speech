# pro-speech

App that listens to/reads your daily conversations and reports your common language mistakes.

## Project Structure

```
pro-speech/
├── apps/
│   └── mobile/          # React Native mobile app
├── packages/            # Shared code (future)
```

## Getting Started

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
