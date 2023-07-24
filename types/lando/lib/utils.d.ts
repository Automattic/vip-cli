export function getAppMounts(app: any): any;
export function dockerComposify(data: any): any;
export function appMachineName(data: any): string;
export function dumpComposeData(data: any, dir: any): any;
export function loadComposeFiles(files: any, dir: any): any;
export function getCliEnvironment(more?: {}): any;
export function getId(c: any): any;
export function getInfoDefaults(app: any): any;
export function getGlobals(app: any): any;
export function getServices(composeData: any): any;
export function getUser(service: any, info?: any[]): any;
export function metricsParse(app: any): {
    app: any;
    type: any;
};
export function normalizer(data: any): any;
export function makeExecutable(files: any, base?: string): void;
export function moveConfig(src: any, dest?: string): string;
export function shellEscape(command: any, wrap?: boolean, args?: string[]): any;
export function toLandoContainer({ Names, Labels, Id, Status }: {
    Names: any;
    Labels: any;
    Id: any;
    Status: any;
}): {
    id: any;
    service: any;
    name: any;
    app: any;
    src: any;
    kind: string;
    lando: boolean;
    instance: any;
    status: any;
};
export function toObject(keys: any, data?: {}): any;
export function validateFiles(files?: any[], base?: string): any;
