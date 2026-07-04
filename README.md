<div align="center">
  <img src="build/icon.png" width="88" alt="SideGlass icon" />

  # SideGlass

  **Ask an AI without leaving the document in front of you.**

  [![Windows](https://img.shields.io/badge/Windows-portable-1976d2?style=flat-square&logo=windows11&logoColor=white)](https://github.com/hasnain7abbas/sideglass/releases/latest)
  [![No API key](https://img.shields.io/badge/API_key-not_required-10a37f?style=flat-square)](#how-it-works)
  [![MIT License](https://img.shields.io/badge/license-MIT-262a2c?style=flat-square)](LICENSE)

  [Install for Windows](https://github.com/hasnain7abbas/sideglass/releases/latest/download/SideGlass-Setup-0.3.0.exe)
  &nbsp; | &nbsp;
  [Portable version](https://github.com/hasnain7abbas/sideglass/releases/latest/download/SideGlass-0.3.0.exe)
</div>

![SideGlass open beside a document](docs/sideglass-preview.png)

SideGlass is the small window I wanted while reading and writing: ChatGPT, Claude, or Gemini stays beside the current document instead of pulling the whole workflow into a browser. The window is translucent, always available through one shortcut, and quiet enough to leave open.

Version 0.3 uses your normal Chrome or Edge session instead of an embedded login page. Existing accounts remain signed in, Google authentication works in the supported browser context, and SideGlass still keeps the provider fitted inside its compact frame.

## What it does

- Keeps a compact AI window above other applications.
- Switches between ChatGPT, Claude, and Gemini in one place.
- Reuses your normal Chrome or Edge profile, including existing provider sessions.
- Uses the providers' real websites with no paid API key.
- Remembers the selected provider, opacity, pin state, size, and position.
- Restores an off-screen window safely after monitor changes.
- Provides retry and browser fallback actions when a provider cannot load.

## Controls

| Control | Action |
| --- | --- |
| `Ctrl + Alt + Space` | Show, focus, or hide SideGlass |
| Provider tabs | Switch AI service |
| Pin | Toggle always-on-top mode |
| Opacity slider | Adjust the whole window from 58% to 100% |
| Reload | Reload the current provider |
| External link | Sign in or open the current provider in the full browser |

Drag the title area to move the window. Resize it from any edge like a normal desktop app.

## Signing in

SideGlass normally picks up the accounts already signed in to Chrome or Edge. If a provider still asks you to log in, use the external-link button in the footer. Complete sign-in in the full browser window, return to SideGlass, and press reload. The browser owns the session throughout; SideGlass does not copy passwords or cookies.

This avoids the embedded-browser authentication restrictions that can otherwise block Google login or trigger an incorrect security-key prompt.

## How it works

SideGlass hosts a borderless Chrome or Edge app window inside its Electron frame and manages its size, visibility, opacity, and provider switching. It does not send prompts through its own server and does not require API credentials.

Provider account rules and usage limits still apply. Their websites can also change without notice, so login challenges, CAPTCHA, or temporary layout issues may occasionally appear.

## Run from source

You need [Node.js](https://nodejs.org/), npm, and Google Chrome or Microsoft Edge on Windows.

```powershell
git clone https://github.com/hasnain7abbas/sideglass.git
cd sideglass
npm install
npm start
```

Build the recommended installer with:

```powershell
npm run dist:installer
```

Build the portable executable with:

```powershell
npm run dist
```

The outputs are written to `release/SideGlass-Setup-0.3.0.exe` and `release/SideGlass-0.3.0.exe`.

## Windows note

The current builds are not code-signed, so Windows SmartScreen may show a warning on first launch. The installer is recommended because it launches directly after the one-time installation; the portable version must unpack itself on every launch.

## License

SideGlass is available under the [MIT License](LICENSE).
