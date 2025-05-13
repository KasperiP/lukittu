export enum BuiltByBitMetadataKeys {
  BBB_PURCHASE_ID = 'BBB_PURCHASE_ID', // Unique identifier for the purchase transaction
  BBB_USER_ID = 'BBB_USER_ID', // User's unique identifier on BuiltByBit platform
  BBB_ADDON_ID = 'BBB_ADDON_ID', // Unique identifier for the addon/plugin on BuiltByBit
  BBB_RESOURCE_ID = 'BBB_RESOURCE_ID', // Resource identifier within BuiltByBit system
}

export enum StripeMetadataKeys {
  STRIPE_SUB = 'STRIPE_SUB', // Stripe subscription identifier
  STRIPE_CS = 'STRIPE_CS', // Stripe checkout session identifier
  STRIPE_CUS = 'STRIPE_CUS', // Stripe customer identifier
  STRIPE_PROD = 'STRIPE_PROD', // Stripe product identifier
  STRIPE_PI = 'STRIPE_PI', // Stripe payment intent identifier
}

export enum PolymartMetadataKeys {
  POLYMART_USER_ID = 'POLYMART_USER_ID', // Unique identifier for the user on Polymart
  POLYMART_PRODUCT_ID = 'POLYMART_PRODUCT_ID', // Unique identifier for the product on Polymart
  POLYMART_PURCHASE_ID = 'POLYMART_PURCHASE_ID', // Unique identifier for the purchase transaction on Polymart
}
