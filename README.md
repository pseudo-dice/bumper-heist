# Bumper Heist v0.2 — Crews & Chaos

## Start the game

1. Extract the ENTIRE ZIP (right-click > Extract All).
2. Open the extracted `bumper-heist` folder. Keep all files and the public/test folders together.
3. Install Node.js 20 or newer if it is not already installed.
4. Open a terminal in the `bumper-heist` folder and run `npm start`. Keep its terminal window open.
5. Open http://localhost:3000 in your browser.

Alternatively, run `node server.mjs` in this folder.
No package installation or external services are required. Stop an older server with Ctrl+C before launching this version. Extract this update into a fresh folder and refresh game tabs.

For a quick multiplayer test, open a fresh second tab and join the room code. Don't duplicate an existing game tab, because duplicated tabs can copy its player session.

For phones and other computers on the same Wi-Fi, open the `Same Wi-Fi` address printed by the server. Use the host computer's LAN address, not localhost, on other devices. Allow the server through your computer's firewall if prompted. Guest Wi-Fi/client isolation can prevent devices connecting.

To choose another port in Command Prompt: `set PORT=3001` then `node server.mjs`. On Linux or macOS, run `PORT=3001 npm start`. Open the matching localhost address.

## What's new

- Even player counts (2, 4, 6, 8): two equal teams, Blue and Orange, with one goal and shared score per crew. Alternating join order determines teams. Two players are 1 vs 1.
- Odd player counts (3, 5, 7): each driver is their own team, with a unique color, goal and score.
- Teams and mode are fixed when the match starts. Disconnecting does not change the arena mid-match. Rematches return to the lobby, where mode updates for the new player count.
- Volt Stadium: split blue/orange playing field, center line and colored perimeter lights. Four directional spring pads.
- Orbit Yard: radial colored sectors, orbital rings and warm perimeter blocks. One inward-angled spring pad per player.
- Both arenas are physically larger than v0.1 and grow with player count. The camera fits the whole arena to the screen; cart size and speed in world units stay the same.
- A dull decoy ball marked `?` collides normally but NEVER scores. The glowing golden ball is the only scoring ball. Both reset after a goal.
- Mint spring pads launch carts and either ball in their arrow direction. A brief cooldown prevents repeated triggering while crossing one pad.
- New deep navy, electric blue, orange and gold palette.

| Players | Match | Arena diameter (world units) |
|---|---|---|
| 2 | 1 vs 1 | 820 |
| 3 | 3 solo teams | 860 |
| 4 | 2 vs 2 | 920 |
| 5 | 5 solo teams | 960 |
| 6 | 3 vs 3 | 1020 |
| 7 | 7 solo teams | 1060 |
| 8 | 4 vs 4 | 1120 |

Original arena diameter was 680. Arena size stays fixed through sudden death.

## Rules

WASD/arrows or a touch joystick to steer. Space/BUMP to dash (3-second cooldown). Push the GOLD ball into your own side's goal for 1 point, regardless of last touch. First team to 5 wins; otherwise highest score after 3 minutes of active play. Goal countdowns pause the clock. Tied teams play sudden death; other players spectate. Every 20 seconds, a 5-second hazard appears (spinning bumpers, crosswind, bouncy walls). Team members can bump one another. Any connected player can choose **Rematch** to return everyone to the lobby after a match.

## Technical notes

The Node server owns physics and scoring, simulates 60 steps/sec, and streams snapshots at about 30/sec. Clients send controls at 20/sec and smooth received positions. Rooms live in server memory and disappear on server restart. No accounts or permanent scores. Any connected player can start when at least two drivers are connected, or request a rematch after the match finishes. Only the host can change room visibility. Joining mid-match is locked. Interrupted streams reconnect automatically; a per-tab token supports refresh recovery. Offline players remain in the current match and host control transfers after 15 seconds.

This version is for local/LAN testing and has not been publicly deployed. Browser visual QA is not verified in the build environment. Internet hosting, lag compensation and audio remain later work.

## Tests

Run `node --test`. Tests cover all 2–8 player configurations, arena growth, shared scoring, solo and team sudden death, mode stability on disconnect, decoy non-scoring, spring launches, cooldown, collisions, eight-player simulation, static assets, and real multi-client HTTP synchronization, authorization and rematch. These are correctness tests, not a server-capacity benchmark.

## Room invites and control feedback

In the lobby, expand **Scan to join · QR invite**. Friends on the same Wi-Fi can scan the QR code, enter a driver name, and click **Join room**; the room code is already filled in. When the host opens localhost, the invite uses a LAN address instead. If multiple addresses are listed, choose the Wi-Fi address printed by the server. **Copy invite** uses the selected address too. Restart the server after installing this update. QR generation uses the bundled MIT-licensed Project Nayuki library (https://www.nayuki.io/page/qr-code-generator-library), without external requests.

On keyboard devices, WASD keys light up while held; arrow keys light up the corresponding direction. Space lights up SPACE and BUMP. Touching BUMP highlights it while held. Releasing controls or switching away clears the highlights.

## Public HTTPS invites

No purchased domain is required: use the HTTPS `onrender.com` address assigned by Render. When opened at a public address, QR and copied invites preserve the browser's exact origin, including HTTPS. Localhost continues to discover LAN addresses for same-Wi-Fi play. The invite API also recognizes HTTPS forwarded by the hosting proxy. Public HTTPS invites work across networks; local LAN invites require the same network.

## Quick Play, room visibility, and trial limits

- **Quick Play** joins the fullest public lobby with a free slot, or creates a public room. Any connected player can start the match when at least two drivers are connected. Running matches and private rooms are excluded.
- **Start a room** defaults to private. Turn on **Public room** to allow Quick Play players. The host can change visibility in the lobby. Private rooms still accept room codes, links, and QR invites.
- The server allows **5 simultaneous rooms**, counting lobbies, games, and results. Existing rooms can still accept players when the cap is reached.
- Lobbies close after **15 minutes** without a join, visibility change, or match start. Results close after **10 minutes** without a rematch. A visible countdown warns players, and closure returns them to the entry screen. Active matches are not interrupted by idle deadlines.
- Disconnected lobby slots expire after **15 seconds**; empty rooms are reclaimed after their initial 30-second grace period. A player is only marked connected after opening their live stream.
- Create, join, and Quick Play share a limit of **30 attempts per minute per IP address**. Shared-Wi-Fi players share that allowance. Rejected requests return HTTP 429 with Retry-After; gameplay controls are exempt. The limiter's address storage is bounded and expires automatically.
- On Render (`RENDER=true`), IP detection uses Cloudflare's connecting-IP header, with a conservative forwarded-address fallback. Locally, it uses the socket address and ignores forwarded headers. Check rate-limit behavior after deployment if adding another proxy.
- Lobby and results snapshots are sent about once per second, plus immediate room changes; active games retain about 30 snapshots per second to each connected player.

Run `npm test` to check matchmaking, private-room exclusion, visibility authorization, the room cap, expiration, abandoned connections, and throttling alongside gameplay. These trial limits do not guarantee a particular hosting capacity; monitor service memory, CPU, and bandwidth before increasing the cap. Rooms and rate-limit counters reset on server restart. Restart the server and refresh browser tabs to use this update.
