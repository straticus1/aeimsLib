"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorType = exports.DeviceState = exports.DeviceMode = void 0;
/**
 * Device operating modes
 */
var DeviceMode;
(function (DeviceMode) {
    DeviceMode["DEVELOPMENT"] = "development";
    DeviceMode["PRODUCTION"] = "production";
})(DeviceMode || (exports.DeviceMode = DeviceMode = {}));
/**
 * Device operating states
 */
var DeviceState;
(function (DeviceState) {
    DeviceState["INITIALIZED"] = "initialized";
    DeviceState["CONNECTED"] = "connected";
    DeviceState["DISCONNECTED"] = "disconnected";
    DeviceState["ERROR"] = "error";
    DeviceState["UPDATING"] = "updating";
})(DeviceState || (exports.DeviceState = DeviceState = {}));
/**
 * Device error types
 */
var ErrorType;
(function (ErrorType) {
    ErrorType["INVALID_OPERATION"] = "INVALID_OPERATION";
    ErrorType["DEVICE_NOT_FOUND"] = "DEVICE_NOT_FOUND";
    ErrorType["DUPLICATE_DEVICE"] = "DUPLICATE_DEVICE";
    ErrorType["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorType["STATE_LOAD_ERROR"] = "STATE_LOAD_ERROR";
    ErrorType["PERSISTENCE_ERROR"] = "PERSISTENCE_ERROR";
    ErrorType["CONFIGURATION_ERROR"] = "CONFIGURATION_ERROR";
    ErrorType["AUTH_ERROR"] = "AUTH_ERROR";
    ErrorType["QUOTA_EXCEEDED"] = "QUOTA_EXCEEDED";
})(ErrorType || (exports.ErrorType = ErrorType = {}));
//# sourceMappingURL=DeviceTypes.js.map