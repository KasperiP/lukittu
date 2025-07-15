import {
  Metadata,
  Product,
  Release,
  ReleaseBranch,
  ReleaseFile,
} from '../../../prisma/generated/client';
import { WebhookDiscordPayload } from '../discord-webhooks';
import { formatDiscordAuthor } from './shared/format-author';
import { formatDiscordFooter } from './shared/format-footer';

export type ReleaseWebhookPayload = Release & {
  metadata: Metadata[];
  product: Product;
  file: ReleaseFile | null;
  branch: ReleaseBranch | null;
};

export type CreateReleaseWebhookPayload = ReleaseWebhookPayload;
export type UpdateReleaseWebhookPayload = ReleaseWebhookPayload;
export type DeleteReleaseWebhookPayload = ReleaseWebhookPayload;

export const createReleasePayload = (payload: CreateReleaseWebhookPayload) => ({
  ...payload,
});

export const updateReleasePayload = (payload: UpdateReleaseWebhookPayload) => ({
  ...payload,
});

export const deleteReleasePayload = (payload: DeleteReleaseWebhookPayload) => ({
  ...payload,
});

const buildReleaseFields = (payload: ReleaseWebhookPayload) => {
  const fields = [
    {
      name: 'Product',
      value: payload.product.name,
      inline: true,
    },
    {
      name: 'Version',
      value: payload.version,
      inline: true,
    },
    {
      name: 'Status',
      value:
        payload.status === 'PUBLISHED'
          ? '🟢 Published'
          : payload.status === 'DRAFT'
            ? '🟡 Draft'
            : payload.status === 'ARCHIVED'
              ? '🔴 Archived'
              : payload.status,
      inline: true,
    },
  ];

  if (payload.branch) {
    fields.push({
      name: 'Branch',
      value: payload.branch.name,
      inline: true,
    });
  }

  if (payload.file) {
    fields.push({
      name: 'File',
      value: payload.file.name,
      inline: true,
    });
  }

  if (payload.latest) {
    fields.push({
      name: 'Latest Release',
      value: 'Yes',
      inline: true,
    });
  }

  fields.push({
    name: '\u200B',
    value: '**Release Information**',
    inline: false,
  });

  fields.push({
    name: 'Release ID',
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

export const createReleaseDiscordPayload = ({
  payload,
  team,
  user,
  source,
}: WebhookDiscordPayload<CreateReleaseWebhookPayload>) => {
  const fields = buildReleaseFields(payload);

  return {
    embeds: [
      {
        title: 'Release Created Successfully',
        description:
          'A new release has been created with the following details.',
        fields,
        color: 0x4153af,
        author: formatDiscordAuthor({ team }),
        footer: formatDiscordFooter({ source, user }),
        timestamp: new Date(payload.createdAt).toISOString(),
      },
    ],
  };
};

export const updateReleaseDiscordPayload = ({
  payload,
  team,
  user,
  source,
}: WebhookDiscordPayload<UpdateReleaseWebhookPayload>) => {
  const fields = buildReleaseFields(payload);

  return {
    embeds: [
      {
        title: 'Release Updated Successfully',
        description: 'A release has been updated with the following details.',
        fields,
        color: 0xf59e0b,
        author: formatDiscordAuthor({ team }),
        footer: formatDiscordFooter({ source, user }),
        timestamp: new Date(payload.updatedAt).toISOString(),
      },
    ],
  };
};

export const deleteReleaseDiscordPayload = ({
  payload,
  team,
  user,
  source,
}: WebhookDiscordPayload<DeleteReleaseWebhookPayload>) => {
  const fields = buildReleaseFields(payload);

  return {
    embeds: [
      {
        title: 'Release Deleted',
        description:
          'A release has been deleted. Below are the details of the deleted release.',
        fields,
        color: 0xef4444,
        author: formatDiscordAuthor({ team }),
        footer: formatDiscordFooter({ source, user }),
        timestamp: new Date().toISOString(),
      },
    ],
  };
};
