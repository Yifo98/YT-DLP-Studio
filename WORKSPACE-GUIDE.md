# YT-DLP Studio Workspace Guide

## Daily Use

- `Launch YT-DLP Studio.command`
  - macOS daily launch entry at the project root. Double-click it from Finder.
- `release/win-unpacked/YT-DLP Studio.exe`
  - The real built Windows desktop app. Do not move this exe by itself out of `win-unpacked/`.

## Share With Others

- `release/YT-DLP-Studio-share.zip`
  - Share this file with friends.
- `release/share/`
  - Expanded share package output.

## Private / Do Not Share

- `cookies/`
  - Private cookie files. Never send these to other people.

## Core Project Files To Keep

- `src/`
- `electron/`
- `scripts/`
- `tools/`
- `public/`
- `package.json`
- `package-lock.json`
- `vite.config.ts`
- `tsconfig*.json`
- `eslint.config.js`
- `index.html`
- `README.md`

## Regeneratable Build Output

These can be recreated by building again, so they do not need special backup:

- `release/win-unpacked/`
- `release/share/`
- `release/YT-DLP-Studio-share.zip`

## Already Cleaned Up

The following generated clutter was removed:

- `dist/`
- `dist-electron/`
- `release/builder-debug.yml`
- `release/yt-dlp-studio-0.1.0-x64.nsis.7z`
