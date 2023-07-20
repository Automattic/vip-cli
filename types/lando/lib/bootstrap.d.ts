import { LandoConfig } from "./lando";

export function buildConfig(options: Partial<LandoConfig>): LandoConfig;
export function dc(shell: any, bin: any, cmd: any, { compose, project, opts }: {
    compose: any;
    project: any;
    opts?: {};
}): any;
export function getApp(files: any, userConfRoot: any): any;
export function getLandoFiles(files?: any[], startFrom?: string): any;
export function getTasks(config?: {}, argv?: {}, tasks?: any[]): any[];
export function setupCache(log: any, config: any): import("lando/lib/cache");
export function setupEngine(config: any, cache: any, events: any, log: any, shell: any, id: any): import("lando/lib/engine");
export function setupMetrics(log: any, config: any): import("lando/lib/metrics");
