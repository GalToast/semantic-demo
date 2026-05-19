# Semantic Demo QA Scripts

## Surface Contract Scripts

| Script | Surfaces tested | Viewport |
|--------|----------------|----------|
| `qa:contract:mobile-critical` | mobile-idle, search-chrome, focus-pocket, map-trail, controls, field-node, compass-rail | 390x844 mobile |
| `qa:contract:mobile-chrome` | search-chrome | 390x844 mobile |
| `qa:contract:all` | all surfaces | mixed |

All contract scripts target `http://127.0.0.1:8795/vector-explorer-polished.html` by default. Start the server with `npm run serve` before running contract scripts.
