export = Factory;
declare class Factory {
    constructor(classes?: ({
        name: string;
        builder: {
            new (id: any, info?: {}, ...sources: any[]): {
                id: any;
                info: {};
                data: any;
            };
        };
    } | {
        name: string;
        builder: {
            new (id: any, config?: {}): {
                id: any;
                config: {
                    proxy: any;
                    services: any;
                    tooling: any;
                };
            };
        };
    })[]);
    registry: ({
        name: string;
        builder: {
            new (id: any, info?: {}, ...sources: any[]): {
                id: any;
                info: {};
                data: any;
            };
        };
    } | {
        name: string;
        builder: {
            new (id: any, config?: {}): {
                id: any;
                config: {
                    proxy: any;
                    services: any;
                    tooling: any;
                };
            };
        };
    })[];
    add({ name, builder, config, parent }: {
        name: any;
        builder: any;
        config?: {};
        parent?: any;
    }): any;
    get(name?: string): any;
}
