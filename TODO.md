# Fix ESLint `react-hooks/set-state-in-effect` in DashboardPage.tsx

## Steps
- [x] Read relevant files (DashboardPage, NowPlayingCard, useSocket, useLiveEvents, socketEvents, eslint config, ARCHITECTURE.md)
- [x] Confirm exact ESLint error (`react-hooks/set-state-in-effect` at line 198:21)
- [x] Plan approved by user
- [x] Remove the `useEffect` containing `if (!connected) setPlayback(null)`
- [x] Change Now Playing render guard to `{connected && playback && (<NowPlayingCard ... />)}`
- [x] Run client typecheck (`tsc --noEmit`) — passes (empty output)
- [x] Run ESLint (`npm run lint`) — passes (no errors/warnings)
- [x] Report exact files changed and results

