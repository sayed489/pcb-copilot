# PCB Copilot

**AI PCB design studio** — describe a board, watch Fireworks write real
[tscircuit](https://tscircuit.com) TSX, compile it, run ERC/DRC, repair
failures, and export a manufacturing bundle once verification passes.

```
brief → Fireworks (GLM 5.3 Flash) → TSX → compile → ERC/DRC → repair loop → Gerbers
```

## Studio UI

A neobrutalism cyan-and-white **EDA editor shell**:

- **Menu bar** — File / Edit / View / Help with working actions
  (new design, export, deep review, tab navigation)
- **Toolbar** — select / route / measure tools, grid & snap toggles,
  review & fab actions, live pipeline progress
- **Left dock** — *Storyline* with **Solder**, a 3D three.js mascot that
  narrates the five-act generation pipeline (brief → draft → compile →
  verify → ship), plus the engineering brief chat with one-click
  clarification replies
- **Center** — document tabs (Schematic / PCB / 3D / Source / Checks) over
  a grid canvas; live TSX streaming and stage feedback while generating
- **Right dock** — Inspector: properties, layer stack, live problem list
- **Bottom** — collapsible console (timestamped agent log) and a status
  bar with cursor coordinates, grid, routing ratio, and DRC state
- **Fireworks celebration** — full-screen particle burst when a design
  passes verification

## Pipeline hardening

- **Model fallbacks** — if the primary model id is decommissioned
  (Firewaves rotates serverless models), the client rotates through
  fallbacks automatically (`glm-5p3-flash` → `glm-5p3` → `deepseek-v4p1-flash`)
- **Param fallbacks** — structured-output (`response_format`) and
  `reasoning_effort` are dropped gracefully on 400s
- **Clarification flow** — vague briefs get critical questions first;
  follow-ups force `status: ready` so generation always proceeds
- **Errors surface** — stream errors are logged to the console drawer and
  chat instead of being silently swallowed (fixed from v1)
- **Prompt contract** — teaches the model tscircuit's board-centered
  coordinate system and pin-to-pin trace requirements, the two most
  common causes of DRC failures

## Getting started

```bash
pnpm install
cp .env.local.example .env.local   # add FIREWORKS_API_KEY
pnpm dev
```

### Environment

| Variable | Required | Default |
|---|---|---|
| `FIREWORKS_API_KEY` | yes | — |
| `FIREWORKS_MODEL_ID` | no | `accounts/fireworks/models/glm-5p3-flash` |
| `FIREWORKS_API_URL` | no | `https://api.fireworks.ai/inference/v1/chat/completions` |

### Testing without network access

An OpenAI-compatible mock server lets you run the full pipeline offline:

```bash
node scripts/mock-fireworks.mjs 8787
# .env.local:
#   FIREWORKS_API_URL=http://127.0.0.1:8787/v1/chat/completions
pnpm dev
curl -N -X POST localhost:3000/api/design \
  -H 'Content-Type: application/json' \
  -d '{"messages":["make me a board"],"allowClarification":true}'
```

## Architecture

```
app/
  page.tsx                Studio shell (menus, docks, status, celebration)
  api/design              NDJSON-streamed agent run
  api/export              Verified manufacturing ZIP (Gerber/BOM/PnP)
  api/review              Deep review + checklist
components/
  studio/                 MenuBar, Toolbar, StatusBar, InspectorPanel,
                          StorylinePanel, ConsoleDrawer, Mascot3D, FireworksOverlay
  CircuitViewer.tsx       Document tabs + viewer panes
  PromptChat.tsx          Brief chat + clarification quick-replies
lib/server/
  config.ts               Env + model fallback chain
  fireworks.ts            Client with model/param rotation + retries
  brief.ts                Requirements → DesignBrief (JSON schema)
  prompts.ts              Generator/repair prompts (coordinate + net rules)
  generation.ts           Codegen + repair, TSX extraction
  verification.ts         Compile + ERC/DRC → VerificationResult
  agent.ts                Repair loop (max 3 iterations)
```

## Safety

Automated verification is a **gate, not a substitute** for qualified review
of datasheets, footprints, thermal limits, EMC, regulatory compliance, and
fabricator stack-up. Generated code is sandboxed: no imports, no network,
no DOM/process access.
