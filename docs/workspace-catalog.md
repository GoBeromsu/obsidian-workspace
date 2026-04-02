# Workspace Catalog

> Generated from `workspace/plugins.manifest.json`. Edit the manifest, then rerun `node workspace/generate-catalog.mjs`.

- Workspace kind: `submodule-workspace`
- Manifest version: `1`

## Portfolio

| Name | Path | Role | Release kind | Branch | Risk | Smoke vault |
|------|------|------|--------------|--------|------|-------------|
| Metadata Auto Classifier | `Metadata-Auto-Classifier` | `plugin` | `stable` | `master` | `medium` | `Test` |
| Bible Search | `obsidian-bible-search` | `plugin` | `stable` | `main` | `medium` | `Test` |
| Boiler Template | `obsidian-boiler-template` | `template` | `stable` | `master` | `high` | `Test` |
| Eagle Plugin | `obsidian-eagle-plugin` | `plugin` | `stable` | `main` | `high` | `Test` |
| QMD | `obsidian-qmd` | `plugin` | `stable` | `main` | `high` | `Test` |
| Agent Skill Deploy | `agent-skill-deploy` | `plugin` | `incubator` | `main` | `medium` | `Test` |
| Open Connections | `open-connections` | `plugin` | `stable` | `main` | `critical` | `Test` |
| Note Player | `youtube-note-playlist` | `plugin` | `stable` | `main` | `high` | `Ataraxia` |

## Details

### Metadata Auto Classifier

- Path: `Metadata-Auto-Classifier`
- Repo kind: `submodule`
- Plugin id: `metadata-auto-classifier`
- Release kind: `stable`
- CI workflow: `CI`
- Release workflow: `Release plugin`
- Artifact files: `main.js`, `manifest.json`, `styles.css`, `versions.json`
- Smoke commands: `obsidian vault="Test" plugin:reload id="metadata-auto-classifier"`
- Notes: `Independent plugin repo`, `Settings-heavy UI; runtime smoke should include modal interactions`

### Bible Search

- Path: `obsidian-bible-search`
- Repo kind: `submodule`
- Plugin id: `obsidian-bible-search`
- Release kind: `stable`
- CI workflow: `CI`
- Release workflow: `Release plugin`
- Artifact files: `main.js`, `manifest.json`, `styles.css`, `versions.json`
- Smoke commands: `obsidian vault="Test" plugin:reload id="obsidian-bible-search"`, `obsidian vault="Test" command id="obsidian-bible-search:search-bible-verse"`
- Notes: `Public repo`, `Smoke evidence should include command-triggered modal proof`

### Boiler Template

- Path: `obsidian-boiler-template`
- Repo kind: `submodule`
- Plugin id: `sample-plugin`
- Release kind: `stable`
- CI workflow: `CI`
- Release workflow: `Release plugin`
- Artifact files: `main.js`, `manifest.json`, `styles.css`, `versions.json`
- Smoke commands: `pnpm --dir obsidian-boiler-template run ci`, `pnpm --dir obsidian-boiler-template run sync:check`
- Notes: `Control-plane source of truth`, `Release readiness depends on downstream sync health`

### Eagle Plugin

- Path: `obsidian-eagle-plugin`
- Repo kind: `submodule`
- Plugin id: `eagle`
- Release kind: `stable`
- CI workflow: `CI`
- Release workflow: `Release plugin`
- Artifact files: `main.js`, `manifest.json`, `styles.css`, `versions.json`
- Smoke commands: `obsidian vault="Test" plugin:reload id="eagle"`
- Notes: `Depends on external Eagle runtime for deeper smoke coverage`

### QMD

- Path: `obsidian-qmd`
- Repo kind: `submodule`
- Plugin id: `obsidian-qmd`
- Release kind: `stable`
- CI workflow: `CI`
- Release workflow: `Release plugin`
- Artifact files: `main.js`, `manifest.json`, `styles.css`, `versions.json`
- Smoke commands: `obsidian vault="Test" plugin:reload id="obsidian-qmd"`, `obsidian vault="Test" command id="obsidian-qmd:open-search"`
- Notes: `Search view and related notes view are primary runtime surfaces`

### Agent Skill Deploy

- Path: `agent-skill-deploy`
- Repo kind: `submodule`
- Plugin id: `skill-deploy`
- Release kind: `incubator`
- CI workflow: `CI`
- Release workflow: `Release plugin`
- Artifact files: `main.js`, `manifest.json`, `styles.css`, `versions.json`
- Smoke commands: `pnpm --dir agent-skill-deploy run ci`
- Notes: `Promoted from root-local incubator into its own public repo`, `Keep release_kind=incubator until release and smoke contracts are fully aligned`

### Open Connections

- Path: `open-connections`
- Repo kind: `submodule`
- Plugin id: `open-connections`
- Release kind: `stable`
- CI workflow: `CI`
- Release workflow: `Release plugin`
- Artifact files: `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, `versions.json`
- Smoke commands: `obsidian vault="Test" plugin:reload id="open-connections"`, `obsidian vault="Test" command id="open-connections:open-lookup-view"`, `obsidian vault="Test" eval code="(async()=>JSON.stringify(await app.plugins.plugins['open-connections']?.search_embed_model?.get_gpu_diag?.() ?? null))()"`
- Notes: `Local-model smoke is mandatory`, `Highest priority simplification target`

### Note Player

- Path: `youtube-note-playlist`
- Repo kind: `submodule`
- Plugin id: `note-player`
- Release kind: `stable`
- CI workflow: `CI`
- Release workflow: `Release plugin`
- Artifact files: `main.js`, `manifest.json`, `styles.css`, `versions.json`
- Smoke commands: `obsidian plugin:reload id=note-player`, `remote runtime verification in Ataraxia vault`
- Notes: `Remote-only runtime verification remains the preferred smoke path`

