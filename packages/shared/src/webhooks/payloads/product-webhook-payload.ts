import { Metadata, Product } from '../../../prisma/generated/client';
import { WebhookDiscordPayload } from '../discord-webhooks';
import { formatDiscordAuthor } from './shared/format-author';
import { formatDiscordFooter } from './shared/format-footer';

export type ProductWebhookPayload = Product & {
  metadata: Metadata[];
};

export type CreateProductWebhookPayload = ProductWebhookPayload;
export type UpdateProductWebhookPayload = ProductWebhookPayload;
export type DeleteProductWebhookPayload = ProductWebhookPayload;

export const createProductPayload = (payload: CreateProductWebhookPayload) => ({
  ...payload,
});

export const updateProductPayload = (payload: UpdateProductWebhookPayload) => ({
  ...payload,
});

export const deleteProductPayload = (payload: DeleteProductWebhookPayload) => ({
  ...payload,
});

const buildProductFields = (payload: ProductWebhookPayload) => {
  const fields = [
    {
      name: 'Product Name',
      value: payload.name,
      inline: true,
    },
    {
      name: 'Website URL',
      value: payload.url || '_Not set_',
      inline: true,
    },
    {
      name: 'Product ID',
      value: `\`\`\`\n${payload.id}\`\`\``,
      inline: false,
    },
  ];

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

export const createProductDiscordPayload = ({
  payload,
  team,
  user,
  source,
}: WebhookDiscordPayload<CreateProductWebhookPayload>) => {
  const fields = buildProductFields(payload);

  return {
    embeds: [
      {
        title: 'Product Created Successfully',
        description:
          'A new product has been created with the following details.',
        fields,
        color: 0x4153af,
        author: formatDiscordAuthor({ team }),
        footer: formatDiscordFooter({ source, user }),
        timestamp: new Date(payload.createdAt).toISOString(),
      },
    ],
  };
};

export const updateProductDiscordPayload = ({
  payload,
  team,
  user,
  source,
}: WebhookDiscordPayload<UpdateProductWebhookPayload>) => {
  const fields = buildProductFields(payload);

  return {
    embeds: [
      {
        title: 'Product Updated Successfully',
        description: 'A product has been updated with the following details.',
        fields,
        color: 0xf59e0b,
        author: formatDiscordAuthor({ team }),
        footer: formatDiscordFooter({ source, user }),
        timestamp: new Date(payload.updatedAt).toISOString(),
      },
    ],
  };
};

export const deleteProductDiscordPayload = ({
  payload,
  team,
  user,
  source,
}: WebhookDiscordPayload<DeleteProductWebhookPayload>) => {
  const fields = buildProductFields(payload);

  return {
    embeds: [
      {
        title: 'Product Deleted',
        description:
          'A product has been deleted. Below are the details of the deleted product.',
        fields,
        color: 0xef4444,
        author: formatDiscordAuthor({ team }),
        footer: formatDiscordFooter({ source, user }),
        timestamp: new Date().toISOString(),
      },
    ],
  };
};
