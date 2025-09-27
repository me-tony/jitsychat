# JitsyChat

A lightweight, dependency-free web client for self-hosted Jitsi Meet deployments. The UI drives the `lib-jitsi-meet` SDK directly so you can place calls, exchange chat messages, and manage participants without embedding the stock Jitsi Meet iframe. The client is designed around Jitsi’s **Secure Domain (Option A)** flow: moderators authenticate with Prosody while guests join anonymously through the guest virtual host.

## Features

- Works with Secure Domain (Option A): moderators enter their Prosody username/password while guests connect through the `guest.` virtual host with no prompt.
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
3. Enter your Jitsi domain (for example `meet.yourdomain.tld`), the room name (letters, numbers, underscores, or hyphens), and your display name.
4. If you are creating the room, supply the moderator username and password you registered in Prosody. Leave the fields blank to join as an anonymous guest through the guest domain.
5. Click **Join call**. The app sanitises the room name automatically and reuses the configured domain for reconnect attempts.

## Project structure

```
.
├── app.js        # Jitsi Meet integration and UI behaviour
├── index.html    # Application shell
├── styles.css    # Styling for layout and components
└── README.md
```

## Configure Secure Domain (Option A)

Follow the official Jitsi documentation to enable Secure Domain on your self-hosted deployment so moderators authenticate while guests stay anonymous:

1. Configure Prosody with an authenticated primary host and an anonymous guest host (`/etc/prosody/conf.avail/meet.yourdomain.tld.cfg.lua`):

   ```lua
   VirtualHost "meet.yourdomain.tld"
       authentication = "internal_hashed"

   VirtualHost "guest.meet.yourdomain.tld"
       authentication = "anonymous"
       c2s_require_encryption = false
   ```

2. Update your Jitsi Meet web configuration so it uses the guest domain for anonymous users and Jicofo for authenticated focus connections. (This app automatically requests `guest.<domain>` as the anonymous host.)
3. Register at least one moderator account and restart the Jitsi services:

   ```bash
   sudo prosodyctl register tony meet.yourdomain.tld supersecret
   sudo systemctl restart prosody jicofo jitsi-videobridge2
   ```

When a moderator logs in with these credentials they unlock the room and become host; subsequent participants can leave the moderator fields blank to join as guests without additional prompts.

## Notes

- Update the `<script>` tag in `index.html` if you host `lib-jitsi-meet` on your own domain (for example `https://meet.yourdomain.tld/libs/lib-jitsi-meet.min.js`).
- Browsers require user interaction before accessing the camera and microphone. Grant permission when prompted.
- Leaving the page or clicking **Leave call** will cleanly disconnect from the conference and release local media tracks.
- If the connection to Jitsi is interrupted, the app automatically retries up to three times while keeping your call UI and chat history in place.
