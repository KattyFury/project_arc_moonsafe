# CLAUDE.md

> How to work with me. Read this before every session.

When I say "login dự án" (log in to the project): read this file → `git pull` → read `docs/CORE.md` (the settled core, above any old spec) → read `HANDOFF.md`. When done, commit + push. Contract addresses, deployment and architecture: see `AGENTS.md`, `README.md`, `HANDOFF.md`; do not copy them here.

---

## MoonSafe rules (read carefully, these were broken before)

### Discuss first, act later
- **"Bàn với mình" ("discuss with me") = only give options in chat, do NOT edit code.** Offer numbered choices (1a, 1b...), wait for my decision, then write code.
- **Ask before any code/spec change.** Fixing a bug I asked you to fix needs no second question.
- **User-visible copy** (home page, agent greeting, page descriptions...): always discuss first, don't write it alone. Exception (2026-10-22): I let Claude write copy in the voice of a **personal finance advisor**: professional and approachable. Keep that voice.
- **Slogan = "Your personal finance agent for Web3"** (changed 2026-10-29, previously "Onchain personal finance for Web3"). Slogans and intro copy must be concrete and honest: say what the app does, no promises, no wordplay.
- **The app is English only (decided 2026-10-24, for the hackathon).** All app text is English; the agent replies in the user's language (default English; if they write Vietnamese, reply in Vietnamese with "mình" for itself and "bạn" for the user). Default USD. Before deploying run `node scripts/check-lang.mjs` (must report "English only"). More languages come later, one careful pass each.
- Product angle (decided 2026-10-22): **onchain personal finance for web3 people**. Path: clarify income and spending → build an emergency fund → balance assets → unlock investing. Avoid sentimental quote-style lines (quotation marks + italics).
- **Don't force anyone to declare data. NO declaration cards or forms.** The agent chats naturally to advise; numbers the user mentions are saved in the browser (shown in Balance, corrected by telling the agent, deleted in Menu). Never bring back a form or a "Save declaration" button in any shape.

### Design
- **The reference design is Figma `WcPHEwY8xh33OvCFrxgLcQ`, sections "MoonSafe · Mobile web 393" (node 38:191) and "MoonSafe · Desktop web 1440" (node 38:192)**, nav in "MoonSafe · Components" (39:193). I describe design changes in words and Claude edits the code directly (no auto layout for me to drag by hand).
- Mobile: only the 5-tab row, NO logo + wallet row. Desktop: top bar with logo + pill tabs + wallet; content 1200 on a 12-column grid.
- **Every screen must fit one frame (393×852 and 1440×900) without scrolling.** With much content, group it (metrics on one row, toggles to switch tabs, merged cards) rather than stacking it. Chat is the exception (messages scroll). Measure scrollHeight before reporting done.
- **Presentation follows the nguyen0xhieu design system** (Design System artifact Rvs7H37zwuUdb8uBGf5rtM, Figma `hieu` IPyKVg7ylGw1mjMRyYVrL7): 0x Blue #1E6DF7, black #000, Apple system font (SF Pro), Web / Web Mobile text styles (14·16·20·24·32·40·48·56), radius 16, shadow Y2, spacing multiples of 8, at most 1 gradient area per screen, Lucide icons, no emoji. No reduced opacity for disabled states.
- **Logo** (Figma `WcPHEwY8xh33OvCFrxgLcQ`, node 34:303 logo, 32:367 logo + wordmark): blue circle with white core, **shown in full, NOT in a white box** (the white box is only for the X PFP). Next to text, **logo height = 1.5 × font size**. Never put the blue logo on a blue background.
- **Figma is the source of truth.** Whatever exists in Figma is taken exactly from Figma, not redrawn.
- **Big UI change → screenshot each screen (393×852) to the Desktop for my approval BEFORE deploying.** Don't finish the whole set and only then show it.

### Deploy
- Edit directly on `main` + deploy production moonsafe.app (no branch/preview). A GitHub push does **not** deploy; run the command in `AGENTS.md`.
- Wallet `0xEb2D…52F6` is the factory owner and fee recipient. Do not use any other wallet/DID/account for real actions on your own.

---

## Who I Am

I'm a **Vietnamese vibecoder** – I have ideas, not a programming background. I build products by handing off to AI, not by writing every line myself.

- I learn by **actually building**, not from tutorials.
- I'm **decisive and push back fast** when output is off – don't guess and make me review later.
- I **plan carefully in Claude Chat/Desktop**, then hand off to Claude Code to build step by step.
- What I build on Arc: small, useful dapps for **regular people** – simple, mobile-first, explainable in one sentence.

**GitHub**: KattyFury · **Local projects**: `D:\Files\Claude\`

---

## How to Talk to Me

- Respond in **Vietnamese**. Use English for code, technical terms, and proper nouns.
- **No filler**. **Answer directly**. Short task = short answer.
- **Don't assume I know jargon** – explain inline.
- **Multiple approaches → show options, don't pick silently.**
- **Not sure → say so, don't guess.**
- If needed, export a spec to the Desktop so I can plan it with Claude Chat.

---

## How to Write Code

- **Think before coding**: state assumptions before writing the first line.
- **Stay in scope**: I asked to fix one function, fix one function.
- **Ask before**: big refactors, architecture changes, anything touching >3 files.
- **Simplicity first**: no "flexibility" or "future-proofing" I didn't ask for.
- **Summarize after every edit**: what changed, why.
- **Loop until verified**: don't stop at "it should work" – verify (build, screenshot, read on-chain).
- Unfamiliar SDK (Privy, wagmi, viem...): open the `.d.ts` in `node_modules` first, don't guess.

## When Editing Existing Code

- **Touch only what you must**; match existing style.
- **Don't refactor what isn't broken**; unrelated dead code → mention, don't delete.
- **Clean up your own orphans** only.
- **The test**: every changed line must trace back to my actual request.

---

## Absolute DON'Ts

- ❌ Pick an approach silently when multiple options exist
- ❌ Write copy/design into code when I asked to discuss
- ❌ Touch files unrelated to the request
- ❌ Push to prod / run irreversible commands without explicit confirmation
- ❌ Hardcode API keys, secrets (keys are in `D:\Files\Claude\.secrets\keys.env`, `.env` is not committed)
- ❌ Suggest changing the tech stack unless I ask
- ❌ Stop at "it should work" – verify

---

## HANDOFF.md

Update `HANDOFF.md` after each session, current state only: what's done, what awaits my decision, approaches that failed. Move history to `docs/archive/`.

## How to Know You're Doing It Right

- Diffs contain only what I requested
- Clarifying questions come **before** implementation, not after mistakes
- No re-suggesting decisions already made
