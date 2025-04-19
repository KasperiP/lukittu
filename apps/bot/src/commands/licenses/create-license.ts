import {
  encryptLicenseKey,
  generateHMAC,
  generateUniqueLicense,
  LicenseExpirationStart,
  LicenseExpirationType,
  logger,
  prisma,
} from '@lukittu/shared';
import { regex } from '@lukittu/shared/src/constants/regex';
import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  EmbedField,
  MessageComponentInteraction,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Command } from '../../structures/command';

const EXPIRATION_TYPES = [
  { name: 'Never Expires', value: LicenseExpirationType.NEVER },
  { name: 'Specific Date', value: LicenseExpirationType.DATE },
  { name: 'Duration (Days)', value: LicenseExpirationType.DURATION },
];

const EXPIRATION_START_TYPES = [
  { name: 'From Creation', value: LicenseExpirationStart.CREATION },
  { name: 'From First Activation', value: LicenseExpirationStart.ACTIVATION },
];

type WizardStep =
  | 'basic_info'
  | 'expiration'
  | 'limits'
  | 'metadata'
  | 'review';

interface LicenseCreationState {
  licenseKey: string;
  expirationType: LicenseExpirationType;
  expirationStart: LicenseExpirationStart;
  expirationDate?: Date;
  expirationDays?: number;
  ipLimit?: number;
  seats?: number;
  suspended: boolean;
  productIds: string[];
  customerIds: string[];
  teamId: string;
  metadata: { key: string; value: string }[];
  step: WizardStep;
}

export default Command({
  data: {
    name: 'create-license',
    description: 'Create a new license key using a step-by-step wizard',
    ephemeral: true,
    options: [
      {
        name: 'products',
        description: 'Pre-select products for the license (optional)',
        type: ApplicationCommandOptionType.String,
        required: false,
        autocomplete: true,
      },
      {
        name: 'customers',
        description: 'Pre-select customers for the license (optional)',
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

      if (focusedOption.name === 'products') {
        const products = await prisma.product.findMany({
          where: {
            teamId: teamId,
            name: { contains: focusedValue, mode: 'insensitive' },
          },
          take: 25,
        });

        const selectedProductIds = focusedValue
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v.match(regex.uuidV4));

        const suggestions = products.map((product) => ({
          name: product.name,
          value: product.id,
        }));

        if (selectedProductIds.length > 0) {
          await interaction.respond(
            suggestions.map((suggestion) => ({
              name: suggestion.name,
              value: [...selectedProductIds, suggestion.value].join(','),
            })),
          );
        } else {
          await interaction.respond(suggestions);
        }
      } else if (focusedOption.name === 'customers') {
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

        const selectedCustomerIds = focusedValue
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v.match(regex.uuidV4));

        const suggestions = customers.map((customer) => ({
          name: customer.fullName
            ? `${customer.fullName} (${customer.email})`
            : customer.email,
          value: customer.id,
        }));

        if (selectedCustomerIds.length > 0) {
          await interaction.respond(
            suggestions.map((suggestion) => ({
              name: suggestion.name,
              value: [...selectedCustomerIds, suggestion.value].join(','),
            })),
          );
        } else {
          await interaction.respond(suggestions);
        }
      }
    } catch (error) {
      logger.error('Error in create-license autocomplete:', error);
      await interaction.respond([]);
    }
  },
  execute: async (interaction, discordAccount) => {
    try {
      const selectedTeam = discordAccount?.selectedTeam;
      if (!selectedTeam) {
        await interaction.editReply({
          content: 'Please select a team first using `/choose-team`.',
        });
        return;
      }

      if (!selectedTeam.limits) {
        await interaction.editReply({
          content: 'Team limits not found. Please contact support.',
        });
        return;
      }

      const licenseCount = await prisma.license.count({
        where: { teamId: selectedTeam.id },
      });

      if (licenseCount >= selectedTeam.limits.maxLicenses) {
        await interaction.editReply({
          content: `You've reached the maximum license limit (${selectedTeam.limits.maxLicenses}) for your team. Please upgrade your plan or contact support.`,
        });
        return;
      }

      const licenseKey = await generateUniqueLicense(selectedTeam.id);

      if (!licenseKey) {
        await interaction.editReply({
          content: 'Error generating a unique license key. Please try again.',
        });
        return;
      }

      const hmac = generateHMAC(`${licenseKey}:${selectedTeam.id}`);
      const existingLicense = await prisma.license.findUnique({
        where: {
          teamId_licenseKeyLookup: {
            teamId: selectedTeam.id,
            licenseKeyLookup: hmac,
          },
        },
      });

      if (existingLicense) {
        await interaction.editReply({
          content: 'Error generating a unique license key. Please try again.',
        });
        return;
      }

      const productOption = interaction.options.getString('products');
      const productIds = productOption
        ? productOption.split(',').filter((id) => id.match(regex.uuidV4))
        : [];

      const customerOption = interaction.options.getString('customers');
      const customerIds = customerOption
        ? customerOption.split(',').filter((id) => id.match(regex.uuidV4))
        : [];

      const state: LicenseCreationState = {
        licenseKey,
        expirationType: LicenseExpirationType.NEVER,
        expirationStart: LicenseExpirationStart.CREATION,
        suspended: false,
        productIds: productIds,
        customerIds: customerIds,
        teamId: selectedTeam.id,
        metadata: [],
        step: 'basic_info',
      };

      await startLicenseWizard(
        interaction,
        state,
        discordAccount.userId,
        selectedTeam.name || 'Unknown Team',
        selectedTeam.imageUrl,
        discordAccount.user.imageUrl,
      );
    } catch (error) {
      logger.error('Error executing create-license command:', error);
      await interaction.editReply({
        content:
          'An error occurred while processing your request. Please try again later.',
      });
    }
  },
});

/**
 * Starts the license creation wizard with improved error handling
 */
async function startLicenseWizard(
  interaction: ChatInputCommandInteraction,
  state: LicenseCreationState,
  userId: string,
  teamName: string,
  teamImageUrl: string | null,
  userImageUrl: string | null,
) {
  try {
    await interaction.editReply({
      content: 'Creating license wizard...',
      embeds: [],
      components: [],
    });

    await showBasicInfoStep(interaction, state, teamName, teamImageUrl);

    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
      time: 900000, // 15 minutes
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({
          content: 'You cannot use these components.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      try {
        type HandlerFunction = (
          i: MessageComponentInteraction,
          state: LicenseCreationState,
          teamName?: string,
          teamImageUrl?: string | null,
          userImageUrl?: string | null,
        ) => Promise<void>;

        const handlers: Record<string, HandlerFunction> = {
          wizard_next: handleNextStep,
          wizard_back: handlePreviousStep,

          wizard_expiration: async (i, state) =>
            await handleExpirationTypeSelection(
              i as StringSelectMenuInteraction,
              state,
              teamName,
              teamImageUrl,
            ),
          wizard_expiration_start: async (i, state) =>
            await handleExpirationStartSelection(
              i as StringSelectMenuInteraction,
              state,
              teamName,
              teamImageUrl,
            ),
          wizard_status: async (i, state) =>
            await handleStatusSelection(
              i as StringSelectMenuInteraction,
              state,
              teamName,
              teamImageUrl,
            ),

          wizard_add_metadata: async (i, state) => {
            await handleAddMetadataModal(i, state, teamName, teamImageUrl);
          },
          wizard_create_license: async (i, state) => {
            await finalizeLicenseCreation(
              i,
              state,
              userId,
              teamName,
              teamImageUrl,
              userImageUrl,
            );
            collector.stop();
          },
          wizard_cancel: async (i) => {
            await i.update({
              content: 'License creation cancelled.',
              embeds: [],
              components: [],
            });
            collector.stop();
          },

          expiration_date_modal: handleExpirationDateModal,
          expiration_days_modal: handleExpirationDaysModal,
          limits_modal: handleLimitsModal,
        };

        const handler = handlers[i.customId];

        if (handler) {
          await handler(i, state, teamName, teamImageUrl, userImageUrl);
        } else {
          logger.info(
            `Unknown action ID: ${i.customId}. This should not happen.`,
          );
          await i.reply({
            content: 'Unknown action. Please try again.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (error) {
        await handleWizardError(i, error, 'processing your action');
      }
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'time') {
        try {
          await interaction.editReply({
            content:
              'License creation wizard timed out due to inactivity (15 minutes). Please start over if you want to create a license.',
            embeds: [],
            components: [],
          });
        } catch (error) {
          logger.error('Error handling wizard timeout:', error);
        }
      }
    });
  } catch (error) {
    logger.error('Error starting license wizard:', error);
    await interaction.editReply({
      content:
        'An error occurred while starting the license creation wizard. Please try again later.',
      embeds: [],
      components: [],
    });
  }
}

/**
 * Show the basic info step (first step)
 */
async function showBasicInfoStep(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  state: LicenseCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const embed = new EmbedBuilder()
    .setTitle('License Creation Wizard - Basic Info')
    .setColor(Colors.Blue)
    .setDescription(
      "Let's set up your new license. First, let's configure the basic settings.",
    )
    .addFields(
      {
        name: 'License Key',
        value: `\`\`\`\n${state.licenseKey}\`\`\``,
        inline: false,
      },
      {
        name: 'License Status',
        value: state.suspended ? '🔴 Suspended' : '🟢 Active',
        inline: false,
      },
    )
    .setAuthor({
      name: teamName,
      iconURL: teamImageUrl || undefined,
    })
    .setFooter({ text: 'Step 1 of 6: Basic Info' });

  const statusSelect = new StringSelectMenuBuilder()
    .setCustomId('wizard_status')
    .setPlaceholder('Select license status')
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('Active')
        .setValue('active')
        .setDescription('License is active and can be used')
        .setDefault(!state.suspended)
        .setEmoji('🟢'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Suspended')
        .setValue('suspended')
        .setDescription('License is suspended and cannot be used')
        .setDefault(state.suspended)
        .setEmoji('🔴'),
    ]);

  const statusRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(statusSelect);

  const nextButton = new ButtonBuilder()
    .setCustomId('wizard_next')
    .setLabel('Next: Expiration')
    .setStyle(ButtonStyle.Primary);

  const cancelButton = new ButtonBuilder()
    .setCustomId('wizard_cancel')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Danger);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    cancelButton,
    nextButton,
  );

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: [statusRow, buttonRow],
    });
  } else {
    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: [statusRow, buttonRow],
    });
  }
}

/**
 * Show the expiration step
 */
async function showExpirationStep(
  interaction: MessageComponentInteraction,
  state: LicenseCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const embed = new EmbedBuilder()
    .setTitle('License Creation Wizard - Expiration Settings')
    .setColor(Colors.Blue)
    .addFields(
      {
        name: 'License Key',
        value: `\`\`\`\n${state.licenseKey}\`\`\``,
        inline: false,
      },
      {
        name: 'Expiration Type',
        value: getExpirationTypeDisplay(state.expirationType),
        inline: true,
      },
    )
    .setAuthor({
      name: teamName,
      iconURL: teamImageUrl || undefined,
    })
    .setFooter({ text: 'Step 2 of 6: Expiration Settings' });

  if (state.expirationType === 'DURATION') {
    embed.addFields(
      {
        name: 'Duration (Days)',
        value: state.expirationDays
          ? state.expirationDays.toString()
          : 'Not set',
        inline: true,
      },
      {
        name: 'Starts From',
        value:
          state.expirationStart === 'ACTIVATION'
            ? 'First Activation'
            : 'Creation Date',
        inline: true,
      },
    );
  } else if (state.expirationType === 'DATE') {
    embed.addFields({
      name: 'Expiration Date',
      value: state.expirationDate
        ? `<t:${Math.floor(state.expirationDate.getTime() / 1000)}:f>`
        : 'Not set',
      inline: true,
    });
  }

  const expirationTypeSelect = new StringSelectMenuBuilder()
    .setCustomId('wizard_expiration')
    .setPlaceholder('Select expiration type')
    .addOptions(
      EXPIRATION_TYPES.map((type) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(type.name)
          .setValue(type.value)
          .setDefault(state.expirationType === type.value),
      ),
    );

  const typeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    expirationTypeSelect,
  );

  const components: ActionRowBuilder<
    StringSelectMenuBuilder | ButtonBuilder
  >[] = [typeRow];

  if (state.expirationType === 'DURATION') {
    const expirationStartSelect = new StringSelectMenuBuilder()
      .setCustomId('wizard_expiration_start')
      .setPlaceholder('When does expiration counting begin?')
      .addOptions(
        EXPIRATION_START_TYPES.map((type) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(type.name)
            .setValue(type.value)
            .setDefault(state.expirationStart === type.value),
        ),
      );

    const startRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        expirationStartSelect,
      );

    components.push(startRow);

    const daysButton = new ButtonBuilder()
      .setCustomId('expiration_days_modal')
      .setLabel(
        state.expirationDays
          ? `Set Days (Current: ${state.expirationDays})`
          : 'Set Expiration Days',
      )
      .setStyle(ButtonStyle.Secondary);

    const daysRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      daysButton,
    );

    components.push(daysRow);
  } else if (state.expirationType === 'DATE') {
    const dateButton = new ButtonBuilder()
      .setCustomId('expiration_date_modal')
      .setLabel(
        state.expirationDate ? 'Change Expiration Date' : 'Set Expiration Date',
      )
      .setStyle(ButtonStyle.Secondary);

    const dateRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      dateButton,
    );

    components.push(dateRow);
  }

  const backButton = new ButtonBuilder()
    .setCustomId('wizard_back')
    .setLabel('Back')
    .setStyle(ButtonStyle.Secondary);

  const nextButton = new ButtonBuilder()
    .setCustomId('wizard_next')
    .setLabel('Next: Limits')
    .setStyle(ButtonStyle.Primary);

  if (
    (state.expirationType === 'DURATION' && !state.expirationDays) ||
    (state.expirationType === 'DATE' && !state.expirationDate)
  ) {
    nextButton.setDisabled(true);
  }

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    backButton,
    nextButton,
  );

  components.push(navRow);

  await interaction.update({
    embeds: [embed],
    components: components,
  });
}

/**
 * Show the limits step
 */
async function showLimitsStep(
  interaction: MessageComponentInteraction,
  state: LicenseCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const embed = new EmbedBuilder()
    .setTitle('License Creation Wizard - License Limits')
    .setColor(Colors.Blue)
    .setDescription(
      'Set optional limits for this license. Leave them empty for no restrictions.',
    )
    .addFields(
      {
        name: 'License Key',
        value: `\`\`\`\n${state.licenseKey}\`\`\``,
        inline: false,
      },
      {
        name: 'IP Address Limit',
        value: state.ipLimit ? state.ipLimit.toString() : 'No limit',
        inline: true,
      },
      {
        name: 'Concurrent users',
        value: state.seats ? state.seats.toString() : 'No limit',
        inline: true,
      },
    )
    .setAuthor({
      name: teamName,
      iconURL: teamImageUrl || undefined,
    })
    .setFooter({ text: 'Step 3 of 6: License Limits' });

  const limitsButton = new ButtonBuilder()
    .setCustomId('limits_modal')
    .setLabel('Set License Limits')
    .setStyle(ButtonStyle.Secondary);

  const limitsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    limitsButton,
  );

  const backButton = new ButtonBuilder()
    .setCustomId('wizard_back')
    .setLabel('Back')
    .setStyle(ButtonStyle.Secondary);

  const nextButton = new ButtonBuilder()
    .setCustomId('wizard_next')
    .setLabel('Next: Products')
    .setStyle(ButtonStyle.Primary);

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    backButton,
    nextButton,
  );

  await interaction.update({
    embeds: [embed],
    components: [limitsRow, navRow],
  });
}

/**
 * Show the metadata step
 */
async function showMetadataStep(
  interaction: MessageComponentInteraction,
  state: LicenseCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const embed = new EmbedBuilder()
    .setTitle('License Creation Wizard - Metadata')
    .setColor(Colors.Blue)
    .setDescription(
      'Add optional metadata to your license (e.g., purchaseId, notes).',
    )
    .addFields({
      name: 'License Key',
      value: `\`\`\`\n${state.licenseKey}\`\`\``,
      inline: false,
    })
    .setAuthor({
      name: teamName,
      iconURL: teamImageUrl || undefined,
    })
    .setFooter({ text: 'Step 6 of 6: Metadata' });

  if (state.metadata.length > 0) {
    embed.addFields({
      name: `Metadata Fields (${state.metadata.length})`,
      value: state.metadata.map((m) => `• **${m.key}**: ${m.value}`).join('\n'),
      inline: false,
    });
  } else {
    embed.addFields({
      name: 'Metadata',
      value: 'No metadata defined',
      inline: false,
    });
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  const addMetadataButton = new ButtonBuilder()
    .setCustomId('wizard_add_metadata')
    .setLabel('Add Metadata Field')
    .setStyle(ButtonStyle.Secondary);

  const addRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    addMetadataButton,
  );

  components.push(addRow);

  const backButton = new ButtonBuilder()
    .setCustomId('wizard_back')
    .setLabel('Back')
    .setStyle(ButtonStyle.Secondary);

  const nextButton = new ButtonBuilder()
    .setCustomId('wizard_next')
    .setLabel('Review & Create')
    .setStyle(ButtonStyle.Primary);

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    backButton,
    nextButton,
  );

  components.push(navRow);

  await interaction.update({
    embeds: [embed],
    components: components,
  });
}

/**
 * Show the final review step
 */
async function showReviewStep(
  interaction: MessageComponentInteraction,
  state: LicenseCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const products =
    state.productIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: state.productIds } },
        })
      : [];

  const customers =
    state.customerIds.length > 0
      ? await prisma.customer.findMany({
          where: { id: { in: state.customerIds } },
        })
      : [];

  const embed = new EmbedBuilder()
    .setTitle('License Creation - Final Review')
    .setColor(Colors.Gold)
    .setDescription('Please review your license details before creation.')
    .addFields(
      {
        name: 'License Key',
        value: `\`\`\`\n${state.licenseKey}\`\`\``,
        inline: false,
      },
      {
        name: 'Status',
        value: state.suspended ? '🔴 Suspended' : '🟢 Active',
        inline: true,
      },
    )
    .setAuthor({
      name: teamName,
      iconURL: teamImageUrl || undefined,
    });

  if (state.expirationType === LicenseExpirationType.NEVER) {
    embed.addFields({
      name: 'Expiration',
      value: '♾️ Never expires',
      inline: true,
    });
  } else if (
    state.expirationType === LicenseExpirationType.DATE &&
    state.expirationDate
  ) {
    embed.addFields({
      name: 'Expiration Date',
      value: `📅 <t:${Math.floor(state.expirationDate.getTime() / 1000)}:f>`,
      inline: true,
    });
  } else if (
    state.expirationType === LicenseExpirationType.DURATION &&
    state.expirationDays
  ) {
    embed.addFields({
      name: 'Expiration',
      value: `⏱️ ${state.expirationDays} days from ${state.expirationStart === 'ACTIVATION' ? 'first activation' : 'creation'}`,
      inline: true,
    });
  }

  const limitsFields: EmbedField[] = [];
  if (state.ipLimit) {
    limitsFields.push({
      name: 'IP Limit',
      value: state.ipLimit.toString(),
      inline: true,
    });
  }

  if (state.seats) {
    limitsFields.push({
      name: 'Concurrent users',
      value: state.seats.toString(),
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

  if (products.length > 0) {
    embed.addFields(
      {
        name: '\u200B',
        value: `**Products (${products.length} total)**`,
        inline: false,
      },
      {
        name: 'Assigned Products',
        value: products.map((p) => `• ${p.name}`).join('\n'),
        inline: false,
      },
    );
  } else {
    embed.addFields(
      { name: '\u200B', value: '**Products**', inline: false },
      { name: 'Assigned Products', value: 'None', inline: false },
    );
  }

  if (customers.length > 0) {
    embed.addFields(
      {
        name: '\u200B',
        value: `**Customers (${customers.length} total)**`,
        inline: false,
      },
      {
        name: 'Assigned Customers',
        value: customers.map((c) => `• ${c.fullName || c.email}`).join('\n'),
        inline: false,
      },
    );
  } else {
    embed.addFields(
      { name: '\u200B', value: '**Customers**', inline: false },
      { name: 'Assigned Customers', value: 'None', inline: false },
    );
  }

  if (state.metadata.length > 0) {
    embed.addFields(
      {
        name: '\u200B',
        value: `**Metadata (${state.metadata.length} total)**`,
        inline: false,
      },
      {
        name: 'Custom Fields',
        value: state.metadata
          .map((m) => `• **${m.key}**: ${m.value}`)
          .join('\n'),
        inline: false,
      },
    );
  }

  const backButton = new ButtonBuilder()
    .setCustomId('wizard_back')
    .setLabel('Back')
    .setStyle(ButtonStyle.Secondary);

  const createButton = new ButtonBuilder()
    .setCustomId('wizard_create_license')
    .setLabel('Create License')
    .setStyle(ButtonStyle.Success);

  const cancelButton = new ButtonBuilder()
    .setCustomId('wizard_cancel')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Danger);

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    cancelButton,
    backButton,
    createButton,
  );

  await interaction.update({
    embeds: [embed],
    components: [navRow],
  });
}

/**
 * Handle navigation to the next step in the wizard
 */
async function handleNextStep(
  interaction: MessageComponentInteraction,
  state: LicenseCreationState,
  teamName?: string,
  teamImageUrl?: string | null,
) {
  try {
    const team = teamName || 'Unknown Team';
    const imageUrl = teamImageUrl || null;

    switch (state.step) {
      case 'basic_info':
        state.step = 'expiration';
        await showExpirationStep(interaction, state, team, imageUrl);
        break;
      case 'expiration':
        state.step = 'limits';
        await showLimitsStep(interaction, state, team, imageUrl);
        break;
      case 'limits':
        state.step = 'metadata';
        await showMetadataStep(interaction, state, team, imageUrl);
        break;
      case 'metadata':
        state.step = 'review';
        await showReviewStep(interaction, state, team, imageUrl);
        break;
    }
  } catch (error) {
    await handleWizardError(interaction, error, 'navigating to the next step');
  }
}

/**
 * Handle navigation to the previous step in the wizard
 */
async function handlePreviousStep(
  interaction: MessageComponentInteraction,
  state: LicenseCreationState,
  teamName?: string,
  teamImageUrl?: string | null,
) {
  try {
    const team = teamName || 'Unknown Team';
    const imageUrl = teamImageUrl || null;

    switch (state.step) {
      case 'expiration':
        state.step = 'basic_info';
        await showBasicInfoStep(interaction, state, team, imageUrl);
        break;
      case 'limits':
        state.step = 'expiration';
        await showExpirationStep(interaction, state, team, imageUrl);
        break;
      case 'metadata':
        state.step = 'limits';
        await showLimitsStep(interaction, state, team, imageUrl);
        break;
      case 'review':
        state.step = 'metadata';
        await showMetadataStep(interaction, state, team, imageUrl);
        break;
    }
  } catch (error) {
    await handleWizardError(
      interaction,
      error,
      'navigating to the previous step',
    );
  }
}

/**
 * Handle expiration type selection
 */
async function handleExpirationTypeSelection(
  interaction: StringSelectMenuInteraction,
  state: LicenseCreationState,
  teamName?: string,
  teamImageUrl?: string | null,
) {
  try {
    const selectedType = interaction.values[0] as LicenseExpirationType;
    state.expirationType = selectedType;

    if (selectedType === LicenseExpirationType.NEVER) {
      state.expirationDate = undefined;
      state.expirationDays = undefined;
      state.expirationStart = LicenseExpirationStart.CREATION;
    }

    await showExpirationStep(
      interaction,
      state,
      teamName || 'Unknown Team',
      teamImageUrl || null,
    );
  } catch (error) {
    await handleWizardError(interaction, error, 'updating expiration type');
  }
}

/**
 * Handle expiration start selection
 */
async function handleExpirationStartSelection(
  interaction: StringSelectMenuInteraction,
  state: LicenseCreationState,
  teamName?: string,
  teamImageUrl?: string | null,
) {
  try {
    state.expirationStart = interaction.values[0] as LicenseExpirationStart;

    await interaction.deferUpdate();

    const embed = new EmbedBuilder()
      .setTitle('License Creation Wizard - Expiration Settings')
      .setColor(Colors.Blue)
      .addFields(
        {
          name: 'License Key',
          value: `\`\`\`\n${state.licenseKey}\`\`\``,
          inline: false,
        },
        {
          name: 'Expiration Type',
          value: getExpirationTypeDisplay(state.expirationType),
          inline: true,
        },
        {
          name: 'Duration (Days)',
          value: state.expirationDays
            ? state.expirationDays.toString()
            : 'Not set',
          inline: true,
        },
        {
          name: 'Starts From',
          value:
            state.expirationStart === 'ACTIVATION'
              ? 'First Activation'
              : 'Creation Date',
          inline: true,
        },
      )
      .setAuthor({
        name: teamName || 'Unknown Team',
        iconURL: teamImageUrl || undefined,
      })
      .setFooter({ text: 'Step 2 of 6: Expiration Settings' });

    const components: ActionRowBuilder<
      StringSelectMenuBuilder | ButtonBuilder
    >[] = [];

    const typeRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('wizard_expiration')
          .setPlaceholder('Select expiration type')
          .addOptions(
            EXPIRATION_TYPES.map((type) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(type.name)
                .setValue(type.value)
                .setDefault(state.expirationType === type.value),
            ),
          ),
      );
    components.push(typeRow);

    const startRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('wizard_expiration_start')
          .setPlaceholder('When does expiration counting begin?')
          .addOptions(
            EXPIRATION_START_TYPES.map((type) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(type.name)
                .setValue(type.value)
                .setDefault(state.expirationStart === type.value),
            ),
          ),
      );
    components.push(startRow);

    const daysRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('expiration_days_modal')
        .setLabel(
          state.expirationDays
            ? `Set Days (Current: ${state.expirationDays})`
            : 'Set Expiration Days',
        )
        .setStyle(ButtonStyle.Secondary),
    );
    components.push(daysRow);

    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('wizard_back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('wizard_next')
        .setLabel('Next: Limits')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!state.expirationDays),
    );
    components.push(navRow);

    await interaction.editReply({
      embeds: [embed],
      components: components,
    });
  } catch (error) {
    logger.error('Error handling expiration start selection:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content:
            'An error occurred while updating the expiration settings. Please try again.',
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.followUp({
          content:
            'An error occurred while updating the expiration settings. Please try again.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (secondError) {
      logger.error('Error handling error response:', secondError);
    }
  }
}

/**
 * Handle license status selection
 */
async function handleStatusSelection(
  interaction: StringSelectMenuInteraction,
  state: LicenseCreationState,
  teamName?: string,
  teamImageUrl?: string | null,
) {
  state.suspended = interaction.values[0] === 'suspended';

  const embed = new EmbedBuilder()
    .setTitle('License Creation Wizard - Basic Info')
    .setColor(Colors.Blue)
    .setDescription(
      "Let's set up your new license. First, let's configure the basic settings.",
    )
    .addFields(
      {
        name: 'License Key',
        value: `\`\`\`\n${state.licenseKey}\`\`\``,
        inline: false,
      },
      {
        name: 'License Status',
        value: state.suspended ? '🔴 Suspended' : '🟢 Active',
        inline: false,
      },
    )
    .setAuthor({
      name: teamName || 'Unknown Team',
      iconURL: teamImageUrl || undefined,
    })
    .setFooter({ text: 'Step 1 of 6: Basic Info' });

  const statusSelect = new StringSelectMenuBuilder()
    .setCustomId('wizard_status')
    .setPlaceholder('Select license status')
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('Active')
        .setValue('active')
        .setDescription('License is active and can be used')
        .setDefault(!state.suspended)
        .setEmoji('🟢'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Suspended')
        .setValue('suspended')
        .setDescription('License is suspended and cannot be used')
        .setDefault(state.suspended)
        .setEmoji('🔴'),
    ]);

  const statusRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(statusSelect);

  const nextButton = new ButtonBuilder()
    .setCustomId('wizard_next')
    .setLabel('Next: Expiration')
    .setStyle(ButtonStyle.Primary);

  const cancelButton = new ButtonBuilder()
    .setCustomId('wizard_cancel')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Danger);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    cancelButton,
    nextButton,
  );

  await interaction.update({
    embeds: [embed],
    components: [statusRow, buttonRow],
  });
}

/**
 * Handle expiration date modal
 */
async function handleExpirationDateModal(
  interaction: MessageComponentInteraction,
  state: LicenseCreationState,
) {
  const modal = new ModalBuilder()
    .setCustomId('expiration_date_modal')
    .setTitle('Set Expiration Date');

  const dateInput = new TextInputBuilder()
    .setCustomId('expiration_date')
    .setLabel('Expiration Date (YYYY-MM-DD)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 2025-12-31')
    .setRequired(true);

  if (state.expirationDate) {
    const date = state.expirationDate;
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    dateInput.setValue(`${year}-${month}-${day}`);
  }

  const dateRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    dateInput,
  );

  modal.addComponents(dateRow);
  await interaction.showModal(modal);

  try {
    const modalResponse = await interaction.awaitModalSubmit({
      time: 120000,
    });

    const dateString =
      modalResponse.fields.getTextInputValue('expiration_date');
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      await modalResponse.reply({
        content: 'Invalid date format. Please use YYYY-MM-DD format.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (date <= new Date()) {
      await modalResponse.reply({
        content: 'Expiration date must be in the future.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    state.expirationDate = date;

    await modalResponse.deferUpdate();

    const embed = new EmbedBuilder()
      .setTitle('License Creation Wizard - Expiration Settings')
      .setColor(Colors.Blue)
      .addFields(
        {
          name: 'License Key',
          value: `\`\`\`\n${state.licenseKey}\`\`\``,
          inline: false,
        },
        {
          name: 'Expiration Type',
          value: getExpirationTypeDisplay(state.expirationType),
          inline: true,
        },
      );

    embed.addFields({
      name: 'Expiration Date',
      value: `<t:${Math.floor(state.expirationDate.getTime() / 1000)}:f>`,
      inline: true,
    });

    embed.setFooter({ text: 'Step 2 of 6: Expiration Settings' });

    const expirationTypeSelect = new StringSelectMenuBuilder()
      .setCustomId('wizard_expiration')
      .setPlaceholder('Select expiration type')
      .addOptions(
        EXPIRATION_TYPES.map((type) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(type.name)
            .setValue(type.value)
            .setDefault(state.expirationType === type.value),
        ),
      );

    const typeRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        expirationTypeSelect,
      );

    const dateButton = new ButtonBuilder()
      .setCustomId('expiration_date_modal')
      .setLabel('Change Expiration Date')
      .setStyle(ButtonStyle.Secondary);

    const dateRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      dateButton,
    );

    const backButton = new ButtonBuilder()
      .setCustomId('wizard_back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary);

    const nextButton = new ButtonBuilder()
      .setCustomId('wizard_next')
      .setLabel('Next: Limits')
      .setStyle(ButtonStyle.Primary);

    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      backButton,
      nextButton,
    );

    await modalResponse.editReply({
      embeds: [embed],
      components: [typeRow, dateRow, navRow],
    });
  } catch (error) {
    logger.error('Error handling expiration date modal:', error);
  }
}

/**
 * Handle expiration days modal
 */
async function handleExpirationDaysModal(
  interaction: MessageComponentInteraction,
  state: LicenseCreationState,
) {
  const modal = new ModalBuilder()
    .setCustomId('expiration_days_modal')
    .setTitle('Set Expiration Days');

  const daysInput = new TextInputBuilder()
    .setCustomId('expiration_days')
    .setLabel('Number of Days')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 30, 90, 365')
    .setRequired(true);

  if (state.expirationDays) {
    daysInput.setValue(state.expirationDays.toString());
  }

  const daysRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    daysInput,
  );

  modal.addComponents(daysRow);
  await interaction.showModal(modal);

  try {
    const modalResponse = await interaction.awaitModalSubmit({
      time: 120000,
    });

    const days = parseInt(
      modalResponse.fields.getTextInputValue('expiration_days'),
    );

    if (isNaN(days) || days < 1) {
      await modalResponse.reply({
        content: 'Please enter a valid positive number for days.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    state.expirationDays = days;

    const date = new Date();
    date.setDate(date.getDate() + days);
    state.expirationDate = date;

    await modalResponse.deferUpdate();

    const embed = new EmbedBuilder()
      .setTitle('License Creation Wizard - Expiration Settings')
      .setColor(Colors.Blue)
      .addFields(
        {
          name: 'License Key',
          value: `\`\`\`\n${state.licenseKey}\`\`\``,
          inline: false,
        },
        {
          name: 'Expiration Type',
          value: getExpirationTypeDisplay(state.expirationType),
          inline: true,
        },
        {
          name: 'Duration (Days)',
          value: state.expirationDays.toString(),
          inline: true,
        },
        {
          name: 'Starts From',
          value:
            state.expirationStart === 'ACTIVATION'
              ? 'First Activation'
              : 'Creation Date',
          inline: true,
        },
      )
      .setFooter({ text: 'Step 2 of 6: Expiration Settings' });

    const expirationTypeSelect = new StringSelectMenuBuilder()
      .setCustomId('wizard_expiration')
      .setPlaceholder('Select expiration type')
      .addOptions(
        EXPIRATION_TYPES.map((type) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(type.name)
            .setValue(type.value)
            .setDefault(state.expirationType === type.value),
        ),
      );

    const typeRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        expirationTypeSelect,
      );

    const expirationStartSelect = new StringSelectMenuBuilder()
      .setCustomId('wizard_expiration_start')
      .setPlaceholder('When does expiration counting begin?')
      .addOptions(
        EXPIRATION_START_TYPES.map((type) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(type.name)
            .setValue(type.value)
            .setDefault(state.expirationStart === type.value),
        ),
      );

    const startRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        expirationStartSelect,
      );

    const daysButton = new ButtonBuilder()
      .setCustomId('expiration_days_modal')
      .setLabel(`Set Days (Current: ${state.expirationDays})`)
      .setStyle(ButtonStyle.Secondary);

    const daysRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      daysButton,
    );

    const backButton = new ButtonBuilder()
      .setCustomId('wizard_back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary);

    const nextButton = new ButtonBuilder()
      .setCustomId('wizard_next')
      .setLabel('Next: Limits')
      .setStyle(ButtonStyle.Primary);

    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      backButton,
      nextButton,
    );

    await modalResponse.editReply({
      embeds: [embed],
      components: [typeRow, startRow, daysRow, navRow],
    });
  } catch (error) {
    logger.error('Error handling expiration days modal:', error);
  }
}

/**
 * Handle limits modal
 */
async function handleLimitsModal(
  interaction: MessageComponentInteraction,
  state: LicenseCreationState,
) {
  const modal = new ModalBuilder()
    .setCustomId('limits_modal')
    .setTitle('Set License Limits');

  const ipLimitInput = new TextInputBuilder()
    .setCustomId('ip_limit')
    .setLabel('IP Address Limit (leave empty for no limit)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 3')
    .setRequired(false);

  if (state.ipLimit) {
    ipLimitInput.setValue(state.ipLimit.toString());
  }

  const seatsInput = new TextInputBuilder()
    .setCustomId('seats')
    .setLabel('Concurrent users (leave empty for no limit)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 5')
    .setRequired(false);

  if (state.seats) {
    seatsInput.setValue(state.seats.toString());
  }

  const ipRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    ipLimitInput,
  );
  const seatsRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    seatsInput,
  );

  modal.addComponents(ipRow, seatsRow);
  await interaction.showModal(modal);

  try {
    const modalResponse = await interaction.awaitModalSubmit({
      time: 120000,
    });

    const ipLimitStr = modalResponse.fields.getTextInputValue('ip_limit');
    const seatsStr = modalResponse.fields.getTextInputValue('seats');

    if (ipLimitStr) {
      const ipLimit = parseInt(ipLimitStr);
      if (isNaN(ipLimit) || ipLimit < 1) {
        await modalResponse.reply({
          content: 'IP limit must be a positive number.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      state.ipLimit = ipLimit;
    } else {
      state.ipLimit = undefined;
    }

    if (seatsStr) {
      const seats = parseInt(seatsStr);
      if (isNaN(seats) || seats < 1) {
        await modalResponse.reply({
          content: 'Concurrent users must be a positive number.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      state.seats = seats;
    } else {
      state.seats = undefined;
    }

    await modalResponse.deferUpdate();

    const embed = new EmbedBuilder()
      .setTitle('License Creation Wizard - License Limits')
      .setColor(Colors.Blue)
      .setDescription(
        'Set optional limits for this license. Leave them empty for no restrictions.',
      )
      .addFields(
        {
          name: 'License Key',
          value: `\`\`\`\n${state.licenseKey}\`\`\``,
          inline: false,
        },
        {
          name: 'IP Address Limit',
          value: state.ipLimit ? state.ipLimit.toString() : 'No limit',
          inline: true,
        },
        {
          name: 'Concurrent users',
          value: state.seats ? state.seats.toString() : 'No limit',
          inline: true,
        },
      )
      .setFooter({ text: 'Step 3 of 6: License Limits' });

    const limitsButton = new ButtonBuilder()
      .setCustomId('limits_modal')
      .setLabel('Set License Limits')
      .setStyle(ButtonStyle.Secondary);

    const limitsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      limitsButton,
    );

    const backButton = new ButtonBuilder()
      .setCustomId('wizard_back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary);

    const nextButton = new ButtonBuilder()
      .setCustomId('wizard_next')
      .setLabel('Next: Products')
      .setStyle(ButtonStyle.Primary);

    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      backButton,
      nextButton,
    );

    await modalResponse.editReply({
      embeds: [embed],
      components: [limitsRow, navRow],
    });
  } catch (error) {
    logger.error('Error handling limits modal:', error);
  }
}

/**
 * Handle add metadata modal
 */
async function handleAddMetadataModal(
  interaction: MessageComponentInteraction,
  state: LicenseCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const modal = new ModalBuilder()
    .setCustomId('metadata_modal')
    .setTitle('Add License Metadata');

  const keyInput = new TextInputBuilder()
    .setCustomId('metadata_key')
    .setLabel('Metadata Key')
    .setPlaceholder('e.g., purchaseId, orderId, note')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(255);

  const valueInput = new TextInputBuilder()
    .setCustomId('metadata_value')
    .setLabel('Metadata Value')
    .setPlaceholder('e.g., #123456, Premium Package')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(255);

  const keyRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    keyInput,
  );
  const valueRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    valueInput,
  );

  modal.addComponents(keyRow, valueRow);
  await interaction.showModal(modal);

  try {
    const modalResponse = await interaction.awaitModalSubmit({
      time: 120000,
    });

    const key = modalResponse.fields.getTextInputValue('metadata_key');
    const value = modalResponse.fields.getTextInputValue('metadata_value');

    if (!key || !value) {
      await modalResponse.reply({
        content: 'Both key and value are required for metadata.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    state.metadata.push({ key, value });

    await modalResponse.deferUpdate();

    const embed = new EmbedBuilder()
      .setTitle('License Creation Wizard - Metadata')
      .setColor(Colors.Blue)
      .setDescription(
        'Add optional metadata to your license (e.g., purchaseId, notes).',
      )
      .addFields({
        name: 'License Key',
        value: `\`\`\`\n${state.licenseKey}\`\`\``,
        inline: false,
      })
      .setAuthor({
        name: teamName,
        iconURL: teamImageUrl || undefined,
      })
      .setFooter({ text: 'Step 6 of 6: Metadata' });

    if (state.metadata.length > 0) {
      embed.addFields({
        name: `Metadata Fields (${state.metadata.length})`,
        value: state.metadata
          .map((m) => `• **${m.key}**: ${m.value}`)
          .join('\n'),
        inline: false,
      });
    } else {
      embed.addFields({
        name: 'Metadata',
        value: 'No metadata defined',
        inline: false,
      });
    }

    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    const addMetadataButton = new ButtonBuilder()
      .setCustomId('wizard_add_metadata')
      .setLabel('Add Metadata Field')
      .setStyle(ButtonStyle.Secondary);

    const addRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      addMetadataButton,
    );

    components.push(addRow);

    const backButton = new ButtonBuilder()
      .setCustomId('wizard_back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary);

    const nextButton = new ButtonBuilder()
      .setCustomId('wizard_next')
      .setLabel('Review & Create')
      .setStyle(ButtonStyle.Primary);

    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      backButton,
      nextButton,
    );

    components.push(navRow);

    await modalResponse.editReply({
      embeds: [embed],
      components: components,
    });
  } catch (error) {
    logger.error('Error handling metadata modal submit:', error);
  }
}

/**
 * Finalize license creation
 */
async function finalizeLicenseCreation(
  interaction: MessageComponentInteraction,
  state: LicenseCreationState,
  userId: string,
  teamName?: string,
  teamImageUrl?: string | null,
  userImageUrl?: string | null,
) {
  try {
    await interaction.deferUpdate();

    let expirationDate = state.expirationDate || null;
    let expirationDays = state.expirationDays || null;
    let expirationStart =
      state.expirationStart || LicenseExpirationStart.CREATION;

    if (state.expirationType === LicenseExpirationType.NEVER) {
      expirationDate = null;
      expirationDays = null;
      expirationStart = LicenseExpirationStart.CREATION;
    }

    if (state.expirationType === LicenseExpirationType.DATE) {
      expirationDays = null;
    }

    const hmac = generateHMAC(`${state.licenseKey}:${state.teamId}`);
    const encryptedLicenseKey = encryptLicenseKey(state.licenseKey);

    const license = await prisma.license.create({
      data: {
        licenseKey: encryptedLicenseKey,
        licenseKeyLookup: hmac,
        ipLimit: state.ipLimit || null,
        expirationType: state.expirationType,
        expirationStart: expirationStart,
        expirationDate: expirationDate,
        expirationDays: expirationDays,
        seats: state.seats || null,
        suspended: state.suspended,
        teamId: state.teamId,
        createdByUserId: userId,
        metadata:
          state.metadata.length > 0
            ? {
                createMany: {
                  data: state.metadata.map((m) => ({
                    key: m.key,
                    value: m.value,
                    teamId: state.teamId,
                  })),
                },
              }
            : undefined,
        products:
          state.productIds.length > 0
            ? { connect: state.productIds.map((id) => ({ id })) }
            : undefined,
        customers:
          state.customerIds.length > 0
            ? { connect: state.customerIds.map((id) => ({ id })) }
            : undefined,
      },
    });

    const successEmbed = new EmbedBuilder()
      .setTitle('License Created Successfully')
      .setColor(Colors.Green)
      .setDescription(`Your license key has been created.`)
      .addFields(
        {
          name: 'ID',
          value: `\`\`\`yaml\n${license.id}\`\`\``,
          inline: false,
        },
        {
          name: 'License Key',
          value: `\`\`\`\n${state.licenseKey}\`\`\``,
          inline: false,
        },
      )
      .setAuthor({
        name: teamName || 'Unknown Team',
        iconURL: teamImageUrl || undefined,
      })
      .setFooter({
        text: 'License created successfully',
        iconURL: userImageUrl || undefined,
      });

    const dashboardButton = new ButtonBuilder()
      .setLabel('View in Dashboard')
      .setURL(`${process.env.BASE_URL}/dashboard/licenses/${license.id}`)
      .setStyle(ButtonStyle.Link);

    const finalRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      dashboardButton,
    );

    await interaction.editReply({
      content: null,
      embeds: [successEmbed],
      components: [finalRow],
    });
  } catch (error) {
    logger.error('Error creating license:', error);

    try {
      await interaction.editReply({
        content:
          'An error occurred while creating the license. Please try again later.',
        embeds: [],
        components: [],
      });
    } catch (secondError) {
      logger.error('Failed to send error response:', secondError);
    }
  }
}

/**
 * Centralized error handler for wizard interactions
 */
async function handleWizardError(
  interaction: MessageComponentInteraction | StringSelectMenuInteraction,
  error: unknown,
  context: string,
) {
  logger.error(`Error ${context}:`, error);

  try {
    const errorMessage = `An error occurred while ${context}. Please try again.`;

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: errorMessage,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.followUp({
        content: errorMessage,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (followupError) {
    logger.error('Failed to send error response:', followupError);
  }
}

/**
 * Helper to get a display string for expiration type
 */
function getExpirationTypeDisplay(type: LicenseExpirationType): string {
  switch (type) {
    case LicenseExpirationType.NEVER:
      return '♾️ Never Expires';
    case LicenseExpirationType.DATE:
      return '📅 Specific Date';
    case LicenseExpirationType.DURATION:
      return '⏱️ Duration (Days)';
    default:
      return 'Unknown';
  }
}
