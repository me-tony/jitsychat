# JitsyChat

A lightweight, dependency-free web client that connects directly to [Jitsi Meet](https://meet.jit.si/) using `lib-jitsi-meet`. Start an ad-hoc video call instantly, exchange messages, and manage audio/video devices without relying on iframes or authentication.

## Features

- Join any public Jitsi room by name with no moderator or authentication required (anonymous domain handled automatically).
- High-quality audio/video calling powered by the official `lib-jitsi-meet` SDK.
- Real-time group chat alongside the call.
- Participant list with live display-name updates.
- Local controls to mute/unmute audio and hide/show video.
- Graceful teardown and reconnection handling.

## Getting started

1. Serve the project directory with any static web server. A simple option is Python's built-in server:

   ```bash
   python3 -m http.server 4173
   ```

2. Open `http://localhost:4173/` in a modern browser.
3. Enter a room name (letters, numbers, underscores, or hyphens) and your display name, then click **Join call**. Any other characters will be stripped automatically to match Jitsi's room requirements.
4. Share the same room name with others so they can join you instantly.

## Project structure

```
.
├── app.js        # Jitsi Meet integration and UI behaviour
├── index.html    # Application shell
├── styles.css    # Styling for layout and components
└── README.md
```

## Notes

- The app loads the official `lib-jitsi-meet` bundle from `https://meet.jit.si`. Ensure the domain is reachable from your network.
- Browsers require user interaction before accessing the camera and microphone. Grant permission when prompted.
- Leaving the page or clicking **Leave call** will cleanly disconnect from the conference and release local media tracks.
- If the connection to Jitsi is interrupted, the app automatically retries up to three times while keeping your call UI and chat history in place.
