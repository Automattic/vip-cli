declare function _exports(log?: Log): (urls: any[], { max, waitCodes }?: {
    max?: Integer;
    waitCode?: any[];
}) => any[];
export = _exports;
import Log = require("lando/lib/logger");
