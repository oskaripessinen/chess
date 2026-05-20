# Chess

A small two-player chess app you can play in the browser. No accounts, no signup. Create a game, send the link to a friend, play.

## How it works

- The frontend is React + Vite (TypeScript).
- The backend is a Cloudflare Worker. Each game lives inside a Durable Object so all the state for one game (board, clocks, players) is in one place.
- The browser talks to the worker over WebSocket for moves and over REST when creating or joining a game.
- Move legality is checked with `chess.js` on both sides. The server is the source of truth.
- Clocks use the Durable Object alarm API instead of a polling loop, so the server sleeps until either a move comes in or someone runs out of time.

## Running locally

Frontend:
```
npm install
npm run dev
```

Worker (in another terminal):
```
cd worker
npm install
npm run dev
```

The frontend expects the worker on the same origin in production. For local dev set `VITE_API_BASE_URL` to wherever wrangler is serving (usually `http://localhost:8787`).

## Features

- 5 min / 10 min / no time limit
- Pick white, black or random
- Draw offers, resign, rematch (colors swap)
- Move history + a slider to replay the game after it ends
- Optional spectator mode

## Folder layout

```
src/      frontend
worker/   cloudflare worker + durable object
```
