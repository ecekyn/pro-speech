# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pro-speech is a mobile app that listens to and reads daily conversations, then reports common language mistakes to help users improve their speech patterns.

## Architecture

Monorepo structure:
- `apps/mobile` - React Native mobile app (TypeScript)
- `packages/` - Shared code (future backend, utilities)

## Development Commands

### Mobile App (apps/mobile)

```bash
# Install dependencies
npm install

# Run on iOS
cd ios && pod install && cd ..
npx react-native run-ios

# Run on Android
npx react-native run-android

# Run tests
npm test

# Run single test file
npm test -- path/to/test.ts

# Lint
npm run lint

# Start Metro bundler
npm start
```

## Tech Stack

- React Native 0.82.1
- TypeScript
- Jest for testing
- ESLint + Prettier for code quality
