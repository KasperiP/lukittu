import {
  decryptLicenseKey,
  generateHMAC,
  getLicenseStatus,
  License,
  logger,
  prisma,
} from '@lukittu/shared';
import { regex } from '@lukittu/shared/src/constants/regex';
import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  ComponentType,
  EmbedBuilder,
  EmbedField,
  MessageFlags,
} from 'discord.js';
import { Command } from '../../structures/command';

type LicenseStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'SUSPENDED';

type ExtendedLicense = Omit<License, 'licenseKeyLookup'> & {
  products: { id: string; name: string; url: string | null }[];
  customers: { id: string; email: string; fullName: string | null }[];
  metadata: { key: string; value: string }[];
};

interface StatusOption {
  name: string;
  value: LicenseStatus | 'ALL';
}

const PAGE_SIZE = 1;
const STATUS_OPTIONS: StatusOption[] = [
  { name: 'All', value: 'ALL' },
  { name: 'Active', value: 'ACTIVE' },
  { name: 'Inactive', value: 'INACTIVE' },
  { name: 'Expiring', value: 'EXPIRING' },
  { name: 'Expired', value: 'EXPIRED' },
  { name: 'Suspended', value: 'SUSPENDED' },
];

function getLicenseStatusInfo(license: ExtendedLicense) {
  const licenseStatus = getLicenseStatus(license);

  switch (licenseStatus) {
    case 'ACTIVE':
      return { text: 'Active', color: Colors.Green };
    case 'INACTIVE':
      return { text: 'Inactive', color: Colors.Yellow };
    case 'EXPIRING':
      return { text: 'Expiring', color: Colors.Orange };
    case 'EXPIRED':
      return { text: 'Expired', color: Colors.Red };
    case 'SUSPENDED':
      return { text: 'Suspended', color: Colors.Red };
    default:
      return { text: 'Unknown', color: Colors.Grey };
  }
}

function createTimestamps(license: ExtendedLicense) {
  return {
    createdAt: Math.floor(new Date(license.createdAt).getTime() / 1000),
    updatedAt: Math.floor(new Date(license.updatedAt).getTime() / 1000),
    lastActive: license.lastActiveAt
      ? Math.floor(new Date(license.lastActiveAt).getTime() / 1000)
      : null,
    expiration: license.expirationDate
      ? Math.floor(new Date(license.expirationDate).getTime() / 1000)
      : null,
  };
}

function createActionRows(
  currentPage: number,
  totalPages: number,
  licenseId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  const paginationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('first')
      .setEmoji('1029435230668476476')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 1),
    new ButtonBuilder()
      .setCustomId('prev')
      .setEmoji('1029435199462834207')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === 1),
    new ButtonBuilder()
      .setCustomId('next')
      .setEmoji('1029435213157240892')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === totalPages),
    new ButtonBuilder()
      .setCustomId('last')
      .setEmoji('1029435238948032582')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === totalPages),
  );

  const dashboardRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('View in Dashboard')
      .setURL(`${process.env.BASE_URL}/dashboard/licenses/${licenseId}`)
      .setStyle(ButtonStyle.Link),
  );

  return [paginationRow, dashboardRow];
}

function createLicenseEmbed(
  license: ExtendedLicense,
  decryptedKey: string,
  teamName: string,
  teamImageUrl: string | null,
  currentPage: number,
  totalLicenses: number,
  userImageUrl: string | null,
) {
  const { text: statusText, color: statusColor } =
    getLicenseStatusInfo(license);
  const timestamps = createTimestamps(license);

  const embed = new EmbedBuilder()
    .setTitle(`License: ${decryptedKey}`)
    .setColor(statusColor)
    .setDescription(`**Status:** ${statusText}`)
    .addFields({
      name: 'ID',
      value: '```yaml\n' + license.id + '```',
      inline: false,
    });

  embed.addFields(
    {
      name: 'Created',
      value: `<t:${timestamps.createdAt}:f>`,
      inline: true,
    },
    {
      name: 'Last Updated',
      value: `<t:${timestamps.updatedAt}:f>`,
      inline: true,
    },
    {
      name: 'Last Active',
      value: timestamps.lastActive ? `<t:${timestamps.lastActive}:f>` : 'Never',
      inline: true,
    },
  );

  if (license.expirationType === 'NEVER') {
    embed.addFields({
      name: 'Expiration',
      value: 'Never expires',
      inline: true,
    });
  } else {
    embed.addFields({
      name: 'Expiration',
      value: timestamps.expiration
        ? `<t:${timestamps.expiration}:f>`
        : 'Not set',
      inline: true,
    });

    embed.addFields({
      name: 'Expiration Type',
      value: `**${license.expirationType === 'DATE' ? 'Date' : 'Duration'}** (starts on **${license.expirationStart === 'ACTIVATION' ? 'Activation' : 'Creation'})**`,
      inline: true,
    });

    if (license.expirationDays) {
      embed.addFields({
        name: 'Expiration Days',
        value: license.expirationDays.toString(),
        inline: true,
      });
    } else {
      embed.addFields({
        name: 'Expiration Days',
        value: 'None',
        inline: true,
      });
    }
  }

  const limitsFields: EmbedField[] = [];

  if (license.ipLimit) {
    limitsFields.push({
      name: 'IP Limit',
      value: license.ipLimit.toString(),
      inline: true,
    });
  }

  if (license.seats) {
    limitsFields.push({
      name: 'Concurrent users',
      value: license.seats.toString(),
      inline: true,
    });
  }

  if (limitsFields.length > 0) {
    embed.addFields({
      name: '\u200B',
      value: '**License Limits**',
      inline: false,
    });
    embed.addFields(...limitsFields);
  }

  if (license.products.length > 0) {
    embed.addFields({
      name: '\u200B',
      value: `**Products (${license.products.length} total)**`,
      inline: false,
    });

    const displayProducts = license.products.slice(0, 5);
    const hasMoreProducts = license.products.length > 5;

    displayProducts.forEach((product) => {
      embed.addFields({
        name: product.name,
        value: `${'```yaml\n' + product.id + '```'}\n${
          product.url
            ? `**Url:** [${product.url}](${product.url})`
            : 'No URL provided'
        }`,
        inline: false,
      });
    });

    if (hasMoreProducts) {
      embed.addFields({
        name: 'Additional Products',
        value: `*${license.products.length - 5} more products not shown*`,
        inline: false,
      });
    }
  }

  if (license.customers.length > 0) {
    embed.addFields({
      name: '\u200B',
      value: `**Customers (${license.customers.length} total)**`,
      inline: false,
    });

    const displayCustomers = license.customers.slice(0, 5);
    const hasMoreCustomers = license.customers.length > 5;

    displayCustomers.forEach((customer) => {
      embed.addFields({
        name: customer.fullName || 'Unnamed Customer',
        value: `${'```yaml\n' + customer.id + '```'}\n${customer.email ? `**Email:** ${customer.email}` : 'No email provided'}`,
        inline: false,
      });
    });

    if (hasMoreCustomers) {
      embed.addFields({
        name: 'Additional Customers',
        value: `*${license.customers.length - 5} more customers not shown*`,
        inline: false,
      });
    }
  }

  if (license.metadata.length > 0) {
    embed.addFields({
      name: '\u200B',
      value: `**Metadata (${license.metadata.length} total)**`,
      inline: false,
    });

    const displayMetadata = license.metadata.slice(0, 10);
    const hasMoreMetadata = license.metadata.length > 10;

    const metadataText = displayMetadata
      .map((meta) => `**${meta.key}**: ${meta.value}`)
      .join('\n');

    embed.addFields({
      name: 'Custom Fields',
      value:
        metadataText +
        (hasMoreMetadata
          ? `\n\n*${license.metadata.length - 10} more fields not shown*`
          : ''),
      inline: false,
    });
  }

  embed.setAuthor({
    name: teamName,
    iconURL: teamImageUrl || undefined,
  });

  embed.setFooter({
    text: `License ${currentPage} of ${totalLicenses}`,
    iconURL: userImageUrl || undefined,
  });

  return embed;
}

export default Command({
  data: {
    name: 'browse-licenses',
    description: 'Browse license keys for your selected team',
    ephemeral: true,
    options: [
      {
        name: 'page',
        description: 'Page number (defaults to 1)',
        type: ApplicationCommandOptionType.Integer,
        required: false,
        min_value: 1,
      },
      {
        name: 'status',
        description: 'License status filter',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: STATUS_OPTIONS,
      },
      {
        name: 'license',
        description: 'Search for a specific license key',
        type: ApplicationCommandOptionType.String,
        required: false,
      },
      {
        name: 'product',
        description: 'Filter by product',
        type: ApplicationCommandOptionType.String,
        required: false,
        autocomplete: true,
      },
      {
        name: 'customer',
        description: 'Filter by customer',
        type: ApplicationCommandOptionType.String,
        required: false,
        autocomplete: true,
      },
    ],
  },
  autocomplete: async (interaction, discordAccount) => {
    try {
      const focusedOption = interaction.options.getFocused(true);

      if (!discordAccount?.selectedTeamId) {
        return interaction.respond([]);
      }

      const teamId = discordAccount.selectedTeamId;
      const focusedValue = focusedOption.value.toLowerCase();

      if (focusedOption.name === 'product') {
        const products = await prisma.product.findMany({
          where: {
            teamId: teamId,
            name: { contains: focusedValue, mode: 'insensitive' },
          },
          take: 25,
        });

        await interaction.respond(
          products.map((product) => ({
            name: product.name,
            value: product.id,
          })),
        );
      } else if (focusedOption.name === 'customer') {
        const customers = await prisma.customer.findMany({
          where: {
            teamId: teamId,
            OR: [
              { email: { contains: focusedValue, mode: 'insensitive' } },
              { fullName: { contains: focusedValue, mode: 'insensitive' } },
            ],
          },
          take: 25,
        });

        await interaction.respond(
          customers.map((customer) => ({
            name: customer.fullName
              ? `${customer.fullName} (${customer.email})`
              : customer.email,
            value: customer.id,
          })),
        );
      }
    } catch (error) {
      logger.error('Error in browse-licenses autocomplete:', error);
      await interaction.respond([]);
    }
  },
  execute: async (interaction, discordAccount) => {
    try {
      const page = interaction.options.getInteger('page') || 1;
      const status = interaction.options.getString('status') as
        | LicenseStatus
        | 'ALL'
        | null;
      const license = interaction.options.getString('license') || '';
      const productId = interaction.options.getString('product');
      const customerId = interaction.options.getString('customer');

      const selectedTeam = discordAccount?.selectedTeam;
      if (!selectedTeam) {
        await interaction.editReply({
          content: 'Please select a team first using `/choose-team`.',
        });
        return;
      }

      const teamId = selectedTeam.id;
      const teamName = selectedTeam.name || 'Unknown Team';
      const teamImageUrl = selectedTeam.imageUrl;
      const userImageUrl = discordAccount.user.imageUrl;

      let licenseKeyLookup: string | undefined;
      if (license) {
        if (!license.match(regex.licenseKey)) {
          await interaction.editReply({
            content: 'Invalid license key format.',
          });
          return;
        }

        licenseKeyLookup = generateHMAC(`${license}:${teamId}`);
      }

      let statusFilter = {};

      if (status && status !== 'ALL') {
        const currentDate = new Date();
        const thirtyDaysAgo = new Date(
          currentDate.getTime() - 30 * 24 * 60 * 60 * 1000,
        );

        switch (status) {
          case 'ACTIVE':
            statusFilter = {
              suspended: false,
              lastActiveAt: { gt: thirtyDaysAgo },
              OR: [
                { expirationType: 'NEVER' },
                {
                  AND: [
                    { expirationType: { in: ['DATE', 'DURATION'] } },
                    { expirationDate: { gt: currentDate } },
                    {
                      expirationDate: {
                        gt: new Date(
                          currentDate.getTime() + 30 * 24 * 60 * 60 * 1000,
                        ),
                      },
                    },
                  ],
                },
              ],
            };
            break;
          case 'INACTIVE':
            statusFilter = {
              suspended: false,
              lastActiveAt: { lte: thirtyDaysAgo },
              OR: [
                { expirationType: 'NEVER' },
                {
                  AND: [
                    { expirationType: { in: ['DATE', 'DURATION'] } },
                    { expirationDate: { gt: currentDate } },
                    {
                      expirationDate: {
                        gt: new Date(
                          currentDate.getTime() + 30 * 24 * 60 * 60 * 1000,
                        ),
                      },
                    },
                  ],
                },
              ],
            };
            break;
          case 'EXPIRING':
            statusFilter = {
              suspended: false,
              expirationType: { in: ['DATE', 'DURATION'] },
              expirationDate: {
                gt: currentDate,
                lt: new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000),
              },
            };
            break;
          case 'EXPIRED':
            statusFilter = {
              suspended: false,
              expirationType: { in: ['DATE', 'DURATION'] },
              expirationDate: { lt: currentDate },
            };
            break;
          case 'SUSPENDED':
            statusFilter = { suspended: true };
            break;
        }
      }

      const totalLicenses = await prisma.license.count({
        where: {
          teamId,
          ...statusFilter,
          ...(licenseKeyLookup ? { licenseKeyLookup } : {}),
          ...(productId ? { products: { some: { id: productId } } } : {}),
          ...(customerId ? { customers: { some: { id: customerId } } } : {}),
        },
      });
      const totalPages = Math.max(totalLicenses, 1);

      const validPage = page > totalPages ? 1 : page;
      const skip = (validPage - 1) * PAGE_SIZE;

      const licenses = await prisma.license.findMany({
        where: {
          teamId,
          ...statusFilter,
          ...(licenseKeyLookup ? { licenseKeyLookup } : {}),
          ...(productId ? { products: { some: { id: productId } } } : {}),
          ...(customerId ? { customers: { some: { id: customerId } } } : {}),
        },
        skip,
        take: PAGE_SIZE,
        orderBy: { createdAt: 'desc' },
        include: {
          products: true,
          customers: true,
          metadata: true,
        },
      });

      if (licenses.length === 0) {
        await interaction.editReply({
          content: 'No licenses found matching your criteria.',
        });
        return;
      }

      const currentLicense = licenses[0];
      const decryptedKey = decryptLicenseKey(currentLicense.licenseKey);

      const embed = createLicenseEmbed(
        currentLicense,
        decryptedKey,
        teamName,
        teamImageUrl || null,
        validPage,
        totalLicenses,
        userImageUrl,
      );

      const actionRows = createActionRows(
        validPage,
        totalPages,
        currentLicense.id,
      );

      const response = await interaction.editReply({
        embeds: [embed],
        components: actionRows,
      });

      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000,
      });

      let currentPage = validPage;

      collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
          await i.reply({
            content: 'You cannot use these buttons.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        switch (i.customId) {
          case 'first':
            currentPage = 1;
            break;
          case 'prev':
            currentPage = Math.max(1, currentPage - 1);
            break;
          case 'next':
            currentPage = Math.min(totalPages, currentPage + 1);
            break;
          case 'last':
            currentPage = totalPages;
            break;
        }

        await i.deferUpdate();

        try {
          const skip = (currentPage - 1) * PAGE_SIZE;

          const newPageLicenses = await prisma.license.findMany({
            where: {
              teamId,
              ...statusFilter,
              ...(licenseKeyLookup ? { licenseKeyLookup } : {}),
              ...(productId ? { products: { some: { id: productId } } } : {}),
              ...(customerId
                ? { customers: { some: { id: customerId } } }
                : {}),
            },
            skip,
            take: PAGE_SIZE,
            orderBy: { createdAt: 'desc' },
            include: {
              products: true,
              customers: true,
              metadata: true,
            },
          });

          if (newPageLicenses.length === 0) {
            await i.editReply({
              content: 'No licenses found for this page.',
              embeds: [],
              components: [],
            });
            return;
          }

          const newLicense = newPageLicenses[0];
          const newDecryptedKey = decryptLicenseKey(newLicense.licenseKey);

          const newEmbed = createLicenseEmbed(
            newLicense,
            newDecryptedKey,
            teamName,
            teamImageUrl || null,
            currentPage,
            totalLicenses,
            userImageUrl,
          );

          const newActionRows = createActionRows(
            currentPage,
            totalPages,
            newLicense.id,
          );

          await i.editReply({
            embeds: [newEmbed],
            components: newActionRows,
          });
        } catch (error) {
          logger.error('Error handling pagination:', error);
          await i.editReply({
            content:
              'An error occurred while fetching licenses. Please try again later.',
            components: [],
            embeds: [],
          });
        }
      });

      collector.on('end', async () => {
        try {
          const finalActionRow =
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setLabel('View in Dashboard')
                .setURL(
                  `${process.env.BASE_URL}/dashboard/licenses/${currentLicense.id}`,
                )
                .setStyle(ButtonStyle.Link),
            );

          await interaction.editReply({
            embeds: [embed],
            components: [finalActionRow],
          });
        } catch (error) {
          logger.error('Error removing buttons:', error);
        }
      });
    } catch (error) {
      logger.error('Error in browse-licenses command:', error);
      await interaction.editReply({
        content:
          'An error occurred while fetching licenses. Please try again later.',
      });
    }
  },
});
