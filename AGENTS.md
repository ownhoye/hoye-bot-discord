# LoliCord Development Guidelines & Agent Instructions

## 1. UI & Visual Aesthetics
- **Strict Zero-Emoji Policy**: NEVER use any emojis in any user-facing text, buttons, modals, toasts, badge labels, or UI cards. Always use clean, minimalist SVG vector icons and crisp typography.
- **Strictly Official Discord Components Only**: Always utilize official Discord design system primitives (`ModalRoot`, `ModalHeader`, `ModalContent`, `ModalFooter`, `ModalCloseButton`, `Button`, `Text`, `FormSwitch`, `Select`, `TextInput`). Never invent custom unstyled HTML buttons or non-Discord modal wrappers.
- **No Fluorescent or Flashy Colors**: Never use bright neon gradients, fluorescent borders, or flashy glowing badges. Always stick strictly to official Discord design tokens (`var(--header-primary)`, `var(--header-secondary)`, `var(--text-normal)`, `var(--text-muted)`, `var(--brand-500)`, `var(--background-floating)`).
- **Proper Layout Framing & High-Contrast Typography**: Ensure all modals, dialogues, and UI cards are cleanly padded and framed (e.g. `padding: 20px 24px` for modal headers/footers, balanced margins around media/video elements). All titles and primary headers MUST be high-contrast white (`#ffffff` / `var(--header-primary)`), and subtitles/descriptions MUST be clean readable grey (`#949ba4` / `var(--text-muted)`). NEVER allow modal texts to display as dark/black on dark backgrounds. Distribute multiple modal actions cleanly (e.g. secondary actions on the left, primary dialog actions on the right).
- **Seamless Discord Look & Feel**: The UI must look 100% native, responsive, uncluttered, and perfectly integrated into Discord's dark/light themes without out-of-place custom headers or clunky icons.

## 2. Code Standards & Headers
- **Mandatory Copyright & License Header**: Every new or modified source code file MUST begin with the exact copyright header:
```ts
/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
```
- **Plugins Disabled by Default**: Unless explicitly requested otherwise, any newly created or added plugins must NOT be enabled by default (`enabledByDefault: false` or omitted).
- **Strict TypeScript**: Clean typing, robust error handling, no unsafe type casts, and no extraneous external dependencies.

## 3. Cryptography & Security Integrity
- **Robust Encryption**: High-security dual-layer encryption (AES-256-GCM + ChaCha20-Poly1305) with PBKDF2 / Argon2 key derivation.
- **Complete Payload Integrity**: Ensure all cryptographic parameters (ChaCha nonce, Poly1305 auth tags, salt, ciphertexts) are preserved across export/import, sync, and storage pipelines to prevent decryption corruption.
- **Safe Credential Handling**: Zero plaintext leakage of secrets, tokens, or master passwords; perform clean memory clearing where applicable.

## 4. Performance, Fluidity & Automation
- **Instant 100% Automatic 2FA**: The 2FA autofill engine must automatically detect 2FA input fields and type the matching 6-digit code instantaneously without requiring manual clicks or confirmation dialogs.
- **Non-Blocking UI**: Debounce heavy event listeners (`mousemove`, `input`, `scroll`), offload heavy computation asynchronously, and use scoped MutationObservers.
- **State Reactivity**: Always return immutable copies (e.g. `[...array]`) in store getters so React states immediately re-render on updates without requiring app reloads.

## 5. Zero Side-Effects & Edge Case Handling
- **Scoped Targeting**: Never alter global Discord elements when modifying LoliCord-specific features (e.g., the official Discord system DM must retain "Official Discord Message", while only the LoliCord DM shows "Official LoliCord Message").
- **Clean Teardown**: Always unpatch stores, disconnect MutationObservers, remove DOM listeners, and clear intervals/timeouts in plugin `stop()` methods.

## 6. Build & Injection Workflow
- Always compile with `pnpm build` and inject into Discord with `pnpm inject` to verify changes in runtime.

## 7. Git Commit & Versioning Workflow
- **Smart Commit Timing**: Only create git commits once a requested feature, refactor, or bugfix is completely resolved, properly compiled (`pnpm build`), and verified. NEVER commit intermediate, incomplete, or broken debugging states.
- **Strict English & Descriptive Commit Messages**: All git commit messages must ALWAYS be written in English, concise (a few short words), descriptive, and follow conventional commit formats (e.g., `fix(totpManager): resolve UserStore reference error`, `feat(plugins): add custom profile decorators`).
- **Local Commits Only (Never Run Git Push)**: ONLY execute local commits (`git add` + `git commit`). NEVER run `git push` in background commands, as it hangs indefinitely waiting for VPN/SSH network connections and blocks queued user messages in the chat interface. The user manages and executes `git push` manually when their VPN is active.

## 8. Internationalization & Translation System
- **Mandatory Translation Coverage**: Every newly introduced feature, UI string, plugin setting description, button label, modal title, error message, or toast MUST be registered in LoliCord's translation system (`src/lolicordplugins/autoTranslateLoliCord/index.ts`).
- **Multi-Language Support**: Ensure translation mappings (`en`, `fr`, `ar`, `es`, `ru`, `zh`) are provided using the `t()` / `tPlugin()` helper functions so the entire interface remains fully translated across all supported client languages.