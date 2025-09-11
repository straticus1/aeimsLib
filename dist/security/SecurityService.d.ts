import { SecurityService, SecurityPolicy, EncryptedData, TokenPayload, SecurityContext, AuditLogEntry } from '../interfaces/security';
import { MonitoringService } from '../interfaces/monitoring';
export declare class DefaultSecurityService implements SecurityService {
    private static instance;
    private policy;
    private monitoring?;
    private logger;
    private redis?;
    private activeKey?;
    private keyId?;
    private constructor();
    static getInstance(): DefaultSecurityService;
    initialize(policy: SecurityPolicy): Promise<void>;
    setMonitoringService(service: MonitoringService): void;
    encrypt(data: Buffer): Promise<EncryptedData>;
    decrypt(encrypted: EncryptedData): Promise<Buffer>;
    generateToken(payload: Partial<TokenPayload>): Promise<string>;
    verifyToken(token: string): Promise<TokenPayload>;
    createSecurityContext(token: string): Promise<SecurityContext>;
    validatePermissions(context: SecurityContext, action: string): boolean;
    enforceRateLimit(userId: string, action: string): Promise<boolean>;
    logAudit(entry: AuditLogEntry): Promise<void>;
    private logSecurityEvent;
    private rotateEncryptionKey;
}
