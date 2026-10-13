/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { React, TextInput } from "@webpack/common";

interface TextInputProps {
    /**
     * The current value. If this changes externally after mount (e.g. async
     * settings load), the input will resync to it as long as the user isn't
     * currently mid-typing an invalid value.
     */
    value: string;
    /**
     * This will only be called if the new value passed validate()
     */
    onChange(newValue: string): void;
    /**
     * Optionally validate the user input
     * Return true if the input is valid
     * Otherwise, return a string containing the reason for this input being invalid
     */
    validate(v: string): true | string;

    placeholder?: string;
}

/**
 * A very simple wrapper around Discord's TextInput that validates input and shows
 * the user an error message and only calls your onChange when the input is valid
 */
export function CheckedTextInput({ value: initialValue, onChange, validate, placeholder }: TextInputProps) {
    const [value, setValue] = React.useState(initialValue);
    const [error, setError] = React.useState<string>();

    // Keep the input in sync if the underlying value changes from outside
    // (e.g. settings finish loading/syncing after this component already mounted).
    // We only re-sync while there's no pending validation error, so we don't
    // fight the user while they're actively typing an invalid value.
    React.useEffect(() => {
        if (error === undefined) setValue(initialValue);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialValue]);

    function handleChange(v: string) {
        setValue(v);
        const res = validate(v);
        if (res === true) {
            setError(void 0);
            onChange(v);
        } else {
            setError(res);
        }
    }

    return (
        <>
            <TextInput
                type="text"
                value={value}
                onChange={handleChange}
                error={error}
                placeholder={placeholder}
            />
        </>
    );
}
