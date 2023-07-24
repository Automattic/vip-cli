export function appDestroy({ name, phase }?: {
    name: any;
    phase?: string;
}): any;
export function appRebuild({ name, phase, warnings }?: {
    name: any;
    phase?: string;
    warnings?: {};
}): any;
export function appRestart({ name, phase, warnings }?: {
    name: any;
    phase?: string;
    warnings?: {};
}): any;
export function appStart({ name, phase, warnings }?: {
    name: any;
    phase?: string;
    warnings?: {};
}): any;
export function appStop({ name, phase }?: {
    name: any;
    phase?: string;
}): any;
export function crash(): string;
export function experimental(on?: boolean): string;
export function init(): string;
export function newContent(type?: string): string;
export function noDockerDep(dep?: string): string;
export function poweroff({ phase }?: {
    phase?: string;
}): any;
export function print({ text, color }?: {
    text: any;
    color?: string;
}): any;
export function printFont({ text, color, font }?: {
    text: any;
    color?: string;
    font?: string;
}): any;
export function releaseChannel(channel?: string): string;
export function secretToggle(on?: boolean): string;
export function secretToggleDenied(on?: boolean): string;
export function badToken(): string;
