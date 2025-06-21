import {
  Customer,
  decryptLicenseKey,
  License,
  Metadata,
  Product,
} from '@lukittu/shared';

// Helper function to truncate text with ellipsis
const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

// Helper function to format list with limits
const formatLimitedList = (
  items: string[],
  maxItems: number = 10,
  maxLength: number = 1000,
): string => {
  const displayItems = items.slice(0, maxItems);
  let result = displayItems.join('\n');

  if (items.length > maxItems) {
    result += `\n... and ${items.length - maxItems} more`;
  }

  return truncateText(result, maxLength);
};

export type CreateLicenseWebhookPayload = Omit<License, 'licenseKeyLookup'> & {
  products: Product[];
  customers: Customer[];
  metadata: Metadata[];
};

export const createLicensePayload = (payload: CreateLicenseWebhookPayload) => ({
  ...payload,
  licenseKeyLookup: undefined,
  licenseKey: decryptLicenseKey(payload.licenseKey),
});

export const createLicenseDiscordPayload = (
  payload: CreateLicenseWebhookPayload,
) => {
  const fields = [
    {
      name: 'License Key',
      value: `\`\`\`\n${decryptLicenseKey(payload.licenseKey)}\`\`\``,
      inline: false,
    },
    {
      name: 'License Status',
      value: payload.suspended ? 'Suspended' : 'Active',
      inline: false,
    },
  ];

  // Add expiration information
  if (payload.expirationType === 'NEVER') {
    fields.push({
      name: 'Expiration',
      value: 'Never expires',
      inline: true,
    });
  } else if (payload.expirationType === 'DATE' && payload.expirationDate) {
    const timestamp = Math.floor(
      new Date(payload.expirationDate).getTime() / 1000,
    );
    fields.push({
      name: 'Expiration Date',
      value: `<t:${timestamp}:f>`,
      inline: true,
    });
  } else if (payload.expirationType === 'DURATION' && payload.expirationDays) {
    fields.push({
      name: 'Expiration',
      value: `${payload.expirationDays} days from ${
        payload.expirationStart === 'ACTIVATION'
          ? 'first activation'
          : 'creation'
      }`,
      inline: true,
    });
  }

  // Add limits if present (inline to save space)
  if (payload.ipLimit || payload.seats) {
    const limits = [];
    if (payload.ipLimit) limits.push(`IP Address Limit: ${payload.ipLimit}`);
    if (payload.seats) limits.push(`Concurrent users: ${payload.seats}`);

    fields.push({
      name: 'License Limits',
      value: limits.join('\n'),
      inline: false,
    });
  }

  // Add products if present (compact format)
  if (payload.products && payload.products.length > 0) {
    const productList = formatLimitedList(
      payload.products.map((p) => p.name),
      5,
      800,
    );

    fields.push({
      name: `Assigned Products (${payload.products.length})`,
      value: productList,
      inline: false,
    });
  }

  // Add customers if present (compact format)
  if (payload.customers && payload.customers.length > 0) {
    const customerList = formatLimitedList(
      payload.customers.map(
        (c) => c.fullName || c.email || c.username || 'Unknown Customer',
      ),
      5,
      800,
    );

    fields.push({
      name: `Assigned Customers (${payload.customers.length})`,
      value: customerList,
      inline: false,
    });
  }

  // Add metadata if present (compact format)
  if (payload.metadata && payload.metadata.length > 0) {
    const metadataList = formatLimitedList(
      payload.metadata.map(
        (m) => `**${truncateText(m.key, 50)}**: ${truncateText(m.value, 100)}`,
      ),
      3,
      600,
    );

    fields.push({
      name: `Metadata (${payload.metadata.length})`,
      value: metadataList,
      inline: false,
    });
  }

  return {
    embeds: [
      {
        title: 'License Created Successfully',
        description:
          'A new license has been created with the following details.',
        fields,
        color: 0x3b82f6, // Blue color to match bot
        footer: {
          text: 'License Management System',
        },
        timestamp: new Date(payload.createdAt).toISOString(),
      },
    ],
  };
};
