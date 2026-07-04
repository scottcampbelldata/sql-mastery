# Premium Analyst Cockpit Design

## Direction

Build SQL Mastery Path as a premium analyst cockpit: quiet, elegant, dense, and serious enough for interview preparation. The app should look like a polished commercial tool for someone preparing for senior analyst roles, not like a static tutorial site.

## Visual System

- Palette: porcelain page `#f4f6f2`, ink `#121417`, graphite `#23272f`, mist panel `#fbfcf8`, rule `#d8ded3`, cobalt action `#3457d5`, jade success `#128260`, amber warning `#b86b00`, red error `#bb3b31`.
- Typography: retain `Space Grotesk` for restrained headings, `IBM Plex Sans` for body UI, and `IBM Plex Mono` for SQL, metrics, labels, and database metadata.
- Shape: keep radii at 8px or less; use exact rules, tabular stats, thin dividers, and compact controls.
- Signature element: a command-deck dashboard with database ribbon, metric cards, and a precise session workbench that makes the SQL editor feel like the central instrument.

## Dashboard

The dashboard should open with a structured command header, a current-session mission panel, metric cards, and a refined week lattice. The hierarchy should make the next action obvious while still showing the full 16-week path.

## Session Workspace

The session view should prioritize the task, SQL editor, run/check controls, feedback, and results. The exercise rail should feel like a syllabus queue, while the workbench should feel like a professional analysis station.

## Constraints

- Preserve all existing backend and database behavior.
- Preserve the current `/api/curriculum` and `/api/check` data flow.
- Avoid decorative blobs, oversized marketing hero patterns, and playful tutorial styling.
- Verify desktop and mobile layouts in the browser.
