/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Link } from "@components/Link";

export interface CommonProps {
    repo: string;
    repoPending: boolean;
}

export function HashLink({ repo, hash, disabled = false }: { repo: string; hash: string; disabled?: boolean; }) {
    return (
        <Link href={`${repo}/releases/tag/${hash}`} disabled={disabled}>
            {hash.startsWith("v") ? hash : hash.slice(0, 7)}
        </Link>
    );
}
