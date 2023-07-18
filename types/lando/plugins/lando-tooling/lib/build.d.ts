declare function _exports(config: any, injected: any): {
    command: string;
    describe: string;
    run: (answers: Record<string, unknown>) => Promise<unknown>;
    options: Record<string, unknown>;
};
export = _exports;
