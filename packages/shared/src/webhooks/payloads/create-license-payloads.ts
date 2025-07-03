import {
  Customer,
  License,
  Metadata,
  Product,
} from '../../../prisma/generated/client';
import { decryptLicenseKey } from '../../security/crypto';
import { WebhookDiscordPayload } from '../discord-webhooks';
import { formatDiscordAuthor } from './shared/format-author';
import { formatDiscordFooter } from './shared/format-footer';

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

export const createLicenseDiscordPayload = ({
  payload,
  team,
  user,
  source,
}: WebhookDiscordPayload<CreateLicenseWebhookPayload>) => {
  const fields = [
    {
      name: 'License Key',
      value: `\`\`\`\n${payload.licenseKey}\`\`\``,
      inline: false,
    },
    {
      name: 'Status',
      value: payload.suspended ? '🔴 Suspended' : '🟢 Active',
      inline: true,
    },
  ];

  // Add expiration information (with emojis like bot)
  if (payload.expirationType === 'NEVER') {
    fields.push({
      name: 'Expiration',
      value: '♾️ Never expires',
      inline: true,
    });
  } else if (payload.expirationType === 'DATE' && payload.expirationDate) {
    const timestamp = Math.floor(
      new Date(payload.expirationDate).getTime() / 1000,
    );
    fields.push({
      name: 'Expiration Date',
      value: `📅 <t:${timestamp}:f>`,
      inline: true,
    });
  } else if (payload.expirationType === 'DURATION' && payload.expirationDays) {
    fields.push({
      name: 'Expiration',
      value: `⏱️ ${payload.expirationDays} days from ${
        payload.expirationStart === 'ACTIVATION'
          ? 'first activation'
          : 'creation'
      }`,
      inline: true,
    });
  }

  // Add limits section if present (like bot)
  if (payload.ipLimit || payload.seats) {
    fields.push({
      name: '\u200B',
      value: '**License Limits**',
      inline: false,
    });

    if (payload.ipLimit) {
      fields.push({
        name: 'IP Limit',
        value: payload.ipLimit.toString(),
        inline: true,
      });
    }

    if (payload.seats) {
      fields.push({
        name: 'Concurrent users',
        value: payload.seats.toString(),
        inline: true,
      });
    }
  }

  // Add products section (like bot)
  if (payload.products && payload.products.length > 0) {
    fields.push(
      {
        name: '\u200B',
        value: `**Products (${payload.products.length} total)**`,
        inline: false,
      },
      {
        name: 'Assigned Products',
        value: payload.products.map((p) => `• ${p.name}`).join('\n'),
        inline: false,
      },
    );
  } else {
    fields.push(
      { name: '\u200B', value: '**Products**', inline: false },
      { name: 'Assigned Products', value: 'None', inline: false },
    );
  }

  // Add customers section (like bot)
  if (payload.customers && payload.customers.length > 0) {
    fields.push(
      {
        name: '\u200B',
        value: `**Customers (${payload.customers.length} total)**`,
        inline: false,
      },
      {
        name: 'Assigned Customers',
        value: payload.customers
          .map(
            (c) =>
              `• ${c.fullName || c.email || c.username || 'Unknown Customer'}`,
          )
          .join('\n'),
        inline: false,
      },
    );
  } else {
    fields.push(
      { name: '\u200B', value: '**Customers**', inline: false },
      { name: 'Assigned Customers', value: 'None', inline: false },
    );
  }

  // Add metadata if present (formatted like bot)
  if (payload.metadata && payload.metadata.length > 0) {
    fields.push(
      {
        name: '\u200B',
        value: `**Metadata (${payload.metadata.length} total)**`,
        inline: false,
      },
      {
        name: 'Custom Fields',
        value: payload.metadata
          .map((m) => `• **${m.key}**: ${m.value}`)
          .join('\n'),
        inline: false,
      },
    );
  }

  return {
    embeds: [
      {
        title: 'License Created Successfully',
        description:
          'A new license has been created with the following details.',
        fields,
        color: 0x4153af,
        author: formatDiscordAuthor({ team }),
        footer: formatDiscordFooter({ source, user }),
        timestamp: new Date(payload.createdAt).toISOString(),
      },
    ],
  };
};
