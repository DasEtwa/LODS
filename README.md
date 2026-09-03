# NeoTab Studio

Static GitHub Pages editor for NeoTab. It previews Tablist, Scoreboard, ActionBar and BossBar configuration and can connect to NeoTab's authenticated WebSocket bridge for live player and placeholder values.

The site has no build step and no backend. Open `index.html` through any static HTTP server. Bridge and write tokens are held in memory only; the WebSocket URL may be remembered locally for convenience.

Persistent saving appears only when the connected server advertises `SAVE_CONFIG`. NeoTab then requires its separately configured write token, validates an allowlisted patch and performs its own atomic persistence and runtime reload.

Production: <https://levelsofdungeons.de>
