# Semantic Search Vector Explorer

Interactive Three.js explorer for semantic vector spaces.

This project turns embedding relationships into a browser-based visual surface: clustered nodes, motion, search focus, responsive HUD controls, and a backend artifact lane for the semantic data. It is meant to make retrieval systems inspectable instead of invisible.

![Semantic demo overview](docs/assets/semantic-demo-overview.png)

![Semantic search results](docs/assets/semantic-search-results.png)

## Overview

This project provides a cinematic, interactive environment to navigate and analyze high-dimensional semantic search vectors in a 3D space. It demonstrates advanced data visualization techniques, including particle systems, flow fields, and responsive 3D typography, designed to make complex vector spaces intuitive and visually engaging.

## Features

- **Interactive 3D Navigation:** Pan, zoom, and rotate through a dynamically generated vector constellation.
- **Semantic Clustering:** Visual grouping and color-coding of semantically related data points based on embedded proximity.
- **Cinematic Camera Choreography:** Smooth, orchestrated camera movements that guide the user through the data landscape.
- **High-Performance Rendering:** Built on Three.js for smooth web-based 3D graphics, even with large datasets.
- **Responsive UI:** A tailored heads-up display (HUD) that adapts to desktop and mobile form factors.

## Architecture Highlights

- **Three.js Core:** Utilizes custom shaders and instanced rendering for optimal performance.
- **Vector Mapping:** Pre-computed semantic threads are loaded and visualized to represent data relationships.
- **Dynamic Physics:** Custom particle physics and glow effects create a "biofield" visual aesthetic.
- **Semantic Backend:** The `backend/` directory contains the Python pipeline used to generate and serve the embeddings. It leverages Qwen 3.6+, LanceDB, and sentence-transformers to build the high-dimensional vector space underlying the visualization.

## Demo

This project was built to be deployed on the web. The entry point is `index.html`. It loads `semantic-demo.css` and the associated `.dat` files for the structural mappings.

## Proof Artifacts

| Artifact | What it shows |
| --- | --- |
| `index.html` | Full browser experience and interaction model |
| `semantic-demo.css` | Responsive UI, HUD styling, search/focus states, and motion polish |
| `backend/` | Semantic artifact generation path behind the visualization |

## Recruiter Reading Guide

Open `index.html` first to inspect the interaction model, then `semantic-demo.css` for the UI polish and responsiveness. The backend folder is intentionally included to show how the visualization connects to generated semantic artifacts rather than being only a decorative 3D page.
