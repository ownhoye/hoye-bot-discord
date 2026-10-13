/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

declare module "__patches__" {
    const never: never;
    export default never;
}

declare module "mellowtel-electron" {
    // No official type declarations are shipped as of writing, hence the loose typing.
    export default class Mellowtel {
        constructor(configurationKey: string);
        init(): Promise<void>;
        optIn(): Promise<void>;
        optOut(): Promise<void>;
        start(): Promise<void>;
        getOptInStatus(): Promise<boolean>;
        requestConsent(window: unknown, rewardMessage?: string): Promise<boolean>;
    }
}

declare module "@vencord/venmic" {
    export interface Node {
        [key: string]: string;
    }

    export interface LinkData {
        include: Node[];
        exclude: Node[];
        ignore_devices?: boolean;
        only_speakers?: boolean;
        only_default_speakers?: boolean;
        workaround?: Node[];
    }

    export class PatchBay {
        static hasPipeWire(): boolean;
        list(props?: string[]): Node[];
        link(data: LinkData): boolean;
        unlink(): boolean;
    }
}
