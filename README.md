# JitsyChat

A lightweight, dependency-free web client for Jitsi Meet. The UI drives the `lib-jitsi-meet` SDK directly so you can place calls, exchange chat messages, and manage participants without embedding the stock Jitsi Meet iframe. It connects to the public [meet.jit.si](https://meet.jit.si) service out of the box, and you can point it at a self-hosted domain by changing the join form.

## Features

- Starts calls anonymously on the public meet.jit.si cluster—no moderator credentials or iframe required.
- Supports custom/self-hosted Jitsi deployments by entering a different domain in the join form.
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
3. Leave the domain field set to `meet.jit.si` (or enter your own Jitsi host), then provide the room name (letters, numbers, underscores, or hyphens) and your display name.
4. Click **Join call**. The app sanitises the room name automatically and reuses the configured domain for reconnect attempts.

## Project structure

```
.
├── app.js        # Jitsi Meet integration and UI behaviour
├── index.html    # Application shell
├── styles.css    # Styling for layout and components
└── README.md
```

## Self-hosted notes

- Update the `<script>` tag in `index.html` if you host `lib-jitsi-meet` on your own domain (for example `https://meet.yourdomain.tld/libs/lib-jitsi-meet.min.js`).
- Anonymous joins work on meet.jit.si. If your deployment requires authentication, configure Prosody/Jicofo accordingly and provide those credentials through your own UI flow.

## Notes

- Browsers require user interaction before accessing the camera and microphone. Grant permission when prompted.
- Leaving the page or clicking **Leave call** will cleanly disconnect from the conference and release local media tracks.
- If the connection to Jitsi is interrupted, the app automatically retries up to three times while keeping your call UI and chat history in place.
