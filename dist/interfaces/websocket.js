"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageType = void 0;
/**
 * WebSocket message types
 */
var MessageType;
(function (MessageType) {
    MessageType["JOIN_SESSION"] = "join_session";
    MessageType["LEAVE_SESSION"] = "leave_session";
    MessageType["DEVICE_COMMAND"] = "device_command";
    MessageType["DEVICE_STATUS"] = "device_status";
    MessageType["SESSION_STATUS"] = "session_status";
    MessageType["COMMAND_RESULT"] = "command_result";
    MessageType["ERROR"] = "error";
    MessageType["PING"] = "ping";
    MessageType["PONG"] = "pong";
})(MessageType || (exports.MessageType = MessageType = {}));
//# sourceMappingURL=websocket.js.map