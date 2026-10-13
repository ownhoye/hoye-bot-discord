/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { GithubIcon, WebsiteIcon } from "@components/Icons";

interface Props {
    text: string;
    href: string;
}

function safeOpenExternal(url: string) {
    if (typeof VencordNative !== "undefined" && VencordNative?.native?.openExternal) {
        VencordNative.native.openExternal(url);
    } else {
        window.open(url, "_blank");
    }
}

export function WebsiteButton({ text, href }: Props) {
    return (
        <Button variant="secondary" size="small" style={{ gap: 4 }} onClick={() => safeOpenExternal(href)}>
            <WebsiteIcon width={16} height={16} />
            {text}
        </Button>
    );
}

export function GithubButton({ text, href }: Props) {
    return (
        <Button variant="secondary" size="small" style={{ gap: 4 }} onClick={() => safeOpenExternal(href)}>
            <GithubIcon width={16} height={16} />
            {text}
        </Button>
    );
}
