# JitsyChat

A lightweight, dependency-free web client that connects directly to [Jitsi Meet](https://meet.jit.si/) using `lib-jitsi-meet`. Start an ad-hoc video call, exchange messages, and manage audio/video devices without relying on iframes while meeting the new authentication requirements for meet.jit.si.

## Features

- Authenticate with meet.jit.si using the official Google, Facebook, or GitHub social login flow before starting a room.
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
3. Enter a room name (letters, numbers, underscores, or hyphens) and your display name. If you have not already authenticated with meet.jit.si, click **Sign in with Google, Facebook, or GitHub** and complete the popup before clicking **Join call**. Any other characters in the room name will be stripped automatically to match Jitsi's requirements.
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
- Authentication is now mandatory on meet.jit.si per the [official announcement](https://jitsi.org/blog/authentication-on-meet-jit-si/). Use the built-in Google, Facebook, or GitHub login popup to establish your moderator session before joining.
- Browsers require user interaction before accessing the camera and microphone. Grant permission when prompted.
- Leaving the page or clicking **Leave call** will cleanly disconnect from the conference and release local media tracks.
- If the connection to Jitsi is interrupted, the app automatically retries up to three times while keeping your call UI and chat history in place.

## Authentication

Click **Sign in with Google, Facebook, or GitHub** to launch the official meet.jit.si authentication flow. Once the popup closes the session cookie is stored for meet.jit.si, letting the next join attempt promote you to moderator automatically.

If authentication is still required for the room, you'll be prompted again so you can retry the login flow or choose a different room name.
