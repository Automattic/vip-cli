export = Table;
declare class Table {
    constructor(data: any, { border, keyColor, joiner, sort }?: {
        border?: boolean;
        keyColor?: string;
        joiner?: string;
        sort?: boolean;
    }, opts?: {});
    border: boolean;
    joiner: string;
    keyColor: string;
    sort: boolean;
    add(data: any, { joiner, sort }?: {
        joiner?: string;
        sort?: boolean;
    }): void;
}
