# Client (React + Vite)

Frontend for the native Solana Todo app.

## Requirements

- Node.js 18+
- npm
- A Solana wallet extension (Phantom or Solflare)

## Install

```bash
npm install
```

## Run in Development

```bash
npm run dev
```

Open the local URL shown by Vite (usually `http://localhost:5173`).

## Build

```bash
npm run build
```

## Preview Production Build

```bash
npm run preview
```
## Notes

- The app loads tasks only for the connected wallet.
- Task title and description are fixed-size on-chain fields (max 64 bytes each).
- If `npm run devb` fails, use `npm run dev` (there is no `devb` script).
