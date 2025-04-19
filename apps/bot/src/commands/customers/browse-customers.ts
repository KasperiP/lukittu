import {
  Customer,
  decryptLicenseKey,
  generateHMAC,
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
  MessageFlags,
} from 'discord.js';
import { Command } from '../../structures/command';

type ExtendedCustomer = Customer & {
  address: {
    id: string;
    city: string | null;
    country: string | null;
    line1: string | null;
    line2: string | null;
    postalCode: string | null;
    state: string | null;
  } | null;
  metadata: { key: string; value: string }[];
  licenses: {
    id: string;
    licenseKey: string;
    products: { id: string; name: string }[];
  }[];
};

const PAGE_SIZE = 1;

function createTimestamps(customer: ExtendedCustomer) {
  return {
    createdAt: Math.floor(new Date(customer.createdAt).getTime() / 1000),
    updatedAt: Math.floor(new Date(customer.updatedAt).getTime() / 1000),
  };
}

function createActionRows(
  currentPage: number,
  totalPages: number,
  customerId: string,
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
      .setURL(`${process.env.BASE_URL}/dashboard/customers/${customerId}`)
      .setStyle(ButtonStyle.Link),
  );

  return [paginationRow, dashboardRow];
}

function createCustomerEmbed(
  customer: ExtendedCustomer,
  teamName: string,
  teamImageUrl: string | null,
  currentPage: number,
  totalCustomers: number,
  userImageUrl: string | null,
) {
  const timestamps = createTimestamps(customer);

  const embed = new EmbedBuilder()
    .setTitle(`Customer: ${customer.fullName || 'Unnamed Customer'}`)
    .setColor(Colors.Blue)
    .setDescription(`**Email:** ${customer.email}`)
    .addFields({
      name: 'ID',
      value: '```yaml\n' + customer.id + '```',
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
  );

  if (customer.address) {
    embed.addFields({
      name: '\u200B',
      value: '**Address Information**',
      inline: false,
    });

    const addressParts: string[] = [];
    if (customer.address.line1) addressParts.push(customer.address.line1);
    if (customer.address.line2) addressParts.push(customer.address.line2);

    const cityStateZip: string[] = [];
    if (customer.address.city) cityStateZip.push(customer.address.city);
    if (customer.address.state) cityStateZip.push(customer.address.state);
    if (customer.address.postalCode)
      cityStateZip.push(customer.address.postalCode);

    if (cityStateZip.length > 0) addressParts.push(cityStateZip.join(', '));
    if (customer.address.country) addressParts.push(customer.address.country);

    if (addressParts.length > 0) {
      const fullAddress = addressParts.join(', ');
      const encodedAddress = encodeURIComponent(fullAddress);
      const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

      embed.addFields({
        name: 'Address',
        value: `${fullAddress}\n[View on Google Maps](${mapsLink})`,
        inline: false,
      });
    } else {
      embed.addFields({
        name: 'Address',
        value: 'Address exists but no details provided',
        inline: false,
      });
    }
  }

  if (customer.licenses && customer.licenses.length > 0) {
    embed.addFields({
      name: '\u200B',
      value: `**Licenses (${customer.licenses.length} total)**`,
      inline: false,
    });

    const displayLicenses = customer.licenses.slice(0, 5);
    const hasMoreLicenses = customer.licenses.length > 5;

    displayLicenses.forEach((license, index) => {
      const decryptedKey = decryptLicenseKey(license.licenseKey);

      let productsText = '';
      if (license.products && license.products.length > 0) {
        productsText = `\n**Products:** ${license.products.map((p) => p.name).join(', ')}`;
      } else {
        productsText = '\n**Products:** None assigned';
      }

      embed.addFields({
        name: `License #${index + 1}`,
        value: `\`\`\`\n${decryptedKey}\`\`\`${productsText}`,
        inline: false,
      });
    });

    if (hasMoreLicenses) {
      embed.addFields({
        name: 'Additional Licenses',
        value: `*${customer.licenses.length - 5} more licenses not shown*`,
        inline: false,
      });
    }
  }

  if (customer.metadata.length > 0) {
    embed.addFields({
      name: '\u200B',
      value: `**Metadata (${customer.metadata.length} total)**`,
      inline: false,
    });

    const displayMetadata = customer.metadata.slice(0, 10);
    const hasMoreMetadata = customer.metadata.length > 10;

    const metadataText = displayMetadata
      .map((meta) => `**${meta.key}**: ${meta.value}`)
      .join('\n');

    embed.addFields({
      name: 'Custom Fields',
      value:
        metadataText +
        (hasMoreMetadata
          ? `\n\n*${customer.metadata.length - 10} more fields not shown*`
          : ''),
      inline: false,
    });
  }

  embed.setAuthor({
    name: teamName,
    iconURL: teamImageUrl || undefined,
  });

  embed.setFooter({
    text: `Customer ${currentPage} of ${totalCustomers}`,
    iconURL: userImageUrl || undefined,
  });

  return embed;
}

export default Command({
  data: {
    name: 'browse-customers',
    description: 'Browse customers for your selected team',
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
        name: 'search',
        description: 'Search by name or email',
        type: ApplicationCommandOptionType.String,
        required: false,
      },
      {
        name: 'license',
        description: 'Filter by license key',
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
  execute: async (interaction, discordAccount) => {
    try {
      const page = interaction.options.getInteger('page') || 1;
      const search = interaction.options.getString('search') || '';
      const license = interaction.options.getString('license') || '';

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

      const totalCustomers = await prisma.customer.count({
        where: {
          teamId,
          ...(search
            ? {
                OR: [
                  { email: { contains: search, mode: 'insensitive' } },
                  { fullName: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
          ...(licenseKeyLookup
            ? { licenses: { some: { licenseKeyLookup } } }
            : {}),
        },
      });
      const totalPages = Math.max(totalCustomers, 1);

      const validPage = page > totalPages ? 1 : page;
      const skip = (validPage - 1) * PAGE_SIZE;

      const customers = await prisma.customer.findMany({
        where: {
          teamId,
          ...(search
            ? {
                OR: [
                  { email: { contains: search, mode: 'insensitive' } },
                  { fullName: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
          ...(licenseKeyLookup
            ? { licenses: { some: { licenseKeyLookup } } }
            : {}),
        },
        skip,
        take: PAGE_SIZE,
        orderBy: { createdAt: 'desc' },
        include: {
          address: true,
          metadata: true,
          licenses: {
            include: {
              products: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (customers.length === 0) {
        await interaction.editReply({
          content: 'No customers found matching your criteria.',
        });
        return;
      }

      const currentCustomer = customers[0];

      const embed = createCustomerEmbed(
        currentCustomer,
        teamName,
        teamImageUrl || null,
        validPage,
        totalCustomers,
        userImageUrl,
      );

      const actionRows = createActionRows(
        validPage,
        totalPages,
        currentCustomer.id,
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

          const newPageCustomers = await prisma.customer.findMany({
            where: {
              teamId,
              ...(search
                ? {
                    OR: [
                      { email: { contains: search, mode: 'insensitive' } },
                      { fullName: { contains: search, mode: 'insensitive' } },
                    ],
                  }
                : {}),
              ...(licenseKeyLookup
                ? { licenses: { some: { licenseKeyLookup } } }
                : {}),
            },
            skip,
            take: PAGE_SIZE,
            orderBy: { createdAt: 'desc' },
            include: {
              address: true,
              metadata: true,
              licenses: {
                include: {
                  products: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          });

          if (newPageCustomers.length === 0) {
            await i.editReply({
              content: 'No customers found for this page.',
              embeds: [],
              components: [],
            });
            return;
          }

          const newCustomer = newPageCustomers[0];

          const newEmbed = createCustomerEmbed(
            newCustomer,
            teamName,
            teamImageUrl || null,
            currentPage,
            totalCustomers,
            userImageUrl,
          );

          const newActionRows = createActionRows(
            currentPage,
            totalPages,
            newCustomer.id,
          );

          await i.editReply({
            embeds: [newEmbed],
            components: newActionRows,
          });
        } catch (error) {
          logger.error('Error handling pagination:', error);
          await i.editReply({
            content:
              'An error occurred while fetching customers. Please try again later.',
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
                  `${process.env.BASE_URL}/dashboard/customers/${currentCustomer.id}`,
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
      logger.error('Error in browse-customers command:', error);
      await interaction.editReply({
        content:
          'An error occurred while fetching customers. Please try again later.',
      });
    }
  },
});
