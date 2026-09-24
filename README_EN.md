# More Bases Views

English | [简体中文](README.md)

More Bases Views is a multi-view plugin for [Obsidian](https://obsidian.md/) Bases. It presents the same database as books, projects, maps, cards, indexes, and other layouts suited to the underlying content.

*Let each database look like the content it represents.*

The plugin keeps native Bases filtering, sorting, grouping, and property mapping, then adds themed interfaces, card interactions, property editing, standalone HTML export, and virtual rendering for large datasets.

## Views

| View | Designed for | Main capabilities |
| --- | --- | --- |
| **Books** | Books, textbooks, collections | Three-dimensional covers and matching spines, reading status, attachment opening |
| **Papers** | Papers and research material | Title, author, page count, reading status, attachment entry |
| **Projects** | GitHub projects and development tasks | Repository metrics, public status, development status, task list |
| **Courses** | Courses and grades | Photo, score, configurable maximum score, score colors |
| **Media** | Series, anime, and general media | Poster, episodes, duration, genre, dates, rating |
| **Movies** | Movie collections | Movie-oriented cards, poster ratio, rating information |
| **Games** | Game collections | Cover, genre, release date, editable rating |
| **Cards** | Custom collectible cards | Custom aspect ratio, gold frame, materials, enlarged interaction |
| **Operators** | Arknights-style character profiles | Standard/hidden artwork, profession, faction, rarity, artwork positioning |
| **Hearthstone** | Hearthstone-style cards | Multiple card types, live editor, related cards, complete card interaction |
| **Map** | Places and geographic data | MapLibre map, custom tiles, marker icons, colors, popup cards |
| **Celebrity** | People and photo collections | Wooden frame, mat width, photo presentation |
| **Tier** | Ranking and classification | Tier List, tier drill-down, drag-to-rate, automatic scrolling |
| **Index** | Large note indexes | Native file-tree style categories, search, virtual list, tag management |

## Shared capabilities

### Bases integration

- Uses the current Bases filter, sort, and grouping results.
- Maps card fields to arbitrary Bases properties in view options.
- Provides card width, image ratio, and view-specific controls.
- Supports standalone `.base` files and applicable embedded Bases contexts.
- The official table view can enable a batch property manager for previewing and applying add, update, remove, replace, and rename operations to the current result set.

### Opening and editing files

- Opens Markdown notes in the current tab, a new tab, or a Modal.
- Card, Hearthstone, and Operator views provide enlargement and editing interactions suited to their artwork.
- Writable properties save immediately and check whether another operation changed the note before writing.
- Book and Paper views can open attachments inside Obsidian or with the system default application.

### Performance and export

- Card-based views use a virtual grid and keep only items near the viewport attached.
- Images, Canvas rendering, and expensive jobs run on demand.
- Most card-based views provide **Export HTML...**. The export inlines images and styles and retains applicable hover, enlargement, and switching interactions.
- Export reads the current Bases query directly and does not require scrolling through the full view first.

## Highlighted views

### Project view

The Project view presents GitHub repositories as terminal-style cards. After mapping a repository path property, it can show releases, Stars, downloads, Issues, Pull requests, license, primary language, and recent commits.

- **Status** marks a project as in development or stage complete.
- **Public** marks whether a project is public; private projects omit unavailable online metrics.
- **Tasks** manages incomplete and completed tasks stored in the project note.
- The GitHub icon in the title bar opens the repository page.

### Index view

The Index view organizes database entries in a two-column interface modeled after Obsidian's native file list.

- The left side builds a collapsible category tree from a property and supports category reordering.
- The right side renders matching notes with a virtual list.
- Search covers titles, categories, and properties.
- Notes can be opened, retagged, or deleted.

### Map view

The Map view creates markers from a coordinates property and supports light/dark tile URLs, center coordinates, zoom limits, and embedded height.

- Marker icon, color, title, and cover can come from note properties.
- Selecting a marker opens a note summary card.
- The defaults use OpenStreetMap and CARTO; custom tile services are supported.

### Card view

- Builds custom-ratio cards from a front image property.
- With click-to-enlarge enabled, click once to enlarge and again to open the note. Disable it to open the note directly.
- Materials include **None**, **Random**, and several animated finishes. **None** does not mount any material layer.
- The current scroll position is locked while a card is enlarged, and pointer effects settle smoothly after leaving the face.

### Operator view

- Supports standard and hidden modes with separate artwork and position properties.
- Artwork accepts one Vault image link or a list of links; drag and wheel interactions adjust position and scale.
- Professions and factions use a primary category plus branch editor while storing the final display value for compatibility with existing notes.
- Right-click a card to open the editor. The current view mode decides whether standard or hidden artwork is edited.
- Profession, faction, and artwork cycling, rarity frames, and standalone HTML export are supported.

Artwork position uses text values:

```yaml
Artwork position: "[50,0,1.48]"
Hidden artwork position: "[50,0,1.48]; [10,-5,1.2]"
```

The three values are horizontal position, vertical position, and scale. Separate positions for multiple images with semicolons in matching order.

### Hearthstone view

The Hearthstone view supports constructed play and Battlegrounds, including minions, heroes, spells, weapons, and locations.

- Supports standard, golden, diamond, and full-art finishes, dual classes, rarity, tribe or school, cost, stats, and banner or runes.
- Constructed costs include mana, health, remains, and armor; Battlegrounds supports coins and time markers.
- Heroes can reveal a separate hero-power frame. Flavor text unfolds to the right when a card is enlarged.
- Related cards can be collapsed under a parent and previewed from the expanded card.
- Right-click opens a live editor with direct artwork dragging.
- Click to enlarge and flip to the legendary card back; click again to open the note.
- Card and Hearthstone views share the material implementation while keeping independent view packs.

Example properties:

```yaml
Card name: Dawn Guardian
Type: Constructed-Minion
Finish: Golden
Class: [Paladin]
Rarity: Legendary
Artwork: "[[Attachments/guardian.png]]"
Artwork position: "[50,0,1.48]"
Cost: Mana-5
Stats: 4/8
Tribe: [Dragon]
Description: |-
  **Divine Shield, Taunt**
  At the end of your turn, restore 2 Health to all friendly characters.
Flavor: This text appears after the card is enlarged.
```

Property names are configurable; map each field in the Hearthstone view options.

## View packs

Card, Operator, and Hearthstone views use version-bound single-file packs so large visual assets do not inflate `main.js`. Original assets and generated `.mbvpack` files are excluded from the open-source repository and must be supplied through a separately authorized distribution channel:

```text
view-packs/
├─ card.mbvpack
├─ operator.mbvpack
└─ hearthstone.mbvpack
```

- `card.mbvpack` contains card material assets.
- `operator.mbvpack` contains profession, faction, rarity, and control assets.
- `hearthstone.mbvpack` contains frames, icons, the card back, and its own copy of matching material assets.
- Hearthstone does not depend on the Card pack.
- Packs must match the plugin version. A missing, damaged, or incompatible pack leaves the view available and displays an import interface.
- Importing a `.mbvpack` from that interface writes it to the plugin's `view-packs/` directory.
- AGPL-3.0 covers the published source code only; private assets and `.mbvpack` files are outside that license grant.

## Usage

1. Create or open a `.base` file.
2. Add a view from the Bases toolbar.
3. Select **Books**, **Projects**, **Cards**, **Hearthstone**, or another More Bases Views type.
4. Open view options and map title, image, status, and other fields to note properties.
5. Use the native Bases property list to arrange other properties rendered on cards.
6. Set card width, file opening behavior, and view-specific options as needed.

For complex views, define note properties before mapping them. Optional unmapped fields do not prevent a view from running.

## Installation

### BRAT

Add the following repository with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

```text
AlbusGuo/albus-more-bases-views
```

BRAT installs the standard plugin files. Card, Operator, and Hearthstone packs must be obtained from a separately authorized distribution channel and then imported from the missing-pack interface.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from [GitHub Releases](https://github.com/AlbusGuo/albus-more-bases-views/releases).
2. Create `<Vault>/.obsidian/plugins/albus-more-bases-views/`.
3. Copy only the three primary plugin files into that directory.
4. If you obtained authorized view packs, create a `view-packs/` subdirectory and copy the required `.mbvpack` files into it, or import them later from their views.
5. Reload Obsidian.
6. Enable `More Bases Views` under **Settings -> Community plugins**.

When upgrading, obtain matching packs through the same authorized channel. A new plugin version will not load old packs.

## Compatibility and privacy

- Requires Obsidian `1.10.2` or newer.
- The manifest supports desktop and mobile. Hearthstone, Operator, and large maps have more rendering space and resources on desktop.
- The plugin includes no telemetry and does not upload Vault content or execute downloaded code.
- The Project view requests selected repository metrics from `img.shields.io` after a GitHub repository is configured.
- The Map view requests configured map tiles. The defaults use OpenStreetMap and CARTO.
- Remote image URLs in note properties are requested by Obsidian.
- Hearthstone-specific fonts are not bundled. The view falls back to system fonts when `AR LisuGB`, `GBJenLei-Medium`, `BlizzardGlobal`, or `BelweBT-Bold` is unavailable.

## Acknowledgements

- [Pokémon Cards CSS](https://github.com/simeydotme/pokemon-cards-css): material implementation used by Card and Hearthstone views.
- [Hearthstone DIY template article](https://www.iyingdi.com/tz/post/5656264): Hearthstone card assets.
- [PRTS Wiki](https://prts.wiki): Operator view assets.
- [Obsidian Maps](https://github.com/obsidianmd/obsidian-maps): implementation reference for the Map view.
- [Book CSS](https://gist.github.com/kepano/8afc4cad9c32f4fde6ef6347f66a0571) by [Kepano](https://github.com/kepano): original CSS for the Book view.

Thanks to the Obsidian developer documentation, sample plugin, and the wider plugin community.

## License

Copyright (C) 2026 Albus.

Original code in this project is released under the [GNU Affero General Public License v3.0 only](LICENSE).

The material implementation adapted from [Pokémon Cards CSS](https://github.com/simeydotme/pokemon-cards-css) remains under the [GNU General Public License v3.0](POKEMON_CARDS_CSS_LICENSE). The GPL-3.0 and AGPL-3.0 portions are combined under section 13 of AGPL-3.0; the GPL-covered portion retains its original license.

The referenced Obsidian Maps code uses the [MIT License](OBSIDIAN_MAPS_LICENSE), and the bundled MapLibre GL JS retains its [BSD-3-Clause and accompanying notices](MAPLIBRE_LICENSE).

Hearthstone, Operator, and Book-related assets are not relicensed under AGPL-3.0. Copyright and other rights remain with their respective authors and rightsholders. Original assets and generated `.mbvpack` files are excluded from the public source repository. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for complete sources, license boundaries, and redistribution notes.

## Development

The project uses TypeScript, npm, and esbuild. Feature code lives in `src/`; `src/main.ts` handles plugin lifecycle and view registration.

```bash
npm install
npm run lint
npm run build
```

The public source does not contain `assets/`. `npm run build` still produces a functional core plugin without private assets; `view-packs/` is generated only when the complete private asset source is present locally.

Production builds are written to `dist/`:

```text
dist/
├─ main.js
├─ manifest.json
├─ styles.css
└─ view-packs/                 # generated only with private assets
   ├─ card.mbvpack
   ├─ operator.mbvpack
   └─ hearthstone.mbvpack
```

Run `npm run lint` and `npm run build` before submitting changes. `assets/`, `dist/`, `main.js`, and `.mbvpack` files are excluded from the public Git repository.
