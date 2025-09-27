import {
  attemptWebhookDelivery,
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  createCustomerPayload,
  createWebhookEvents,
  logger,
  Prisma,
  prisma,
  regex,
  WebhookEventType,
} from '@lukittu/shared';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  MessageComponentInteraction,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  UserSelectMenuInteraction,
} from 'discord.js';
import { Command } from '../../structures/command';

type WizardStep =
  | 'basic_info'
  | 'address'
  | 'metadata'
  | 'discord_user'
  | 'review';

interface CustomerCreationState {
  username: string | null;
  email: string | null;
  fullName: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  };
  metadata: { key: string; value: string }[];
  discordAccount: {
    discordId: string | null;
    username: string | null;
    avatar: string | null;
    globalName: string | null;
    isAlreadyLinked?: boolean;
  };
  step: WizardStep;
}

function validateUsername(username: string | null): {
  isValid: boolean;
  message?: string;
} {
  if (!username) return { isValid: true }; // It's optional if email is present
  if (username.length < 1) {
    return { isValid: false, message: 'Username must not be empty' };
  }
  if (username.length > 255) {
    return {
      isValid: false,
      message: 'Username must be less than 255 characters',
    };
  }
  return { isValid: true };
}

function validateEmail(email: string | null): {
  isValid: boolean;
  message?: string;
} {
  if (!email) return { isValid: true }; // It's optional if username is present

  if (email.length > 255) {
    return {
      isValid: false,
      message: 'Email must be less than 255 characters',
    };
  }
  if (!regex.email.test(email)) {
    return { isValid: false, message: 'Invalid email address' };
  }
  return { isValid: true };
}

function validateEmailOrUsername(
  email: string | null,
  username: string | null,
): { isValid: boolean; message?: string } {
  if (!email && !username) {
    return {
      isValid: false,
      message: 'Either email or username must be provided',
    };
  }
  return { isValid: true };
}

function validateFullName(fullName: string | null): {
  isValid: boolean;
  message?: string;
} {
  if (!fullName) return { isValid: true }; // It's optional
  if (fullName.length < 3) {
    return { isValid: false, message: 'Name must be at least 3 characters' };
  }
  if (fullName.length > 255) {
    return { isValid: false, message: 'Name must be less than 255 characters' };
  }
  return { isValid: true };
}

function validateAddressField(
  value: string | null,
  fieldName: string,
  minLength?: number,
  maxLength?: number,
): { isValid: boolean; message?: string } {
  if (!value) return { isValid: true };

  if (minLength && value.length < minLength) {
    return {
      isValid: false,
      message: `${fieldName} must be at least ${minLength} characters`,
    };
  }

  if (maxLength && value.length > maxLength) {
    return {
      isValid: false,
      message: `${fieldName} must be less than ${maxLength} characters`,
    };
  }

  return { isValid: true };
}

function validateMetadataItem(
  key: string,
  value: string,
): { isValid: boolean; message?: string } {
  if (!key) {
    return { isValid: false, message: 'Key is required' };
  }
  if (key.length > 255) {
    return { isValid: false, message: 'Key must be less than 255 characters' };
  }
  if (!value) {
    return { isValid: false, message: 'Value is required' };
  }
  if (value.length > 255) {
    return {
      isValid: false,
      message: 'Value must be less than 255 characters',
    };
  }
  return { isValid: true };
}

function validateAddress(address: CustomerCreationState['address']): {
  isValid: boolean;
  field?: string;
  message?: string;
} {
  // Validate line1
  const line1Validation = validateAddressField(
    address.line1,
    'Street line 1',
    5,
    255,
  );
  if (!line1Validation.isValid) {
    return { isValid: false, field: 'line1', message: line1Validation.message };
  }

  // Validate line2
  const line2Validation = validateAddressField(
    address.line2,
    'Street line 2',
    undefined,
    255,
  );
  if (!line2Validation.isValid) {
    return { isValid: false, field: 'line2', message: line2Validation.message };
  }

  // Validate city
  const cityValidation = validateAddressField(address.city, 'City', 2, 100);
  if (!cityValidation.isValid) {
    return { isValid: false, field: 'city', message: cityValidation.message };
  }

  // Validate state/province
  const stateValidation = validateAddressField(
    address.state,
    'State/Province',
    2,
    100,
  );
  if (!stateValidation.isValid) {
    return { isValid: false, field: 'state', message: stateValidation.message };
  }

  // Validate postal code
  const postalValidation = validateAddressField(
    address.postalCode,
    'Postal code',
    3,
    20,
  );
  if (!postalValidation.isValid) {
    return {
      isValid: false,
      field: 'postalCode',
      message: postalValidation.message,
    };
  }

  // Validate country
  const countryValidation = validateAddressField(
    address.country,
    'Country',
    2,
    100,
  );
  if (!countryValidation.isValid) {
    return {
      isValid: false,
      field: 'country',
      message: countryValidation.message,
    };
  }

  return { isValid: true };
}

export default Command({
  data: {
    name: 'create-customer',
    description: 'Create a new customer using a step-by-step wizard',
    ephemeral: true,
  },
  execute: async (interaction, discordAccount) => {
    const selectedTeam = discordAccount?.selectedTeam;
    try {
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

      const customerCount = await prisma.customer.count({
        where: { teamId: selectedTeam.id },
      });

      if (customerCount >= selectedTeam.limits.maxCustomers) {
        await interaction.editReply({
          content: `You've reached the maximum customer limit (${selectedTeam.limits.maxCustomers}) for your team. Please upgrade your plan or contact support.`,
        });
        return;
      }

      const state: CustomerCreationState = {
        username: null,
        email: null,
        fullName: null,
        address: {
          line1: null,
          line2: null,
          city: null,
          state: null,
          postalCode: null,
          country: null,
        },
        metadata: [],
        discordAccount: {
          discordId: null,
          username: null,
          avatar: null,
          globalName: null,
          isAlreadyLinked: false,
        },
        step: 'basic_info',
      };

      await startCustomerWizard(
        interaction,
        state,
        discordAccount.userId,
        selectedTeam.id,
        selectedTeam.name || 'Unknown Team',
        selectedTeam.imageUrl,
        discordAccount.user.imageUrl,
      );
    } catch (error) {
      logger.error('Create customer command failed', {
        userId: interaction.user.id,
        teamId: selectedTeam?.id,
        error: error instanceof Error ? error.message : String(error),
      });
      await interaction.editReply({
        content:
          'An error occurred while processing your request. Please try again later.',
      });
    }
  },
});

/**
 * Starts the customer creation wizard with improved error handling
 */
async function startCustomerWizard(
  interaction: ChatInputCommandInteraction,
  state: CustomerCreationState,
  userId: string,
  teamId: string,
  teamName: string,
  teamImageUrl: string | null,
  userImageUrl: string | null,
) {
  try {
    await interaction.editReply({
      content: 'Creating customer wizard...',
      embeds: [],
      components: [],
    });

    await showBasicInfoStep(interaction, state, teamName, teamImageUrl);

    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
      time: 600000, // 10 minutes
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
          state: CustomerCreationState,
          teamName?: string,
          teamImageUrl?: string | null,
          userImageUrl?: string | null,
        ) => Promise<void>;

        const handlers: Record<string, HandlerFunction> = {
          wizard_next: handleNextStep,
          wizard_back: handlePreviousStep,

          basic_info_modal: handleBasicInfoModal,
          address_modal: handleAddressModal,
          wizard_add_metadata: async (i, state) => {
            await handleAddMetadataModal(i, state, teamName, teamImageUrl);
          },
          wizard_discord_user_select: async (i, state) => {
            await handleDiscordUserSelect(
              i as UserSelectMenuInteraction,
              state,
              teamId,
              teamName,
              teamImageUrl,
            );
          },
          wizard_create_customer: async (i, state) => {
            await finalizeCustomerCreation(
              i,
              state,
              userId,
              teamId,
              teamName,
              teamImageUrl,
              userImageUrl,
            );
            collector.stop();
          },
          wizard_cancel: async (i) => {
            await i.update({
              content: 'Customer creation cancelled.',
              embeds: [],
              components: [],
            });
            collector.stop();
          },
        };

        const handler = handlers[i.customId];

        if (handler) {
          await handler(i, state, teamName, teamImageUrl, userImageUrl);
        } else {
          logger.info('Unknown action ID in customer wizard', {
            customId: i.customId,
            userId: i.user.id,
          });
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
              'Customer creation wizard timed out due to inactivity (10 minutes). Please start over if you want to create a customer.',
            embeds: [],
            components: [],
          });
        } catch (error) {
          logger.error('Customer wizard timeout error', {
            userId: interaction.user.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });
  } catch (error) {
    logger.error('Failed to start customer wizard', {
      userId: interaction.user.id,
      teamId,
      error: error instanceof Error ? error.message : String(error),
    });
    await interaction.editReply({
      content:
        'An error occurred while starting the customer creation wizard. Please try again later.',
      embeds: [],
      components: [],
    });
  }
}

/**
 * Show the basic info step (first step)
 */
async function showBasicInfoStep(
  interaction:
    | ChatInputCommandInteraction
    | MessageComponentInteraction
    | ModalSubmitInteraction,
  state: CustomerCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const embed = new EmbedBuilder()
    .setTitle('Customer Creation Wizard - Basic Info')
    .setColor(Colors.Blue)
    .setDescription(
      "Let's set up a new customer. First, let's configure the basic information.",
    )
    .addFields(
      {
        name: 'Username',
        value: state.username || '_Not set_',
        inline: true,
      },
      {
        name: 'Email',
        value: state.email || '_Not set_',
        inline: true,
      },
      {
        name: 'Full Name',
        value: state.fullName || '_Not set_',
        inline: true,
      },
    )
    .setAuthor({
      name: teamName,
      iconURL: teamImageUrl || undefined,
    })
    .setFooter({ text: 'Step 1 of 5: Basic Info' });

  const basicInfoButton = new ButtonBuilder()
    .setCustomId('basic_info_modal')
    .setLabel('Set Basic Information')
    .setStyle(ButtonStyle.Primary);

  const basicInfoRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    basicInfoButton,
  );

  const nextButton = new ButtonBuilder()
    .setCustomId('wizard_next')
    .setLabel('Next: Address')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(!state.email && !state.username);

  const cancelButton = new ButtonBuilder()
    .setCustomId('wizard_cancel')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Danger);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    cancelButton,
    nextButton,
  );

  if ('update' in interaction) {
    await interaction.update({
      content: null,
      embeds: [embed],
      components: [basicInfoRow, buttonRow],
    });
  } else if (interaction.replied || interaction.deferred) {
    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: [basicInfoRow, buttonRow],
    });
  } else {
    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: [basicInfoRow, buttonRow],
    });
  }
}

/**
 * Show the address step
 */
async function showAddressStep(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  state: CustomerCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const embed = new EmbedBuilder()
    .setTitle('Customer Creation Wizard - Address')
    .setColor(Colors.Blue)
    .setDescription(
      'Set optional address information for the customer. All fields are optional.',
    )
    .addFields(
      {
        name: 'Username',
        value: state.username || '_Not set_',
        inline: true,
      },
      {
        name: 'Email',
        value: state.email || '_Not set_',
        inline: true,
      },
      {
        name: 'Full Name',
        value: state.fullName || '_Not set_',
        inline: true,
      },
      {
        name: '\u200B',
        value: '**Address Information**',
        inline: false,
      },
    )
    .setAuthor({
      name: teamName,
      iconURL: teamImageUrl || undefined,
    })
    .setFooter({ text: 'Step 2 of 5: Address' });

  const addressFields = [
    {
      name: 'Street Line 1',
      value: state.address.line1 || '_Not set_',
      inline: true,
    },
    {
      name: 'Street Line 2',
      value: state.address.line2 || '_Not set_',
      inline: true,
    },
    { name: 'City', value: state.address.city || '_Not set_', inline: true },
    {
      name: 'State/Province',
      value: state.address.state || '_Not set_',
      inline: true,
    },
    {
      name: 'Postal Code',
      value: state.address.postalCode || '_Not set_',
      inline: true,
    },
    {
      name: 'Country',
      value: state.address.country || '_Not set_',
      inline: true,
    },
  ];

  embed.addFields(addressFields);

  const addressButton = new ButtonBuilder()
    .setCustomId('address_modal')
    .setLabel('Set Address Information')
    .setStyle(ButtonStyle.Primary);

  const addressRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    addressButton,
  );

  const backButton = new ButtonBuilder()
    .setCustomId('wizard_back')
    .setLabel('Back')
    .setStyle(ButtonStyle.Secondary);

  const nextButton = new ButtonBuilder()
    .setCustomId('wizard_next')
    .setLabel('Next: Metadata')
    .setStyle(ButtonStyle.Primary);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    backButton,
    nextButton,
  );

  if (interaction.isModalSubmit()) {
    await interaction.editReply({
      embeds: [embed],
      components: [addressRow, buttonRow],
    });
  } else {
    await interaction.update({
      embeds: [embed],
      components: [addressRow, buttonRow],
    });
  }
}

/**
 * Show the metadata step
 */
async function showMetadataStep(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  state: CustomerCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const embed = new EmbedBuilder()
    .setTitle('Customer Creation Wizard - Metadata')
    .setColor(Colors.Blue)
    .setDescription(
      'Add optional metadata to your customer (e.g., source, notes, customerType).',
    )
    .addFields(
      {
        name: 'Username',
        value: state.username || '_Not set_',
        inline: true,
      },
      {
        name: 'Email',
        value: state.email || '_Not set_',
        inline: true,
      },
      {
        name: 'Full Name',
        value: state.fullName || '_Not set_',
        inline: true,
      },
    )
    .setAuthor({
      name: teamName,
      iconURL: teamImageUrl || undefined,
    })
    .setFooter({ text: 'Step 3 of 5: Metadata' });

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
    .setLabel('Next: Discord User')
    .setStyle(ButtonStyle.Primary);

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    backButton,
    nextButton,
  );

  components.push(navRow);

  if (interaction.isModalSubmit()) {
    await interaction.editReply({
      embeds: [embed],
      components: components,
    });
  } else {
    await interaction.update({
      embeds: [embed],
      components: components,
    });
  }
}

/**
 * Show the Discord user selection step
 */
async function showDiscordUserStep(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  state: CustomerCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const embed = new EmbedBuilder()
    .setTitle('Customer Creation Wizard - Discord User')
    .setColor(Colors.Blue)
    .setDescription(
      'Optionally link this customer to a Discord user in your server. This helps track Discord activity and provides better integration.',
    )
    .addFields(
      {
        name: 'Username',
        value: state.username || '_Not set_',
        inline: true,
      },
      {
        name: 'Email',
        value: state.email || '_Not set_',
        inline: true,
      },
      {
        name: 'Full Name',
        value: state.fullName || '_Not set_',
        inline: true,
      },
      {
        name: '\u200B',
        value: '**Discord Integration**',
        inline: false,
      },
      {
        name: 'Discord User',
        value: state.discordAccount.discordId
          ? state.discordAccount.isAlreadyLinked
            ? `<@${state.discordAccount.discordId}> ⚠️ _Already linked to another customer_`
            : `<@${state.discordAccount.discordId}>`
          : '_Not selected_',
        inline: false,
      },
    )
    .setAuthor({
      name: teamName,
      iconURL: teamImageUrl || undefined,
    })
    .setFooter({ text: 'Step 4 of 5: Discord User (Optional)' });

  const components: ActionRowBuilder<UserSelectMenuBuilder | ButtonBuilder>[] =
    [];

  // Use Discord's built-in UserSelectMenuBuilder for better user selection
  const guild = interaction.guild;
  if (guild) {
    // Create a user select menu that automatically handles user selection
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId('wizard_discord_user_select')
      .setPlaceholder('Select a Discord user (leave empty to skip)')
      .setMinValues(0) // Allow no selection
      .setMaxValues(1); // Only one user

    const userSelectRow =
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect);

    components.push(userSelectRow);

    // Add helpful note about the selection
    embed.addFields({
      name: 'How to select',
      value:
        '• Select a Discord user from this server to link them to this customer\n• Leave the selection empty to skip Discord linking',
      inline: false,
    });
  } else {
    embed.addFields({
      name: 'Note',
      value:
        'Not in a Discord server context. Discord linking will be skipped.',
      inline: false,
    });
  }

  const backButton = new ButtonBuilder()
    .setCustomId('wizard_back')
    .setLabel('Back')
    .setStyle(ButtonStyle.Secondary);

  const nextButton = new ButtonBuilder()
    .setCustomId('wizard_next')
    .setLabel('Review & Create')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(state.discordAccount.isAlreadyLinked);

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    backButton,
    nextButton,
  );

  components.push(navRow);

  // Handle the interaction response properly
  try {
    // For button interactions, we need to defer first if not already done
    if (
      !interaction.isModalSubmit() &&
      !interaction.deferred &&
      !interaction.replied
    ) {
      await interaction.deferUpdate();
    }
    await interaction.editReply({
      embeds: [embed],
      components: components,
    });
  } catch (error) {
    logger.error('Failed to update Discord user step interaction', {
      userId: interaction.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    // Fallback to followUp if update fails
    try {
      await interaction.followUp({
        embeds: [embed],
        components: components,
        flags: MessageFlags.Ephemeral,
      });
    } catch (followUpError) {
      logger.error('Failed to send followUp in Discord user step', {
        userId: interaction.user.id,
        error:
          followUpError instanceof Error
            ? followUpError.message
            : String(followUpError),
      });
    }
  }
}

/**
 * Show the final review step
 */
async function showReviewStep(
  interaction: MessageComponentInteraction,
  state: CustomerCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const embed = new EmbedBuilder()
    .setTitle('Customer Creation - Final Review')
    .setColor(Colors.Gold)
    .setDescription('Please review the customer details before creation.')
    .addFields(
      {
        name: 'Username',
        value: state.username || '_Not set_',
        inline: true,
      },
      {
        name: 'Email',
        value: state.email || '_Not set_',
        inline: true,
      },
      {
        name: 'Full Name',
        value: state.fullName || '_Not set_',
        inline: true,
      },
    )
    .setAuthor({
      name: teamName,
      iconURL: teamImageUrl || undefined,
    });

  const hasAddressInfo = Object.values(state.address).some(
    (value) => value !== null && value !== '',
  );

  if (hasAddressInfo) {
    embed.addFields({
      name: '\u200B',
      value: '**Address Information**',
      inline: false,
    });

    const addressParts: string[] = [];
    if (state.address.line1) addressParts.push(state.address.line1);
    if (state.address.line2) addressParts.push(state.address.line2);

    const cityStateZip: string[] = [];
    if (state.address.city) cityStateZip.push(state.address.city);
    if (state.address.state) cityStateZip.push(state.address.state);
    if (state.address.postalCode) cityStateZip.push(state.address.postalCode);

    if (cityStateZip.length > 0) addressParts.push(cityStateZip.join(', '));
    if (state.address.country) addressParts.push(state.address.country);

    if (addressParts.length > 0) {
      const fullAddress = addressParts.join(', ');
      const encodedAddress = encodeURIComponent(fullAddress);
      const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

      embed.addFields({
        name: 'Address',
        value: `${fullAddress}\n[View on Google Maps](${mapsLink})`,
        inline: false,
      });
    }
  } else {
    embed.addFields({
      name: 'Address',
      value: 'No address information provided',
      inline: false,
    });
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

  // Add Discord account info if linked
  if (state.discordAccount.discordId) {
    embed.addFields({
      name: '\u200B',
      value: '**Discord Integration**',
      inline: false,
    });

    embed.addFields({
      name: 'Linked Discord User',
      value: `<@${state.discordAccount.discordId}>`,
      inline: false,
    });
  } else {
    embed.addFields({
      name: 'Discord Integration',
      value: 'No Discord user linked',
      inline: false,
    });
  }

  const backButton = new ButtonBuilder()
    .setCustomId('wizard_back')
    .setLabel('Back')
    .setStyle(ButtonStyle.Secondary);

  const createButton = new ButtonBuilder()
    .setCustomId('wizard_create_customer')
    .setLabel('Create Customer')
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
  state: CustomerCreationState,
  teamName?: string,
  teamImageUrl?: string | null,
) {
  try {
    const team = teamName || 'Unknown Team';
    const imageUrl = teamImageUrl || null;

    switch (state.step) {
      case 'basic_info':
        state.step = 'address';
        await showAddressStep(interaction, state, team, imageUrl);
        break;
      case 'address':
        state.step = 'metadata';
        await showMetadataStep(interaction, state, team, imageUrl);
        break;
      case 'metadata':
        state.step = 'discord_user';
        await showDiscordUserStep(interaction, state, team, imageUrl);
        break;
      case 'discord_user':
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
  state: CustomerCreationState,
  teamName?: string,
  teamImageUrl?: string | null,
) {
  try {
    const team = teamName || 'Unknown Team';
    const imageUrl = teamImageUrl || null;

    switch (state.step) {
      case 'address':
        state.step = 'basic_info';
        await showBasicInfoStep(interaction, state, team, imageUrl);
        break;
      case 'metadata':
        state.step = 'address';
        await showAddressStep(interaction, state, team, imageUrl);
        break;
      case 'discord_user':
        state.step = 'metadata';
        await showMetadataStep(interaction, state, team, imageUrl);
        break;
      case 'review':
        state.step = 'discord_user';
        await showDiscordUserStep(interaction, state, team, imageUrl);
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
 * Handle basic info modal submission
 */
async function handleBasicInfoModal(
  interaction: MessageComponentInteraction,
  state: CustomerCreationState,
) {
  const modal = new ModalBuilder()
    .setCustomId('basic_info_modal')
    .setTitle('Customer Basic Information');

  const usernameInput = new TextInputBuilder()
    .setCustomId('username')
    .setLabel('Username (username or email required)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('johndoe')
    .setRequired(false)
    .setMaxLength(255);

  if (state.username) {
    usernameInput.setValue(state.username);
  }

  const emailInput = new TextInputBuilder()
    .setCustomId('email')
    .setLabel('Email (username or email required)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('customer@example.com')
    .setRequired(false)
    .setMaxLength(255);

  if (state.email) {
    emailInput.setValue(state.email);
  }

  const nameInput = new TextInputBuilder()
    .setCustomId('full_name')
    .setLabel('Full Name (optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('John Doe')
    .setRequired(false)
    .setMaxLength(255);

  if (state.fullName) {
    nameInput.setValue(state.fullName);
  }

  const usernameRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    usernameInput,
  );

  const emailRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    emailInput,
  );

  const nameRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    nameInput,
  );

  modal.addComponents(usernameRow, emailRow, nameRow);
  await interaction.showModal(modal);

  try {
    const modalResponse = await interaction.awaitModalSubmit({
      time: 120000,
    });

    const username = modalResponse.fields.getTextInputValue('username') || null;
    const email = modalResponse.fields.getTextInputValue('email') || null;
    const fullName =
      modalResponse.fields.getTextInputValue('full_name') || null;

    const usernameValidation = validateUsername(username);
    if (!usernameValidation.isValid) {
      await modalResponse.reply({
        content: `Invalid username: ${usernameValidation.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      await modalResponse.reply({
        content: `Invalid email: ${emailValidation.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const emailOrUsernameValidation = validateEmailOrUsername(email, username);
    if (!emailOrUsernameValidation.isValid) {
      await modalResponse.reply({
        content: `Error: ${emailOrUsernameValidation.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (fullName !== null) {
      const nameValidation = validateFullName(fullName);
      if (!nameValidation.isValid) {
        await modalResponse.reply({
          content: `Invalid name: ${nameValidation.message}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    await modalResponse.deferUpdate();

    try {
      state.username = username;
      state.email = email;
      state.fullName = fullName;

      const teamNameFromEmbed =
        interaction.message?.embeds?.[0]?.author?.name || 'Unknown Team';
      const teamImageUrlFromEmbed =
        interaction.message?.embeds?.[0]?.author?.iconURL || null;

      const embed = new EmbedBuilder()
        .setTitle('Customer Creation Wizard - Basic Info')
        .setColor(Colors.Blue)
        .setDescription(
          "Let's set up a new customer. First, let's configure the basic information.",
        )
        .addFields(
          {
            name: 'Username',
            value: state.username || '_Not set_',
            inline: true,
          },
          {
            name: 'Email',
            value: state.email || '_Not set_',
            inline: true,
          },
          {
            name: 'Full Name',
            value: state.fullName || '_Not set_',
            inline: true,
          },
        )
        .setAuthor({
          name: teamNameFromEmbed,
          iconURL: teamImageUrlFromEmbed || undefined,
        })
        .setFooter({ text: 'Step 1 of 4: Basic Info' });

      const basicInfoButton = new ButtonBuilder()
        .setCustomId('basic_info_modal')
        .setLabel('Edit Basic Information')
        .setStyle(ButtonStyle.Primary);

      const basicInfoRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        basicInfoButton,
      );

      const nextButton = new ButtonBuilder()
        .setCustomId('wizard_next')
        .setLabel('Next: Address')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!state.email && !state.username);

      const cancelButton = new ButtonBuilder()
        .setCustomId('wizard_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger);

      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        cancelButton,
        nextButton,
      );

      await modalResponse.editReply({
        embeds: [embed],
        components: [basicInfoRow, buttonRow],
      });
    } catch (error) {
      logger.error('Failed to check for existing customer', {
        userId: interaction.user.id,
        error: error instanceof Error ? error.message : String(error),
      });
      await modalResponse.followUp({
        content:
          'An error occurred while checking for existing customers. Please try again.',
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    logger.error('Customer basic info modal failed', {
      userId: interaction.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle address modal submission
 */
async function handleAddressModal(
  interaction: MessageComponentInteraction,
  state: CustomerCreationState,
) {
  const modal = new ModalBuilder()
    .setCustomId('address_modal')
    .setTitle('Customer Address Information');

  const line1Input = new TextInputBuilder()
    .setCustomId('line1')
    .setLabel('Street Address Line 1')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('123 Main St')
    .setRequired(false)
    .setMaxLength(255);

  if (state.address.line1) {
    line1Input.setValue(state.address.line1);
  }

  const line2Input = new TextInputBuilder()
    .setCustomId('line2')
    .setLabel('Street Address Line 2')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Apt 4B')
    .setRequired(false)
    .setMaxLength(255);

  if (state.address.line2) {
    line2Input.setValue(state.address.line2);
  }

  const cityStateInput = new TextInputBuilder()
    .setCustomId('city_state')
    .setLabel('City, State/Province')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('New York, NY')
    .setRequired(false)
    .setMaxLength(255);

  const cityStateParts: string[] = [];
  if (state.address.city) cityStateParts.push(state.address.city);
  if (state.address.state) cityStateParts.push(state.address.state);

  if (cityStateParts.length > 0) {
    cityStateInput.setValue(cityStateParts.join(', '));
  }

  const postalCodeInput = new TextInputBuilder()
    .setCustomId('postal_code')
    .setLabel('Postal/ZIP Code')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('10001')
    .setRequired(false)
    .setMaxLength(255);

  if (state.address.postalCode) {
    postalCodeInput.setValue(state.address.postalCode);
  }

  const countryInput = new TextInputBuilder()
    .setCustomId('country')
    .setLabel('Country')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('United States')
    .setRequired(false)
    .setMaxLength(255);

  if (state.address.country) {
    countryInput.setValue(state.address.country);
  }

  const line1Row = new ActionRowBuilder<TextInputBuilder>().addComponents(
    line1Input,
  );
  const line2Row = new ActionRowBuilder<TextInputBuilder>().addComponents(
    line2Input,
  );
  const cityStateRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    cityStateInput,
  );
  const postalCodeRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    postalCodeInput,
  );
  const countryRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    countryInput,
  );

  modal.addComponents(
    line1Row,
    line2Row,
    cityStateRow,
    postalCodeRow,
    countryRow,
  );
  await interaction.showModal(modal);

  try {
    const modalResponse = await interaction.awaitModalSubmit({
      time: 120000,
    });

    const line1 = modalResponse.fields.getTextInputValue('line1') || null;
    const line2 = modalResponse.fields.getTextInputValue('line2') || null;

    const cityState =
      modalResponse.fields.getTextInputValue('city_state') || '';
    const cityStateParts = cityState.split(',').map((part) => part.trim());

    const city = cityStateParts.length > 0 ? cityStateParts[0] || null : null;
    const stateProvince =
      cityStateParts.length > 1 ? cityStateParts[1] || null : null;

    const postalCode =
      modalResponse.fields.getTextInputValue('postal_code') || null;
    const country = modalResponse.fields.getTextInputValue('country') || null;

    const addressToValidate = {
      line1,
      line2,
      city,
      state: stateProvince,
      postalCode,
      country,
    };

    const addressValidation = validateAddress(addressToValidate);
    if (!addressValidation.isValid) {
      await modalResponse.reply({
        content: `Invalid address: ${addressValidation.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    state.address.line1 = line1;
    state.address.line2 = line2;
    state.address.city = city;
    state.address.state = stateProvince;
    state.address.postalCode = postalCode;
    state.address.country = country;

    await modalResponse.deferUpdate();

    const teamNameFromEmbed =
      interaction.message?.embeds?.[0]?.author?.name || 'Unknown Team';
    const teamImageUrlFromEmbed =
      interaction.message?.embeds?.[0]?.author?.iconURL || null;

    await showAddressStep(
      modalResponse,
      state,
      teamNameFromEmbed,
      teamImageUrlFromEmbed,
    );
  } catch (error) {
    logger.error('Customer address modal failed', {
      userId: interaction.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle add metadata modal
 */
async function handleAddMetadataModal(
  interaction: MessageComponentInteraction,
  state: CustomerCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const modal = new ModalBuilder()
    .setCustomId('metadata_modal')
    .setTitle('Add Customer Metadata');

  const keyInput = new TextInputBuilder()
    .setCustomId('metadata_key')
    .setLabel('Metadata Key')
    .setPlaceholder('e.g., source, customerType, note')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(255);

  const valueInput = new TextInputBuilder()
    .setCustomId('metadata_value')
    .setLabel('Metadata Value')
    .setPlaceholder('e.g., referral, premium, VIP customer')
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

    const validation = validateMetadataItem(key, value);
    if (!validation.isValid) {
      await modalResponse.reply({
        content: `Invalid metadata: ${validation.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existingIndex = state.metadata.findIndex((item) => item.key === key);
    if (existingIndex >= 0) {
      state.metadata[existingIndex].value = value;
    } else {
      state.metadata.push({ key, value });
    }

    await modalResponse.deferUpdate();

    await showMetadataStep(modalResponse, state, teamName, teamImageUrl);
  } catch (error) {
    logger.error('Customer metadata modal submit failed', {
      userId: interaction.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle Discord user selection
 */
async function handleDiscordUserSelect(
  interaction: UserSelectMenuInteraction,
  state: CustomerCreationState,
  teamId: string,
  teamName: string,
  teamImageUrl: string | null,
) {
  try {
    await interaction.deferUpdate();

    const selectedUsers = interaction.users;

    if (selectedUsers.size > 0) {
      // Get the first (and only) selected user
      const selectedUser = selectedUsers.first();

      if (selectedUser) {
        // Check if Discord account is already linked to another customer in this team
        const existingDiscordAccount =
          await prisma.customerDiscordAccount.findUnique({
            where: {
              teamId_discordId: {
                teamId,
                discordId: selectedUser.id,
              },
            },
            include: {
              customer: true,
            },
          });

        if (existingDiscordAccount) {
          const customerName =
            existingDiscordAccount.customer.fullName ||
            existingDiscordAccount.customer.username ||
            existingDiscordAccount.customer.email ||
            'Unknown Customer';

          state.discordAccount = {
            discordId: selectedUser.id,
            username: selectedUser.username,
            avatar: selectedUser.avatar,
            globalName: selectedUser.globalName || null,
            isAlreadyLinked: true,
          };

          await showDiscordUserStep(interaction, state, teamName, teamImageUrl);

          await interaction.followUp({
            content: `<@${selectedUser.id}> is already linked to customer: **${customerName}**. Please select a different Discord user or skip Discord linking.`,
            ephemeral: true,
          });
          return;
        }

        state.discordAccount = {
          discordId: selectedUser.id,
          username: selectedUser.username,
          avatar: selectedUser.avatar,
          globalName: selectedUser.globalName || null,
          isAlreadyLinked: false,
        };
      } else {
        // Fallback if somehow first() returns undefined
        state.discordAccount = {
          discordId: null,
          username: null,
          avatar: null,
          globalName: null,
          isAlreadyLinked: false,
        };
      }
    } else {
      // No user selected
      state.discordAccount = {
        discordId: null,
        username: null,
        avatar: null,
        globalName: null,
        isAlreadyLinked: false,
      };
    }

    await showDiscordUserStep(interaction, state, teamName, teamImageUrl);
  } catch (error) {
    logger.error('Customer Discord user selection failed', {
      userId: interaction.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    await handleWizardError(interaction, error, 'selecting Discord user');
  }
}

/**
 * Finalize customer creation
 */
async function finalizeCustomerCreation(
  interaction: MessageComponentInteraction,
  state: CustomerCreationState,
  userId: string,
  teamId: string,
  teamName: string,
  teamImageUrl: string | null,
  userImageUrl: string | null,
) {
  try {
    await interaction.deferUpdate();

    const addressData: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    } = {};

    if (state.address.line1) addressData.line1 = state.address.line1;
    if (state.address.line2) addressData.line2 = state.address.line2;
    if (state.address.city) addressData.city = state.address.city;
    if (state.address.state) addressData.state = state.address.state;
    if (state.address.postalCode)
      addressData.postalCode = state.address.postalCode;
    if (state.address.country) addressData.country = state.address.country;

    let webhookEventIds: string[] = [];

    const customer = await prisma.$transaction(async (prisma) => {
      const customer = await prisma.customer.create({
        data: {
          username: state.username,
          email: state.email,
          fullName: state.fullName,
          metadata: {
            createMany: {
              data: state.metadata.map((m) => ({
                key: m.key,
                value: m.value,
                teamId,
              })),
            },
          },
          address:
            Object.keys(addressData).length > 0
              ? { create: addressData }
              : undefined,
          discordAccount: state.discordAccount.discordId
            ? {
                create: {
                  discordId: state.discordAccount.discordId,
                  username: state.discordAccount.username || '',
                  avatar: state.discordAccount.avatar,
                  teamId,
                },
              }
            : undefined,
          createdBy: {
            connect: {
              id: userId,
            },
          },
          team: {
            connect: {
              id: teamId,
            },
          },
        },
        include: {
          metadata: true,
          address: true,
          discordAccount: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          action: AuditLogAction.CREATE_CUSTOMER,
          source: AuditLogSource.DISCORD_INTEGRATION,
          targetId: customer.id,
          targetType: AuditLogTargetType.CUSTOMER,
          version: process.env.version || '',
          requestBody: state as unknown as Prisma.InputJsonValue,
          responseBody: { customer },
          teamId,
          userId,
        },
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.CUSTOMER_CREATED,
        teamId,
        payload: createCustomerPayload(customer),
        userId,
        source: AuditLogSource.DISCORD_INTEGRATION,
        tx: prisma,
      });

      return customer;
    });

    void attemptWebhookDelivery(webhookEventIds);

    const successEmbed = new EmbedBuilder()
      .setTitle('Customer Created Successfully')
      .setColor(Colors.Green)
      .setDescription(`Your customer has been created.`)
      .addFields(
        {
          name: 'ID',
          value: `\`\`\`yaml\n${customer.id}\`\`\``,
          inline: false,
        },
        {
          name: 'Username',
          value: customer.username || '_Not provided_',
          inline: true,
        },
        {
          name: 'Email',
          value: customer.email || '_Not provided_',
          inline: true,
        },
        {
          name: 'Full Name',
          value: customer.fullName || '_Not provided_',
          inline: true,
        },
      );

    // Add Discord account info if linked
    if (state.discordAccount.discordId) {
      successEmbed.addFields({
        name: 'Discord Account',
        value: `<@${state.discordAccount.discordId}>`,
        inline: true,
      });
    } else {
      successEmbed.addFields({
        name: 'Discord Account',
        value: '_Not linked_',
        inline: true,
      });
    }

    successEmbed
      .setAuthor({
        name: teamName,
        iconURL: teamImageUrl || undefined,
      })
      .setFooter({
        text: 'Customer created successfully',
        iconURL: userImageUrl || undefined,
      });

    const dashboardButton = new ButtonBuilder()
      .setLabel('View in Dashboard')
      .setURL(`${process.env.BASE_URL}/dashboard/customers/${customer.id}`)
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
    logger.error('Customer creation failed', {
      userId: interaction.user.id,
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      await interaction.editReply({
        content:
          'An error occurred while creating the customer. Please try again later.',
        embeds: [],
        components: [],
      });
    } catch (secondError) {
      logger.error('Failed to send customer creation error response', {
        userId: interaction.user.id,
        error:
          secondError instanceof Error
            ? secondError.message
            : String(secondError),
      });
    }
  }
}

/**
 * Centralized error handler for wizard interactions
 */
async function handleWizardError(
  interaction: MessageComponentInteraction,
  error: unknown,
  context: string,
) {
  logger.error('Customer wizard error', {
    context,
    userId: interaction.user.id,
    error: error instanceof Error ? error.message : String(error),
  });

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
    logger.error('Failed to send customer wizard error response', {
      userId: interaction.user.id,
      error:
        followupError instanceof Error
          ? followupError.message
          : String(followupError),
    });
  }
}
