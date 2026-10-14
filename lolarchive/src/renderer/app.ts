/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export { };

interface PathInfo {
    path: string;
    name: string;
    isDir: boolean;
    size: number;
    isArchive: boolean;
}

interface Entry {
    path: string;
    type: "file" | "dir";
    size: number;
    mtime: number;
}

interface OpenResult {
    ok: boolean;
    error?: string;
    needsPassword?: boolean;
    wrongPassword?: boolean;
    path?: string;
    name?: string;
    encrypted?: boolean;
    compression?: "store" | "brotli";
    createdAt?: number;
    entries?: Entry[];
    totalSize?: number;
    fileSize?: number;
}

interface JobResult {
    ok: boolean;
    canceled?: boolean;
    error?: string;
    output?: string;
    destination?: string;
    entries?: number;
    bytes?: number;
    size?: number;
}

interface Progress {
    done: number;
    total: number;
    current: string;
}

interface Bridge {
    pickFiles(): Promise<string[]>;
    pickFolders(): Promise<string[]>;
    pickArchive(): Promise<string | null>;
    describePaths(paths: string[]): Promise<PathInfo[]>;
    takePendingPath(): Promise<string | null>;
    create(req: { sources: string[]; name: string; extension: string; password: string; compression: string; }): Promise<JobResult>;
    open(path: string, password?: string): Promise<OpenResult>;
    closeArchive(): Promise<void>;
    extract(only?: string[]): Promise<JobResult>;
    cancel(): Promise<void>;
    reveal(path: string): Promise<void>;
    pathForFile(file: File): string;
    onProgress(cb: (p: Progress) => void): void;
    onOpenPath(cb: (path: string) => void): void;
}

const api = (window as unknown as { lolarchive: Bridge; }).lolarchive;

// ─── Icons (static SVG markup only) ──────────────────────────────────────────

const ICONS = {
    archive: '<path d="M4 4h16a1 1 0 0 1 1 1v3H3V5a1 1 0 0 1 1-1Zm-0 6h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Zm6 3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2h-4Z"/>',
    file: '<path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V9h5.5L13 3.5Z"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4.6l2 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>',
    folderOpen: '<path d="M3 6a2 2 0 0 1 2-2h4.6l2 2H19a2 2 0 0 1 2 2v1H7.4a2 2 0 0 0-1.9 1.4L3 18V6Zm4.4 5H22l-2.6 7.6A2 2 0 0 1 17.5 20H3.8l2.7-8.3A1 1 0 0 1 7.4 11Z"/>',
    plus: '<path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4Z"/>',
    lock: '<path d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1Zm2 0h6V7a3 3 0 0 0-6 0v3Zm3 4a1.5 1.5 0 0 0-1 2.6V18h2v-1.4A1.5 1.5 0 0 0 12 14Z"/>',
    unlock: '<path d="M9 10h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V7a5 5 0 0 1 9.6-2l-1.8.8A3 3 0 0 0 9 7v3Z"/>',
    close: '<path d="M18.4 4 20 5.6 13.6 12l6.4 6.4-1.6 1.6-6.4-6.4L5.6 20 4 18.4 10.4 12 4 5.6 5.6 4l6.4 6.4L18.4 4Z"/>',
    extract: '<path d="M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3V3ZM4 18h16v3H4v-3Z"/>',
    eye: '<path d="M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/>',
    eyeOff: '<path d="m3.7 2.3 18 18-1.4 1.4-3.2-3.2A10.6 10.6 0 0 1 12 19c-5 0-9-4.5-10-7 .6-1.5 2.2-3.7 4.5-5.2L2.3 3.7l1.4-1.4ZM8 8.3A4 4 0 0 0 13.7 14L8 8.3ZM12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7L16 12.3V12a4 4 0 0 0-4.3-4L9.2 5.4c.9-.3 1.8-.4 2.8-.4Z"/>',
    info: '<path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm-1 8v7h2v-7h-2Zm0-3v2h2V7h-2Z"/>',
    warning: '<path d="M12 2.5 23 21H1L12 2.5ZM11 9v6h2V9h-2Zm0 8v2h2v-2h-2Z"/>',
    check: '<path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm4.3 6.3L10.5 14l-2.8-2.8-1.4 1.4 4.2 4.2 7.2-7.1-1.4-1.4Z"/>',
    chevronRight: '<path d="m9.4 6 6 6-6 6L8 16.6l4.6-4.6L8 7.4 9.4 6Z"/>',
    chevronDown: '<path d="m6 9.4 6 6 6-6L16.6 8 12 12.6 7.4 8 6 9.4Z"/>',
    upload: '<path d="M11 16V6.8L7.7 10.1 6.3 8.7 12 3l5.7 5.7-1.4 1.4L13 6.8V16h-2ZM4 18h16v3H4v-3Z"/>'
} as const;

type IconName = keyof typeof ICONS;

function icon(name: IconName, size = 20): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = ICONS[name];
    return svg;
}

// ─── DOM helper ──────────────────────────────────────────────────────────────

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Partial<Record<string, unknown>> = {},
    ...children: Child[]
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        if (key === "class") el.className = String(value);
        // CSSOM writes are allowed by the CSP, unlike style attributes.
        else if (key === "style") el.style.cssText = String(value);
        else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
        else if (key in el && typeof value !== "string") (el as unknown as Record<string, unknown>)[key] = value;
        else el.setAttribute(key, String(value));
    }
    for (const c of children) if (c) el.append(c);
    return el;
}

function button(label: string, onClick: () => void, opts: { variant?: "secondary" | "danger" | "link"; icon?: IconName; small?: boolean; disabled?: boolean; } = {}) {
    const cls = ["button", opts.variant, opts.small && "small"].filter(Boolean).join(" ");
    return h("button", { class: cls, type: "button", onclick: onClick, disabled: opts.disabled ?? false }, opts.icon && icon(opts.icon, 18), label);
}

function iconButton(name: IconName, label: string, onClick: () => void) {
    return h("button", { class: "icon-button", type: "button", title: label, "aria-label": label, onclick: onClick }, icon(name, 18));
}

// ─── Formatting ──────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
    const units = ["o", "Ko", "Mo", "Go", "To"];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    return `${i === 0 ? v : v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`.replace(".", ",");
}

function formatDate(ms: number): string {
    if (!ms) return "-";
    return new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function plural(n: number, word: string) {
    return `${n} ${word}${n > 1 ? "s" : ""}`;
}

// ─── Toasts & modals ─────────────────────────────────────────────────────────

function toast(message: string, kind: "success" | "error" | "info" = "info") {
    const el = h("div", { class: `toast ${kind}` }, icon(kind === "success" ? "check" : kind === "error" ? "warning" : "info", 18), message);
    document.getElementById("toasts")!.append(el);
    setTimeout(() => el.remove(), kind === "error" ? 6000 : 3500);
}

interface ModalSpec {
    title: string;
    subtitle?: string;
    content?: Child[];
    left?: HTMLElement[];
    right?: HTMLElement[];
    dismissible?: boolean;
    onDismiss?: () => void;
}

function openModal(spec: ModalSpec) {
    const root = document.getElementById("modal-root")!;
    const close = () => {
        backdrop.remove();
        document.removeEventListener("keydown", onKey);
    };
    const dismiss = () => {
        if (spec.dismissible === false) return;
        close();
        spec.onDismiss?.();
    };
    const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") dismiss();
    };

    const modal = h("div", { class: "modal", role: "dialog", "aria-modal": "true" },
        h("div", { class: "modal-header" },
            h("h2", { class: "modal-title" }, spec.title),
            spec.subtitle && h("div", { class: "modal-sub" }, spec.subtitle),
            spec.dismissible !== false && iconButton("close", "Fermer", dismiss)
        ),
        spec.content?.length ? h("div", { class: "modal-content" }, ...spec.content) : null,
        h("div", { class: "modal-footer" },
            ...(spec.left ?? []),
            h("div", { class: "right" }, ...(spec.right ?? []))
        )
    );
    const backdrop = h("div", {
        class: "modal-backdrop",
        onmousedown: (e: MouseEvent) => {
            if (e.target === backdrop) dismiss();
        }
    }, modal);

    document.addEventListener("keydown", onKey);
    root.append(backdrop);
    return { close, modal };
}

// ─── Progress ────────────────────────────────────────────────────────────────

let progressHandler: ((p: Progress) => void) | null = null;
api.onProgress(p => progressHandler?.(p));

async function runWithProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
    const fill = h("div", { class: "progress-fill" });
    const percent = h("span", {}, "0 %");
    const file = h("span", { class: "progress-file" }, "Préparation...");
    const cancel = button("Annuler", () => {
        cancel.disabled = true;
        api.cancel();
    }, { variant: "secondary" });

    // Delay showing the dialog so instant jobs do not flash it.
    let modal: ReturnType<typeof openModal> | null = null;
    const timer = setTimeout(() => {
        modal = openModal({
            title,
            dismissible: false,
            content: [h("div", { class: "progress" }, fill), h("div", { class: "progress-meta" }, file, percent)],
            right: [cancel]
        });
    }, 150);

    progressHandler = p => {
        const pct = p.total ? Math.min(100, Math.floor((p.done / p.total) * 100)) : 100;
        fill.style.width = `${pct}%`;
        percent.textContent = `${pct} %`;
        file.textContent = p.current;
    };
    try {
        return await task();
    } finally {
        progressHandler = null;
        clearTimeout(timer);
        (modal as ReturnType<typeof openModal> | null)?.close();
    }
}

// ─── State ───────────────────────────────────────────────────────────────────

type View = "home" | "create" | "browse";

const state = {
    view: "home" as View,
    items: [] as PathInfo[],
    name: "",
    extension: "lol",
    customExtension: "",
    compression: "normal",
    password: "",
    confirm: "",
    archive: null as OpenResult | null,
    selected: new Set<string>(),
    collapsed: new Set<string>(),
    filter: ""
};

const viewEl = document.getElementById("view")!;
const topActions = document.getElementById("top-actions")!;

function setView(view: View) {
    state.view = view;
    render();
}

function render() {
    topActions.replaceChildren(
        button("Nouvelle archive", () => setView("create"), { icon: "plus", variant: state.view === "create" ? undefined : "secondary", small: true }),
        button("Ouvrir", () => pickAndOpen(), { icon: "folderOpen", variant: "secondary", small: true })
    );
    viewEl.replaceChildren(state.view === "home" ? renderHome() : state.view === "create" ? renderCreate() : renderBrowse());
}

// ─── Home ────────────────────────────────────────────────────────────────────

function renderHome() {
    const card = (ic: IconName, title: string, text: string, onClick: () => void) =>
        h("button", { class: "home-card", type: "button", onclick: onClick },
            h("span", { class: "home-card-icon" }, icon(ic, 22)),
            h("span", { class: "home-card-title" }, title),
            h("span", { class: "home-card-text" }, text)
        );

    return h("div", { class: "home" },
        h("h1", { class: "home-title" }, "LolArchive"),
        h("p", { class: "home-sub" }, "Compresse et protège tes fichiers dans une archive .lol ou .xxx, chiffrée en AES-256-GCM + ChaCha20-Poly1305."),
        h("div", { class: "home-cards" },
            card("archive", "Créer une archive", "Choisis des fichiers ou des dossiers, ajoute un mot de passe et enregistre.", () => setView("create")),
            card("folderOpen", "Ouvrir une archive", "Parcours le contenu d'une archive et extrais tout ou une partie.", () => pickAndOpen())
        ),
        h("div", { class: "home-hint" }, "Astuce : glisse des fichiers directement dans la fenêtre.")
    );
}

// ─── Create ──────────────────────────────────────────────────────────────────

async function addPaths(paths: string[]) {
    if (!paths.length) return;
    const infos = await api.describePaths(paths);
    const known = new Set(state.items.map(i => i.path));
    for (const info of infos) if (!known.has(info.path)) state.items.push(info);
    if (!state.name && state.items.length) state.name = state.items[0].name.replace(/\.[^.]+$/, "") || state.items[0].name;
    if (state.view !== "create") setView("create");
    else render();
}

function passwordScore(pw: string): number {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (pw.length >= 16) score++;
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(r => r.test(pw)).length;
    if (classes >= 3) score++;
    return Math.max(1, Math.min(4, score));
}

function passwordInput(placeholder: string, value: string, onInput: (v: string) => void, onEnter?: () => void) {
    const input = h("input", {
        class: "input with-action",
        type: "password",
        placeholder,
        value,
        autocomplete: "new-password",
        spellcheck: "false",
        oninput: (e: Event) => onInput((e.target as HTMLInputElement).value),
        onkeydown: (e: KeyboardEvent) => {
            if (e.key === "Enter") onEnter?.();
        }
    });
    const toggle = h("button", { class: "icon-button", type: "button", title: "Afficher", "aria-label": "Afficher le mot de passe" }, icon("eye", 18));
    toggle.addEventListener("click", () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        toggle.replaceChildren(icon(show ? "eyeOff" : "eye", 18));
    });
    return { input, el: h("div", { class: "input-wrap" }, input, toggle) };
}

function renderCreate() {
    const total = state.items.reduce((n, i) => n + i.size, 0);

    const list = h("div", { class: "list" });
    if (!state.items.length) {
        list.append(h("div", { class: "empty" },
            icon("upload", 32),
            h("div", {}, "Aucun fichier pour l'instant."),
            h("div", {}, "Ajoute des fichiers ou glisse-les ici.")
        ));
    } else {
        for (const item of state.items) {
            list.append(h("div", { class: "row" },
                h("span", { class: `row-icon${item.isDir ? " dir" : ""}` }, icon(item.isDir ? "folder" : "file", 20)),
                h("span", { class: "row-name", title: item.path }, item.name),
                h("span", { class: "row-meta" }, formatSize(item.size)),
                iconButton("close", "Retirer", () => {
                    state.items = state.items.filter(i => i !== item);
                    render();
                })
            ));
        }
    }

    const pane = h("section", { class: "pane" },
        h("div", { class: "pane-header" },
            h("div", {},
                h("h1", { class: "pane-title" }, "Nouvelle archive"),
                h("div", { class: "pane-sub" }, state.items.length ? `${plural(state.items.length, "élément")} - ${formatSize(total)}` : "Ajoute ce que tu veux compresser")
            ),
            h("div", { class: "toolbar" },
                button("Fichiers", async () => addPaths(await api.pickFiles()), { icon: "file", variant: "secondary", small: true }),
                button("Dossier", async () => addPaths(await api.pickFolders()), { icon: "folder", variant: "secondary", small: true })
            )
        ),
        list
    );

    // Extension selector
    const customInput = h("input", {
        class: "input",
        placeholder: "ex : zip2, perso, abc",
        value: state.customExtension,
        maxlength: 12,
        oninput: (e: Event) => {
            const el = e.target as HTMLInputElement;
            el.value = el.value.replace(/[^a-z0-9]/gi, "").toLowerCase();
            state.customExtension = el.value;
            refresh();
        }
    });
    const customField = h("div", { class: "field" }, customInput);
    customField.hidden = state.extension !== "custom";
    const segmented = h("div", { class: "segmented" });
    for (const [value, label] of [["lol", ".lol"], ["xxx", ".xxx"], ["custom", "Autre"]]) {
        segmented.append(h("button", {
            type: "button",
            class: state.extension === value ? "active" : "",
            onclick: () => {
                state.extension = value;
                for (const b of segmented.children) b.classList.toggle("active", b === segmented.children[["lol", "xxx", "custom"].indexOf(value)]);
                customField.hidden = value !== "custom";
                if (value === "custom") customInput.focus();
                refresh();
            }
        }, label));
    }

    const nameInput = h("input", {
        class: "input",
        value: state.name,
        placeholder: "archive",
        maxlength: 120,
        oninput: (e: Event) => {
            state.name = (e.target as HTMLInputElement).value;
            refresh();
        }
    });

    const compression = h("select", {
        class: "select",
        onchange: (e: Event) => { state.compression = (e.target as HTMLSelectElement).value; }
    });
    for (const [value, label] of [["store", "Aucune (le plus rapide)"], ["fast", "Rapide"], ["normal", "Normale"], ["max", "Maximale (lent)"]]) {
        compression.append(h("option", { value, selected: state.compression === value }, label));
    }

    // Password + strength
    const bars = [0, 1, 2, 3].map(() => h("span"));
    const strengthLabel = h("span", { class: "strength-label" });
    const strength = h("div", { class: "strength" }, h("div", { class: "strength-bar" }, ...bars), strengthLabel);
    const mismatch = h("div", { class: "error-text" }, "Les mots de passe ne correspondent pas.");
    const pw = passwordInput("Laisser vide pour ne pas chiffrer", state.password, v => {
        state.password = v;
        refresh();
    });
    const confirm = passwordInput("Confirmer le mot de passe", state.confirm, v => {
        state.confirm = v;
        refresh();
    });
    const noPasswordNotice = h("div", { class: "notice warning" }, icon("warning", 16), "Sans mot de passe, l'archive est compressée mais pas chiffrée : n'importe qui avec LolArchive peut l'ouvrir.");
    const passwordNotice = h("div", { class: "notice" }, icon("lock", 16), "Le mot de passe ne peut pas être récupéré. Si tu l'oublies, le contenu est perdu.");

    const createButton = button("Créer l'archive", () => doCreate(), { icon: "archive" });
    const extLabel = h("span", { class: "field-help" });

    function refresh() {
        const score = passwordScore(state.password);
        const colors = ["", "var(--status-danger)", "var(--status-warning)", "var(--status-positive)", "var(--status-positive)"];
        bars.forEach((b, i) => { b.style.background = i < score ? colors[score] : ""; });
        strengthLabel.textContent = state.password ? ["", "Faible", "Moyen", "Bon", "Excellent"][score] : "";
        strength.hidden = !state.password;
        confirm.el.hidden = !state.password;
        const mismatched = !!state.password && !!state.confirm && state.password !== state.confirm;
        mismatch.hidden = !mismatched;
        confirm.input.classList.toggle("invalid", mismatched);
        noPasswordNotice.hidden = !!state.password;
        passwordNotice.hidden = !state.password;
        const ext = currentExtension();
        extLabel.textContent = `Fichier : ${(state.name.trim() || "archive")}.${ext || "?"}`;
        createButton.disabled = !state.items.length || !ext || (!!state.password && state.password !== state.confirm);
    }

    const side = h("aside", { class: "side" },
        h("div", { class: "field" }, h("label", { class: "field-label" }, "Nom de l'archive"), nameInput, extLabel),
        h("div", { class: "field" }, h("label", { class: "field-label" }, "Extension"), segmented, customField),
        h("div", { class: "field" }, h("label", { class: "field-label" }, "Compression"), compression),
        h("div", { class: "field" },
            h("label", { class: "field-label" }, "Mot de passe"),
            pw.el, strength, confirm.el, mismatch
        ),
        noPasswordNotice,
        passwordNotice,
        h("div", { class: "spacer" }),
        createButton
    );

    refresh();
    return h("div", { class: "split" }, pane, side);
}

function currentExtension(): string {
    return state.extension === "custom" ? state.customExtension : state.extension;
}

async function doCreate() {
    const result = await runWithProgress("Création de l'archive", () => api.create({
        sources: state.items.map(i => i.path),
        name: state.name,
        extension: currentExtension(),
        password: state.password,
        compression: state.compression
    }));
    if (result.canceled) return;
    if (!result.ok) {
        toast(result.error ?? "Erreur inconnue.", "error");
        return;
    }

    const encrypted = !!state.password;
    state.password = "";
    state.confirm = "";
    state.items = [];
    state.name = "";
    render();

    const ratio = result.bytes ? Math.round((1 - (result.size ?? 0) / result.bytes) * 100) : 0;
    const m = openModal({
        title: "Archive créée",
        subtitle: result.output,
        content: [h("div", { class: "detail-list" },
            detail("Éléments", String(result.entries ?? 0)),
            detail("Taille d'origine", formatSize(result.bytes ?? 0)),
            detail("Taille de l'archive", formatSize(result.size ?? 0)),
            detail("Gain", ratio > 0 ? `${ratio} %` : "aucun"),
            detail("Chiffrement", encrypted ? "AES-256-GCM + ChaCha20-Poly1305" : "aucun")
        )],
        left: [button("Afficher dans le dossier", () => api.reveal(result.output!), { variant: "link" })],
        right: [button("OK", () => m.close())]
    });
}

function detail(label: string, value: string) {
    return h("div", { class: "detail" }, h("span", {}, label), h("span", {}, value));
}

// ─── Open / browse ───────────────────────────────────────────────────────────

async function pickAndOpen() {
    const path = await api.pickArchive();
    if (path) await openPath(path);
}

async function openPath(path: string, password?: string, wasWrong = false): Promise<void> {
    if (!password && !wasWrong) {
        const first = await api.open(path);
        if (first.ok) return showArchive(first);
        if (!first.needsPassword) {
            toast(first.error ?? "Impossible d'ouvrir l'archive.", "error");
            return;
        }
    }

    let value = "";
    const error = h("div", { class: "error-text" }, "Mot de passe incorrect.");
    error.hidden = !wasWrong;
    const submit = async () => {
        if (!value) return;
        openBtn.disabled = true;
        openBtn.textContent = "Vérification...";
        const r = await api.open(path, value);
        value = "";
        if (r.ok) {
            m.close();
            showArchive(r);
            return;
        }
        openBtn.disabled = false;
        openBtn.textContent = "Ouvrir";
        if (r.needsPassword) {
            error.hidden = false;
            pw.input.value = "";
            pw.input.focus();
        } else {
            m.close();
            toast(r.error ?? "Impossible d'ouvrir l'archive.", "error");
        }
    };
    const pw = passwordInput("Mot de passe", "", v => { value = v; }, submit);
    pw.input.autocomplete = "current-password";
    const openBtn = button("Ouvrir", submit);
    const m = openModal({
        title: "Archive protégée",
        subtitle: path.split(/[\\/]/).pop(),
        content: [pw.el, error],
        right: [button("Annuler", () => m.close(), { variant: "link" }), openBtn]
    });
    setTimeout(() => pw.input.focus(), 0);
}

function showArchive(result: OpenResult) {
    state.archive = result;
    state.selected = new Set();
    state.filter = "";
    const entries = result.entries ?? [];
    state.collapsed = new Set(entries.length > 300 ? entries.filter(e => e.type === "dir" && e.path.includes("/")).map(e => e.path) : []);
    setView("browse");
}

interface TreeNode {
    entry: Entry;
    depth: number;
    name: string;
    children: TreeNode[];
}

function buildTree(entries: Entry[]): TreeNode[] {
    const byPath = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];
    const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
    for (const entry of sorted) {
        const parts = entry.path.split("/");
        const node: TreeNode = { entry, depth: parts.length - 1, name: parts[parts.length - 1], children: [] };
        byPath.set(entry.path, node);
        const parent = byPath.get(parts.slice(0, -1).join("/"));
        (parent ? parent.children : roots).push(node);
    }
    const order = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => (a.entry.type === b.entry.type ? a.name.localeCompare(b.name) : a.entry.type === "dir" ? -1 : 1));
        nodes.forEach(n => order(n.children));
    };
    order(roots);
    return roots;
}

const MAX_ROWS = 3000;

function renderBrowse() {
    const a = state.archive!;
    const entries = a.entries ?? [];
    const tree = buildTree(entries);
    const fileCount = entries.filter(e => e.type === "file").length;

    const list = h("div", { class: "list" });
    const extractSelected = button("Extraire la sélection", () => doExtract([...state.selected]), { icon: "extract", variant: "secondary" });

    const isCovered = (path: string) => {
        const parts = path.split("/");
        for (let i = parts.length; i > 0; i--) if (state.selected.has(parts.slice(0, i).join("/"))) return true;
        return false;
    };

    function drawList() {
        list.replaceChildren();
        const rows: HTMLElement[] = [];
        const filter = state.filter.trim().toLowerCase();

        const pushRow = (node: TreeNode, depth: number, showPath: boolean) => {
            const e = node.entry;
            const isDir = e.type === "dir";
            const collapsed = state.collapsed.has(e.path);
            const checked = isCovered(e.path);
            const chevron = h("span", {
                class: `row-chevron${isDir && node.children.length && !showPath ? "" : " hidden"}`,
                onclick: () => {
                    if (collapsed) state.collapsed.delete(e.path);
                    else state.collapsed.add(e.path);
                    drawList();
                }
            }, icon(collapsed ? "chevronRight" : "chevronDown", 16));
            const checkbox = h("input", {
                type: "checkbox",
                checked,
                disabled: checked && !state.selected.has(e.path),
                onchange: () => {
                    if (state.selected.has(e.path)) state.selected.delete(e.path);
                    else {
                        state.selected.add(e.path);
                        // A selected folder already covers its contents.
                        for (const p of [...state.selected]) if (p.startsWith(e.path + "/")) state.selected.delete(p);
                    }
                    drawList();
                }
            });
            const row = h("div", { class: `row${checked ? " selected" : ""}` },
                checkbox,
                h("span", { style: `width:${depth * 18}px;flex-shrink:0` }),
                chevron,
                h("span", { class: `row-icon${isDir ? " dir" : ""}` }, icon(isDir ? (collapsed ? "folder" : "folderOpen") : "file", 18)),
                h("span", { class: "row-name", title: e.path }, showPath ? e.path : node.name),
                h("span", { class: "row-meta" }, isDir ? "" : formatSize(e.size)),
                h("span", { class: "row-meta" }, formatDate(e.mtime))
            );
            rows.push(row);
        };

        if (filter) {
            const walk = (nodes: TreeNode[]) => {
                for (const n of nodes) {
                    if (rows.length >= MAX_ROWS) return;
                    if (n.entry.path.toLowerCase().includes(filter)) pushRow(n, 0, true);
                    walk(n.children);
                }
            };
            walk(tree);
        } else {
            const walk = (nodes: TreeNode[]) => {
                for (const n of nodes) {
                    if (rows.length >= MAX_ROWS) return;
                    pushRow(n, n.depth, false);
                    if (!state.collapsed.has(n.entry.path)) walk(n.children);
                }
            };
            walk(tree);
        }

        if (!rows.length) list.append(h("div", { class: "empty" }, filter ? "Aucun résultat." : "Cette archive est vide."));
        else list.append(...rows);
        if (rows.length >= MAX_ROWS) list.append(h("div", { class: "list-note" }, `Affichage limité à ${MAX_ROWS} lignes : utilise la recherche pour affiner.`));

        extractSelected.disabled = state.selected.size === 0;
        extractSelected.lastChild!.textContent = state.selected.size ? `Extraire la sélection (${state.selected.size})` : "Extraire la sélection";
    }

    const search = h("input", {
        class: "input",
        placeholder: "Rechercher dans l'archive",
        value: state.filter,
        oninput: (e: Event) => {
            state.filter = (e.target as HTMLInputElement).value;
            drawList();
        }
    });

    const pane = h("section", { class: "pane" },
        h("div", { class: "pane-header" },
            h("div", { style: "min-width:0" },
                h("h1", { class: "pane-title", title: a.path }, a.name ?? "Archive"),
                h("div", { class: "pane-sub" }, `${plural(fileCount, "fichier")} - ${formatSize(a.totalSize ?? 0)} une fois extrait`)
            ),
            h("span", { class: `badge${a.encrypted ? " secure" : ""}` }, icon(a.encrypted ? "lock" : "unlock", 14), a.encrypted ? "Chiffrée" : "Non chiffrée")
        ),
        h("div", { style: "margin-bottom:12px" }, search),
        list
    );

    const ratio = a.totalSize ? Math.max(0, Math.round((1 - (a.fileSize ?? 0) / a.totalSize) * 100)) : 0;
    const side = h("aside", { class: "side" },
        h("div", { class: "stats" },
            stat(formatSize(a.fileSize ?? 0), "Taille de l'archive"),
            stat(`${ratio} %`, "Gain de place"),
            stat(String(fileCount), "Fichiers"),
            stat(a.compression === "brotli" ? "Brotli" : "Aucune", "Compression")
        ),
        h("div", { class: "detail-list" },
            detail("Créée le", formatDate(a.createdAt ?? 0)),
            detail("Chiffrement", a.encrypted ? "AES-256-GCM + ChaCha20" : "aucun")
        ),
        h("div", { class: "spacer" }),
        extractSelected,
        button("Tout extraire", () => doExtract(), { icon: "extract" }),
        button("Fermer l'archive", () => {
            api.closeArchive();
            state.archive = null;
            setView("home");
        }, { variant: "link" })
    );

    drawList();
    return h("div", { class: "split" }, pane, side);
}

function stat(value: string, label: string) {
    return h("div", { class: "stat" }, h("div", { class: "stat-value" }, value), h("div", { class: "stat-label" }, label));
}

async function doExtract(only?: string[]) {
    const result = await runWithProgress("Extraction", () => api.extract(only));
    if (result.canceled) return;
    if (!result.ok) {
        toast(result.error ?? "Erreur inconnue.", "error");
        return;
    }
    const m = openModal({
        title: "Extraction terminée",
        subtitle: result.destination,
        left: [button("Afficher dans le dossier", () => api.reveal(result.destination!), { variant: "link" })],
        right: [button("OK", () => m.close())]
    });
}

// ─── Drag & drop ─────────────────────────────────────────────────────────────

const overlay = document.getElementById("drop-overlay")!;
let dragDepth = 0;

window.addEventListener("dragenter", e => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    if (++dragDepth === 1) overlay.hidden = false;
});
window.addEventListener("dragleave", () => {
    if (--dragDepth <= 0) {
        dragDepth = 0;
        overlay.hidden = true;
    }
});
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", async e => {
    e.preventDefault();
    dragDepth = 0;
    overlay.hidden = true;
    if (document.querySelector(".modal-backdrop")) return;
    const paths = [...(e.dataTransfer?.files ?? [])].map(f => api.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    if (paths.length === 1 && state.view !== "create") {
        const [info] = await api.describePaths(paths);
        if (info?.isArchive) {
            await openPath(info.path);
            return;
        }
    }
    await addPaths(paths);
});

// ─── Boot ────────────────────────────────────────────────────────────────────

document.getElementById("brand-icon")!.append(icon("archive", 24));
document.getElementById("drop-icon")!.append(icon("upload", 40));
api.onOpenPath(path => { openPath(path); });
render();
api.takePendingPath().then(p => { if (p) openPath(p); });
