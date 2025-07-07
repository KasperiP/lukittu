import { Address, Customer, Metadata } from '../../../prisma/generated/client';
import { WebhookDiscordPayload } from '../discord-webhooks';
import { formatDiscordAuthor } from './shared/format-author';
import { formatDiscordFooter } from './shared/format-footer';

export type CustomerWebhookPayload = Customer & {
  address: Address | null;
  metadata: Metadata[];
};

export type CreateCustomerWebhookPayload = CustomerWebhookPayload;
export type UpdateCustomerWebhookPayload = CustomerWebhookPayload;
export type DeleteCustomerWebhookPayload = CustomerWebhookPayload;

export const createCustomerPayload = (
  payload: CreateCustomerWebhookPayload,
) => ({
  ...payload,
});

export const updateCustomerPayload = (
  payload: UpdateCustomerWebhookPayload,
) => ({
  ...payload,
});

export const deleteCustomerPayload = (
  payload: DeleteCustomerWebhookPayload,
) => ({
  ...payload,
});

const buildCustomerFields = (payload: CustomerWebhookPayload) => {
  const fields = [
    {
      name: 'Username',
      value: payload.username || '_Not set_',
      inline: true,
    },
    {
      name: 'Email',
      value: payload.email || '_Not set_',
      inline: true,
    },
    {
      name: 'Full Name',
      value: payload.fullName || '_Not set_',
      inline: true,
    },
  ];

  const hasAddressInfo =
    payload.address &&
    Object.values(payload.address).some(
      (value) => value !== null && value !== '',
    );

  if (hasAddressInfo) {
    fields.push({
      name: '\u200B',
      value: '**Address Information**',
      inline: false,
    });

    const addressParts: string[] = [];
    if (payload.address!.line1) addressParts.push(payload.address!.line1);
    if (payload.address!.line2) addressParts.push(payload.address!.line2);

    const cityStateZip: string[] = [];
    if (payload.address!.city) cityStateZip.push(payload.address!.city);
    if (payload.address!.state) cityStateZip.push(payload.address!.state);
    if (payload.address!.postalCode)
      cityStateZip.push(payload.address!.postalCode);

    if (cityStateZip.length > 0) addressParts.push(cityStateZip.join(', '));
    if (payload.address!.country) addressParts.push(payload.address!.country);

    if (addressParts.length > 0) {
      const fullAddress = addressParts.join(', ');
      const encodedAddress = encodeURIComponent(fullAddress);
      const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

      fields.push({
        name: 'Address',
        value: `${fullAddress}\n[View on Google Maps](${mapsLink})`,
        inline: false,
      });
    }
  } else {
    fields.push({
      name: '\u200B',
      value: '**Address Information**',
      inline: false,
    });
    fields.push({
      name: 'Address',
      value: 'No address information provided',
      inline: false,
    });
  }

  fields.push({
    name: '\u200B',
    value: '**Customer Information**',
    inline: false,
  });

  fields.push({
    name: 'Customer ID',
    value: `\`\`\`\n${payload.id}\`\`\``,
    inline: false,
  });

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
  } else {
    fields.push(
      { name: '\u200B', value: '**Metadata**', inline: false },
      { name: 'Custom Fields', value: 'None', inline: false },
    );
  }

  return fields;
};

export const createCustomerDiscordPayload = ({
  payload,
  team,
  user,
  source,
}: WebhookDiscordPayload<CreateCustomerWebhookPayload>) => {
  const fields = buildCustomerFields(payload);

  return {
    embeds: [
      {
        title: 'Customer Created Successfully',
        description:
          'A new customer has been created with the following details.',
        fields,
        color: 0x4153af,
        author: formatDiscordAuthor({ team }),
        footer: formatDiscordFooter({ source, user }),
        timestamp: new Date(payload.createdAt).toISOString(),
      },
    ],
  };
};

export const updateCustomerDiscordPayload = ({
  payload,
  team,
  user,
  source,
}: WebhookDiscordPayload<UpdateCustomerWebhookPayload>) => {
  const fields = buildCustomerFields(payload);

  return {
    embeds: [
      {
        title: 'Customer Updated Successfully',
        description: 'A customer has been updated with the following details.',
        fields,
        color: 0xf59e0b,
        author: formatDiscordAuthor({ team }),
        footer: formatDiscordFooter({ source, user }),
        timestamp: new Date(payload.updatedAt).toISOString(),
      },
    ],
  };
};

export const deleteCustomerDiscordPayload = ({
  payload,
  team,
  user,
  source,
}: WebhookDiscordPayload<DeleteCustomerWebhookPayload>) => {
  const fields = buildCustomerFields(payload);

  return {
    embeds: [
      {
        title: 'Customer Deleted',
        description:
          'A customer has been deleted. Below are the details of the deleted customer.',
        fields,
        color: 0xef4444,
        author: formatDiscordAuthor({ team }),
        footer: formatDiscordFooter({ source, user }),
        timestamp: new Date().toISOString(),
      },
    ],
  };
};
