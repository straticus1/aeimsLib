"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceEventType = void 0;
/**
 * Device event types
 */
var DeviceEventType;
(function (DeviceEventType) {
    DeviceEventType["CONNECTED"] = "connected";
    DeviceEventType["DISCONNECTED"] = "disconnected";
    DeviceEventType["STATUS_CHANGED"] = "status_changed";
    DeviceEventType["COMMAND_RECEIVED"] = "command_received";
    DeviceEventType["COMMAND_EXECUTED"] = "command_executed";
    DeviceEventType["ERROR"] = "error";
})(DeviceEventType || (exports.DeviceEventType = DeviceEventType = {}));
//# sourceMappingURL=device.js.map