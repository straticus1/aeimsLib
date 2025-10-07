/**
 * Device pricing configuration
 */
export interface DevicePricing {
  baseRate: number;
  currency: string;
  billingModel: BillingModel;
  minimumCharge?: number;
  maximumCharge?: number;
  discounts?: PricingDiscount[];
}

/**
 * Billing models
 */
export enum BillingModel {
  PER_MINUTE = 'per_minute',
  PER_HOUR = 'per_hour',
  FLAT_RATE = 'flat_rate',
  TIERED = 'tiered'
}

/**
 * Pricing discount configuration
 */
export interface PricingDiscount {
  type: DiscountType;
  value: number;
  conditions?: Record<string, any>;
}

/**
 * Discount types
 */
export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
  BULK = 'bulk',
  LOYALTY = 'loyalty'
}

export default DevicePricing;