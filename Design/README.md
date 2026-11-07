# Remi design archive

Design assets and colour boards for every version of the Remi app, one folder per version.

| Version | Name | Branch | Colour board |
|---|---|---|---|
| 1 | Original | `main` | [color-board.png](version-1-original/color-board.png) |
| 2 | Living Cookbook | `version-2` | [color-board.png](version-2-living-cookbook/color-board.png) |
| 3 | Sip Happy | `version-3` | [color-board.png](version-3-sip-happy/color-board.png) |

Each version folder has:

- `README.md`: the direction, the palette with each colour's role, type, and an asset list.
- `color-board.png`: the core palette plus the main light and dark theme roles, with contrast checks.
- `palette.json`: every theme token for light and dark, read from that version's `mobile-app/src/theme/tokens.ts`.
- Other folders as available: fonts, logo, photography, textures and screenshots.

Shared across versions: [`illustrations/`](illustrations/README.md), three hand-drawn explainer illustrations (SVG and PNG) that the app doesn't use yet.

## Regenerating the boards

```bash
python3 Design/tools/make_color_boards.py
```

Run it from the repo root; it needs Pillow and the `origin/main`, `origin/version-2` and `version-3` refs. The script
reads each version's tokens straight from git, so a board always shows what that version shipped. Version 2's code
kept version 1's palette key names ("Remi Blue" holds tomato red), so its board uses the names from its DESIGN.md.
`palette.json` keeps the code names under `codePalette`.

The app's live assets stay in `mobile-app/assets/`. This folder is an archive copy for designers and reviewers.
