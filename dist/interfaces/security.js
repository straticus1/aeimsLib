"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityEventType = void 0;
/**
 * Security event types
 */
var SecurityEventType;
(function (SecurityEventType) {
    SecurityEventType["AUTH_SUCCESS"] = "auth_success";
    SecurityEventType["AUTH_FAILURE"] = "auth_failure";
    SecurityEventType["TOKEN_GENERATED"] = "token_generated";
    SecurityEventType["TOKEN_REVOKED"] = "token_revoked";
    SecurityEventType["ENCRYPTION_ERROR"] = "encryption_error";
    SecurityEventType["RATE_LIMIT_EXCEEDED"] = "rate_limit_exceeded";
    SecurityEventType["PERMISSION_DENIED"] = "permission_denied";
    SecurityEventType["SUSPICIOUS_ACTIVITY"] = "suspicious_activity";
})(SecurityEventType || (exports.SecurityEventType = SecurityEventType = {}));
//# sourceMappingURL=security.js.map