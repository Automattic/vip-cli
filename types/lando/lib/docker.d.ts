export = Landerode;
declare class Landerode extends Dockerode {
    constructor(opts?: {}, id?: string, promise?: any);
    id: string;
    createNet(name: any, opts?: {}): Promise<Dockerode.Network>;
    scan(cid: string): Promise<Dockerode.ContainerInspectInfo>;
    isRunning(cid: any): any;
    list(options?: {}): any;
    remove(cid: any, opts?: {
        v: boolean;
        force: boolean;
    }): any;
    stop(cid: any, opts?: {}): any;
}
import Dockerode = require("dockerode");
