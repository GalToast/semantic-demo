# Semantic Business Search Explorer

Semantic retrieval surface for 8,406 Montgomery County business records.

This project turns local-business embeddings into a browser-based review surface: clustered records, search focus, semantic neighbor trails, map anchors, responsive HUD controls, and a backend artifact lane for the retrieval data. Three.js and Leaflet are the inspection layer; the core work is making a real semantic search corpus visible enough to audit.

![Semantic demo overview](docs/assets/semantic-demo-overview.png)

![Semantic search results](docs/assets/semantic-search-results.png)

## Overview

This project provides an interactive environment for exploring high-dimensional semantic search over a real local-business corpus. It combines a compact public record payload with generated semantic-neighbor artifacts so retrieval behavior can be inspected in the browser instead of hidden behind a text-only search box.

## Features

- **Interactive Corpus Navigation:** Pan, zoom, rotate, search, and inspect 8,406 business records in a semantic constellation.
- **Semantic Clustering:** Visual grouping and color-coding of related business records based on embedded proximity and factual modifiers.
- **Cinematic Camera Choreography:** Smooth, orchestrated camera movements that guide the user through the data landscape.
- **High-Performance Rendering:** Built with HTML/CSS/JavaScript, Three.js, and Leaflet for a web-based corpus inspection experience.
- **Responsive UI:** A tailored heads-up display (HUD) that adapts to desktop and mobile form factors.

## Architecture Highlights

- **Three.js Core:** Utilizes custom shaders and instanced rendering for optimal performance.
- **Vector Mapping:** `data.dat` and the semantic thread artifacts are loaded to represent corpus records and retrieval relationships.
- **Dynamic Physics:** Custom particle physics and glow effects create a "biofield" visual aesthetic.
- **Semantic Backend:** The sanitized `backend/` directory contains the public Python surface used to build, prepare, restore, and serve semantic search artifacts. It keeps the portfolio repo focused on retrieval infrastructure rather than unrelated local operations.

## Demo

This project was built to be deployed on the web. The entry point is `index.html`. It loads `semantic-demo.css` and the associated `.dat` files for the structural mappings.

## Proof Artifacts

| Artifact | What it shows |
| --- | --- |
| `index.html` | Full browser experience and interaction model |
| `data.dat` | Compact public record payload generated from semantic thread artifacts |
| `semantic-demo.css` | Responsive UI, HUD styling, search/focus states, and motion polish |
| `backend/` | Sanitized semantic artifact generation and local search service path behind the visualization |

## Recruiter Reading Guide

Open `index.html` first to inspect the interaction model, then `semantic-demo.css` for the UI polish and responsiveness. The backend folder is intentionally included to show how the visualization connects to generated semantic artifacts rather than being only a decorative 3D page.
