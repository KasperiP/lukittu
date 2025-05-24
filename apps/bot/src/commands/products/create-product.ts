import {
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  logger,
  prisma,
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
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Command } from '../../structures/command';

type WizardStep = 'basic_info' | 'metadata' | 'review';

interface ProductCreationState {
  name: string;
  url: string | null;
  metadata: { key: string; value: string }[];
  step: WizardStep;
}

function validateProductName(name: string): {
  isValid: boolean;
  message?: string;
} {
  if (!name) {
    return { isValid: false, message: 'Product name is required' };
  }
  if (name.length < 3) {
    return {
      isValid: false,
      message: 'Product name must be at least 3 characters',
    };
  }
  if (name.length > 255) {
    return {
      isValid: false,
      message: 'Product name must be less than 255 characters',
    };
  }
  const nameRegex = /^[a-zA-Z0-9\s\-_]+$/;
  if (!nameRegex.test(name)) {
    return {
      isValid: false,
      message:
        'Product name can only contain letters, numbers, spaces, and the following characters: - _',
    };
  }
  return { isValid: true };
}

function validateProductUrl(url: string | null): {
  isValid: boolean;
  message?: string;
} {
  if (!url || url.trim() === '') return { isValid: true }; // URL is optional

  try {
    new URL(url);
    return { isValid: true };
  } catch (e) {
    logger.error('Invalid URL:', e);
    return { isValid: false, message: 'Invalid URL format' };
  }
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

export default Command({
  data: {
    name: 'create-product',
    description: 'Create a new product using a step-by-step wizard',
    ephemeral: true,
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

      const productCount = await prisma.product.count({
        where: { teamId: selectedTeam.id },
      });

      if (productCount >= selectedTeam.limits.maxProducts) {
        await interaction.editReply({
          content: `You've reached the maximum product limit (${selectedTeam.limits.maxProducts}) for your team. Please upgrade your plan or contact support.`,
        });
        return;
      }

      const state: ProductCreationState = {
        name: '',
        url: null,
        metadata: [],
        step: 'basic_info',
      };

      await startProductWizard(
        interaction,
        state,
        discordAccount.userId,
        selectedTeam.id,
        selectedTeam.name || 'Unknown Team',
        selectedTeam.imageUrl,
        discordAccount.user.imageUrl,
      );
    } catch (error) {
      logger.error('Error executing create-product command:', error);
      await interaction.editReply({
        content:
          'An error occurred while processing your request. Please try again later.',
      });
    }
  },
});

/**
 * Starts the product creation wizard with improved error handling
 */
async function startProductWizard(
  interaction: ChatInputCommandInteraction,
  state: ProductCreationState,
  userId: string,
  teamId: string,
  teamName: string,
  teamImageUrl: string | null,
  userImageUrl: string | null,
) {
  try {
    await interaction.editReply({
      content: 'Creating product wizard...',
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
          state: ProductCreationState,
          teamId: string,
          teamName?: string,
          teamImageUrl?: string | null,
          userImageUrl?: string | null,
        ) => Promise<void>;

        const handlers: Record<string, HandlerFunction> = {
          wizard_next: handleNextStep,
          wizard_back: handlePreviousStep,

          basic_info_modal: handleBasicInfoModal,
          wizard_add_metadata: async (i, state) => {
            await handleAddMetadataModal(i, state, teamName, teamImageUrl);
          },
          wizard_create_product: async (i, state) => {
            await finalizeProductCreation(
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
              content: 'Product creation cancelled.',
              embeds: [],
              components: [],
            });
            collector.stop();
          },
        };

        const handler = handlers[i.customId];

        if (handler) {
          await handler(i, state, teamId, teamName, teamImageUrl, userImageUrl);
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
              'Product creation wizard timed out due to inactivity (10 minutes). Please start over if you want to create a product.',
            embeds: [],
            components: [],
          });
        } catch (error) {
          logger.error('Error handling wizard timeout:', error);
        }
      }
    });
  } catch (error) {
    logger.error('Error starting product wizard:', error);
    await interaction.editReply({
      content:
        'An error occurred while starting the product creation wizard. Please try again later.',
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
  state: ProductCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const embed = new EmbedBuilder()
    .setTitle('Product Creation Wizard - Basic Info')
    .setColor(Colors.Blue)
    .setDescription(
      "Let's create a new product. First, let's configure the basic information.",
    )
    .addFields(
      {
        name: 'Product Name',
        value: state.name || '_Not set_',
        inline: true,
      },
      {
        name: 'Website URL',
        value: state.url || '_Not set_',
        inline: true,
      },
    )
    .setAuthor({
      name: teamName,
      iconURL: teamImageUrl || undefined,
    })
    .setFooter({ text: 'Step 1 of 3: Basic Info' });

  const basicInfoButton = new ButtonBuilder()
    .setCustomId('basic_info_modal')
    .setLabel('Set Basic Information')
    .setStyle(ButtonStyle.Primary);

  const basicInfoRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    basicInfoButton,
  );

  const nextButton = new ButtonBuilder()
    .setCustomId('wizard_next')
    .setLabel('Next: Metadata')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(!state.name);

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
 * Show the metadata step
 */
async function showMetadataStep(
  interaction: MessageComponentInteraction,
  state: ProductCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const embed = new EmbedBuilder()
    .setTitle('Product Creation Wizard - Metadata')
    .setColor(Colors.Blue)
    .setDescription(
      'Add optional metadata to your product (e.g., version, type, category).',
    )
    .addFields(
      {
        name: 'Product Name',
        value: state.name,
        inline: true,
      },
      {
        name: 'Website URL',
        value: state.url || '_Not set_',
        inline: true,
      },
    )
    .setAuthor({
      name: teamName,
      iconURL: teamImageUrl || undefined,
    })
    .setFooter({ text: 'Step 2 of 3: Metadata' });

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
  state: ProductCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const embed = new EmbedBuilder()
    .setTitle('Product Creation - Final Review')
    .setColor(Colors.Gold)
    .setDescription('Please review the product details before creation.')
    .addFields(
      {
        name: 'Product Name',
        value: state.name,
        inline: true,
      },
      {
        name: 'Website URL',
        value: state.url || '_Not set_',
        inline: true,
      },
    )
    .setAuthor({
      name: teamName,
      iconURL: teamImageUrl || undefined,
    });

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
    .setCustomId('wizard_create_product')
    .setLabel('Create Product')
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
  state: ProductCreationState,
  _teamId?: string,
  teamName?: string,
  teamImageUrl?: string | null,
) {
  try {
    const team = teamName || 'Unknown Team';
    const imageUrl = teamImageUrl || null;

    switch (state.step) {
      case 'basic_info':
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
  state: ProductCreationState,
  _teamId?: string,
  teamName?: string,
  teamImageUrl?: string | null,
) {
  try {
    const team = teamName || 'Unknown Team';
    const imageUrl = teamImageUrl || null;

    switch (state.step) {
      case 'metadata':
        state.step = 'basic_info';
        await showBasicInfoStep(interaction, state, team, imageUrl);
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
 * Handle basic info modal submission
 */
async function handleBasicInfoModal(
  interaction: MessageComponentInteraction,
  state: ProductCreationState,
  teamId: string,
) {
  const modal = new ModalBuilder()
    .setCustomId('basic_info_modal')
    .setTitle('Product Basic Information');

  const nameInput = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('Product Name (required)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('MyAwesomeProduct')
    .setRequired(true)
    .setMaxLength(255);

  if (state.name) {
    nameInput.setValue(state.name);
  }

  const urlInput = new TextInputBuilder()
    .setCustomId('url')
    .setLabel('Website URL (optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://example.com/product')
    .setRequired(false)
    .setMaxLength(255);

  if (state.url) {
    urlInput.setValue(state.url);
  }

  const nameRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    nameInput,
  );
  const urlRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    urlInput,
  );

  modal.addComponents(nameRow, urlRow);
  await interaction.showModal(modal);

  try {
    const modalResponse = await interaction.awaitModalSubmit({
      time: 120000,
    });

    const name = modalResponse.fields.getTextInputValue('name');
    const url = modalResponse.fields.getTextInputValue('url') || null;

    const nameValidation = validateProductName(name);
    if (!nameValidation.isValid) {
      await modalResponse.reply({
        content: `Invalid product name: ${nameValidation.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (url !== null) {
      const urlValidation = validateProductUrl(url);
      if (!urlValidation.isValid) {
        await modalResponse.reply({
          content: `Invalid URL: ${urlValidation.message}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    await modalResponse.deferUpdate();

    try {
      const existingProduct = await prisma.product.findFirst({
        where: {
          teamId,
          name,
        },
      });

      if (existingProduct) {
        await modalResponse.followUp({
          content: `A product with the name "${name}" already exists in your team.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      state.name = name;
      state.url = url;

      const teamNameFromEmbed =
        interaction.message?.embeds?.[0]?.author?.name || 'Unknown Team';
      const teamImageUrlFromEmbed =
        interaction.message?.embeds?.[0]?.author?.iconURL || null;

      const embed = new EmbedBuilder()
        .setTitle('Product Creation Wizard - Basic Info')
        .setColor(Colors.Blue)
        .setDescription(
          "Let's create a new product. First, let's configure the basic information.",
        )
        .addFields(
          {
            name: 'Product Name',
            value: state.name,
            inline: true,
          },
          {
            name: 'Website URL',
            value: state.url || '_Not set_',
            inline: true,
          },
        )
        .setAuthor({
          name: teamNameFromEmbed,
          iconURL: teamImageUrlFromEmbed || undefined,
        })
        .setFooter({ text: 'Step 1 of 3: Basic Info' });

      const basicInfoButton = new ButtonBuilder()
        .setCustomId('basic_info_modal')
        .setLabel('Edit Basic Information')
        .setStyle(ButtonStyle.Primary);

      const basicInfoRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        basicInfoButton,
      );

      const nextButton = new ButtonBuilder()
        .setCustomId('wizard_next')
        .setLabel('Next: Metadata')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!state.name);

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
      logger.error('Error checking for existing product:', error);
      await modalResponse.followUp({
        content:
          'An error occurred while checking for existing products. Please try again.',
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    logger.error('Error handling basic info modal:', error);
  }
}

/**
 * Handle add metadata modal
 */
async function handleAddMetadataModal(
  interaction: MessageComponentInteraction,
  state: ProductCreationState,
  teamName: string,
  teamImageUrl: string | null,
) {
  const modal = new ModalBuilder()
    .setCustomId('metadata_modal')
    .setTitle('Add Product Metadata');

  const keyInput = new TextInputBuilder()
    .setCustomId('metadata_key')
    .setLabel('Metadata Key')
    .setPlaceholder('e.g., version, category, type')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(255);

  const valueInput = new TextInputBuilder()
    .setCustomId('metadata_value')
    .setLabel('Metadata Value')
    .setPlaceholder('e.g., 1.0.0, software, desktop')
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

    const embed = new EmbedBuilder()
      .setTitle('Product Creation Wizard - Metadata')
      .setColor(Colors.Blue)
      .setDescription(
        'Add optional metadata to your product (e.g., version, type, category).',
      )
      .addFields(
        {
          name: 'Product Name',
          value: state.name,
          inline: true,
        },
        {
          name: 'Website URL',
          value: state.url || '_Not set_',
          inline: true,
        },
      )
      .setAuthor({
        name: teamName,
        iconURL: teamImageUrl || undefined,
      })
      .setFooter({ text: 'Step 2 of 3: Metadata' });

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
 * Finalize product creation
 */
async function finalizeProductCreation(
  interaction: MessageComponentInteraction,
  state: ProductCreationState,
  userId: string,
  teamId: string,
  teamName: string,
  teamImageUrl: string | null,
  userImageUrl: string | null,
) {
  try {
    await interaction.deferUpdate();

    const existingProduct = await prisma.product.findFirst({
      where: {
        teamId,
        name: state.name,
      },
    });

    if (existingProduct) {
      await interaction.editReply({
        content: `A product with the name "${state.name}" already exists in your team.`,
        embeds: [],
        components: [],
      });
      return;
    }

    const product = await prisma.$transaction(async (prisma) => {
      const product = await prisma.product.create({
        data: {
          name: state.name,
          url: state.url,
          metadata: {
            createMany: {
              data: state.metadata.map((m) => ({
                key: m.key,
                value: m.value,
                teamId,
              })),
            },
          },
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
      });

      await prisma.auditLog.create({
        data: {
          action: AuditLogAction.CREATE_PRODUCT,
          source: AuditLogSource.DISCORD_INTEGRATION,
          targetId: product.id,
          targetType: AuditLogTargetType.PRODUCT,
          version: process.env.version || '',
          requestBody: JSON.stringify(state),
          responseBody: JSON.stringify({
            product,
          }),
          teamId,
          userId,
        },
      });

      return product;
    });

    const successEmbed = new EmbedBuilder()
      .setTitle('Product Created Successfully')
      .setColor(Colors.Green)
      .setDescription(`Your product has been created.`)
      .addFields(
        {
          name: 'ID',
          value: `\`\`\`yaml\n${product.id}\`\`\``,
          inline: false,
        },
        {
          name: 'Name',
          value: product.name,
          inline: true,
        },
        {
          name: 'Website URL',
          value: product.url || '_Not provided_',
          inline: true,
        },
      )
      .setAuthor({
        name: teamName,
        iconURL: teamImageUrl || undefined,
      })
      .setFooter({
        text: 'Product created successfully',
        iconURL: userImageUrl || undefined,
      });

    const dashboardButton = new ButtonBuilder()
      .setLabel('View in Dashboard')
      .setURL(`${process.env.BASE_URL}/dashboard/products/${product.id}`)
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
    logger.error('Error creating product:', error);

    try {
      await interaction.editReply({
        content:
          'An error occurred while creating the product. Please try again later.',
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
  interaction: MessageComponentInteraction,
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
