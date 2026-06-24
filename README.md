# SideGlass

SideGlass is a small always-on-top AI side window for Windows. It opens ChatGPT, Claude, or Gemini in a compact translucent desktop panel, so you can ask something while reading or writing without moving your whole workflow into a browser.

It does not use any paid API. You sign in to the normal AI websites inside the app, and SideGlass keeps that browser session locally.

## Run

```powershell
npm install
npm start
```

## Controls

- `Ctrl + Alt + Space` shows or hides the window.
- Use the provider buttons to switch between ChatGPT, Claude, and Gemini.
- Use the opacity slider to make the window more or less transparent.
- Use the pin button to keep the window above other apps.
- Drag the top title area to move it.

## Build a Portable App

```powershell
npm run dist
```

The portable build is written to `release/`.

## Notes

Some AI providers change their web apps often. SideGlass loads them as real browser pages instead of iframes, which avoids the most common embedding block, but provider login rules, CAPTCHA, or anti-automation checks can still appear.
