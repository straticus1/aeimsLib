"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsProcessor = void 0;
/**
 * AnalyticsProcessor
 * Processes telemetry data into actionable insights.
 */
class AnalyticsProcessor {
    constructor(telemetry, metrics) {
        this.telemetry = telemetry;
        this.metrics = metrics;
        this.sessionData = new Map();
        this.setupListeners();
    }
    /**
     * Get usage analytics for a time period
     */
    async getUsageAnalytics(period) {
        const userSet = new Set();
        const deviceSet = new Set();
        const patternCounts = {};
        const deviceTypeCounts = {};
        let totalSessions = 0;
        let totalDuration = 0;
        // Get session data within period
        const sessionEvents = await this.getEventsInPeriod(period, ['session_start', 'session_end']);
        for (const event of sessionEvents) {
            if (event.type === 'session_start') {
                if (event.data?.userId)
                    userSet.add(event.data.userId);
                if (event.deviceId)
                    deviceSet.add(event.deviceId);
                totalSessions++;
            }
            if (event.type === 'session_end' && event.durationMs) {
                totalDuration += event.durationMs;
            }
            if (event.data?.patternType) {
                patternCounts[event.data.patternType] =
                    (patternCounts[event.data.patternType] || 0) + 1;
            }
            if (event.data?.deviceType) {
                deviceTypeCounts[event.data.deviceType] =
                    (deviceTypeCounts[event.data.deviceType] || 0) + 1;
            }
        }
        return {
            activeUsers: userSet.size,
            activeDevices: deviceSet.size,
            totalSessions,
            avgSessionDuration: totalSessions ? totalDuration / totalSessions : 0,
            patternUsage: patternCounts,
            deviceTypeUsage: deviceTypeCounts
        };
    }
    /**
     * Get performance analytics for a time period
     */
    async getPerformanceAnalytics(period) {
        const latencyStats = this.metrics.getMetricStats('device_latency_ms', period);
        const errorEvents = await this.getEventsInPeriod(period, ['device_error', 'pattern_error']);
        const deviceErrors = {};
        const patternErrors = {};
        let totalEvents = await this.countEventsInPeriod(period);
        for (const event of errorEvents) {
            if (event.type === 'device_error' && event.deviceId) {
                deviceErrors[event.deviceId] = (deviceErrors[event.deviceId] || 0) + 1;
            }
            if (event.type === 'pattern_error' && event.data?.patternType) {
                patternErrors[event.data.patternType] =
                    (patternErrors[event.data.patternType] || 0) + 1;
            }
        }
        return {
            avgLatency: latencyStats.avg || 0,
            p95Latency: this.metrics.getMetricStats('device_latency_ms', period).p90 || 0,
            errorRate: totalEvents ? errorEvents.length / totalEvents : 0,
            deviceErrors,
            patternErrors
        };
    }
    /**
     * Get user experience analytics for a time period
     */
    async getUserExperienceAnalytics(period) {
        const patternSuccessMap = {};
        const deviceReliabilityMap = {};
        let completedSessions = 0;
        let totalSessions = 0;
        let totalPatternDuration = 0;
        let patternCount = 0;
        const events = await this.getEventsInPeriod(period, ['pattern_start', 'pattern_end', 'session_start', 'session_end']);
        for (const event of events) {
            switch (event.type) {
                case 'session_start':
                    totalSessions++;
                    break;
                case 'session_end':
                    if (event.success)
                        completedSessions++;
                    break;
                case 'pattern_start':
                    if (event.data?.patternType && event.deviceId) {
                        const key = event.data.patternType;
                        patternSuccessMap[key] = patternSuccessMap[key] || { success: 0, total: 0 };
                        patternSuccessMap[key].total++;
                        const devKey = event.deviceId;
                        deviceReliabilityMap[devKey] = deviceReliabilityMap[devKey] || { success: 0, total: 0 };
                        deviceReliabilityMap[devKey].total++;
                    }
                    break;
                case 'pattern_end':
                    if (event.success && event.data?.patternType && event.deviceId) {
                        const key = event.data.patternType;
                        if (patternSuccessMap[key])
                            patternSuccessMap[key].success++;
                        const devKey = event.deviceId;
                        if (deviceReliabilityMap[devKey])
                            deviceReliabilityMap[devKey].success++;
                    }
                    if (event.durationMs) {
                        totalPatternDuration += event.durationMs;
                        patternCount++;
                    }
                    break;
            }
        }
        // Calculate success rates
        const patternSuccessRate = {};
        for (const [key, data] of Object.entries(patternSuccessMap)) {
            patternSuccessRate[key] = data.total ? data.success / data.total : 0;
        }
        const deviceReliability = {};
        for (const [key, data] of Object.entries(deviceReliabilityMap)) {
            deviceReliability[key] = data.total ? data.success / data.total : 0;
        }
        return {
            sessionCompletionRate: totalSessions ? completedSessions / totalSessions : 0,
            avgPatternDuration: patternCount ? totalPatternDuration / patternCount : 0,
            patternSuccessRate,
            deviceReliability
        };
    }
    setupListeners() {
        this.telemetry.on('event', (event) => {
            // Track session data
            if (event.sessionId) {
                if (event.type === 'session_start') {
                    this.sessionData.set(event.sessionId, {
                        userId: event.data?.userId || 'unknown',
                        deviceId: event.deviceId || 'unknown',
                        startTime: event.timestamp,
                        patterns: new Set(),
                        errors: 0
                    });
                }
                else if (event.type === 'session_end') {
                    this.sessionData.delete(event.sessionId);
                }
                else {
                    const session = this.sessionData.get(event.sessionId);
                    if (session) {
                        if (event.data?.patternType) {
                            session.patterns.add(event.data.patternType);
                        }
                        if (event.type.includes('error')) {
                            session.errors++;
                        }
                    }
                }
            }
        });
    }
    async getEventsInPeriod(period, types) {
        // This would normally fetch from storage/database
        // For now, we'll return mock data
        return [];
    }
    async countEventsInPeriod(period) {
        // This would normally count from storage/database
        // For now, return mock count
        return 1000;
    }
}
exports.AnalyticsProcessor = AnalyticsProcessor;
//# sourceMappingURL=AnalyticsProcessor.js.map