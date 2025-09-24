import { createAuditLog } from '@/lib/logging/audit-log';
import { deleteFileFromPrivateS3 } from '@/lib/providers/aws-s3';
import {
  ValidatedDiscordRoleMapping,
  validateDiscordRoleMappingsForUser,
} from '@/lib/providers/discord';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import {
  setProductSchema,
  SetProductSchema,
} from '@/lib/validation/products/set-product-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import {
  attemptWebhookDelivery,
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  createWebhookEvents,
  deleteProductPayload,
  logger,
  Metadata,
  prisma,
  Product,
  ProductDiscordRole,
  regex,
  updateProductPayload,
  User,
  WebhookEventType,
} from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

export type IProductGetSuccessResponse = {
  product: Product & {
    latestRelease: string | null;
    totalReleases: number;
    createdBy: Omit<User, 'passwordHash'> | null;
    metadata: Metadata[];
    discordRoles: ProductDiscordRole[];
  };
};

export type IProductGetResponse = IProductGetSuccessResponse | ErrorResponse;

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<IProductGetResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const productId = params.slug;

    if (!productId || !regex.uuidV4.test(productId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              deletedAt: null,
              id: selectedTeam,
            },
            include: {
              products: {
                where: {
                  id: productId,
                },
                include: {
                  createdBy: true,
                  releases: true,
                  metadata: true,
                  discordRoles: true,
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (!session.user.teams.length) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const team = session.user.teams[0];

    if (!team.products.length) {
      return NextResponse.json(
        {
          message: t('validation.product_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const product = team.products[0];

    return NextResponse.json({
      product: {
        ...product,
        releases: undefined,
        latestRelease:
          product.releases.find(
            (release) => release.latest && !release.branchId,
          )?.version || null,
        totalReleases: product.releases.length,
      },
    });
  } catch (error) {
    logger.error("Error occurred in 'products/[slug]' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

type IProductsDeleteSuccessResponse = {
  success: boolean;
};

export type IProductsDeleteResponse =
  | ErrorResponse
  | IProductsDeleteSuccessResponse;

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<IProductsDeleteResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const productId = params.slug;

    if (!productId || !regex.uuidV4.test(productId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              deletedAt: null,
              id: selectedTeam,
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (!session.user.teams.length) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const product = await prisma.product.findUnique({
      where: {
        id: productId,
        teamId: selectedTeam,
      },
      include: {
        releases: {
          include: {
            file: true,
          },
        },
        metadata: true,
      },
    });

    if (!product) {
      return NextResponse.json(
        {
          message: t('validation.product_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    let webhookEventIds: string[] = [];

    const response = await prisma.$transaction(async (prisma) => {
      await prisma.product.delete({
        where: {
          id: productId,
          teamId: selectedTeam,
        },
      });

      const fileIds = product.releases
        .map((release) => release.file?.id)
        .filter(Boolean) as string[];

      logger.info(
        `Product ${product.id} deleted, deleting ${fileIds.length} files`,
        {
          product: product.id,
          files: fileIds,
        },
      );

      await prisma.releaseFile.deleteMany({
        where: {
          id: {
            in: fileIds,
          },
        },
      });

      const response = {
        success: true,
      };

      await createAuditLog({
        userId: session.user.id,
        teamId: selectedTeam,
        action: AuditLogAction.DELETE_PRODUCT,
        targetId: product.id,
        targetType: AuditLogTargetType.PRODUCT,
        responseBody: response,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.PRODUCT_DELETED,
        teamId: selectedTeam,
        payload: deleteProductPayload(product),
        userId: session.user.id,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      const deleteFilePromises = fileIds.map((fileId) =>
        deleteFileFromPrivateS3(
          process.env.PRIVATE_OBJECT_STORAGE_BUCKET_NAME!,
          fileId,
        ),
      );

      await Promise.all(deleteFilePromises);

      return response;
    });

    void attemptWebhookDelivery(webhookEventIds);

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'products/[slug]' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}

export type IProductsUpdateSuccessResponse = {
  product: Product;
};

export type IProductsUpdateResponse =
  | ErrorResponse
  | IProductsUpdateSuccessResponse;

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<IProductsUpdateResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const productId = params.slug;

    if (!productId || !regex.uuidV4.test(productId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const body = (await request.json()) as SetProductSchema;
    const validated = await setProductSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          field: validated.error.errors[0].path[0],
          message: validated.error.errors[0].message,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const { name, url, metadata, discordRoleMapping } = validated.data;

    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              deletedAt: null,
              id: selectedTeam,
            },
            include: {
              products: true,
            },
          },
          discordAccount: {
            omit: {
              refreshToken: false,
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (!session.user.teams.length) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const team = session.user.teams[0];

    // Validate Discord role mappings if provided
    let validatedDiscordMappings: ValidatedDiscordRoleMapping[] | undefined;
    if (discordRoleMapping && discordRoleMapping.length > 0) {
      if (!session.user.discordAccount) {
        return NextResponse.json(
          {
            message: t('validation.discord_account_not_connected'),
            field: 'discordRoleMapping',
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }

      const discordValidation = await validateDiscordRoleMappingsForUser({
        roleMappings: discordRoleMapping,
        userId: session.user.id,
        userDiscordAccount: {
          discordId: session.user.discordAccount.discordId,
          refreshToken: session.user.discordAccount.refreshToken!,
        },
      });

      if (!discordValidation.success) {
        const errorMessages = {
          NO_DISCORD_ACCOUNT: t('validation.discord_account_not_connected'),
          INVALID_TOKEN: t('validation.discord_token_invalid'),
          INSUFFICIENT_PERMISSIONS: t(
            'validation.discord_insufficient_permissions',
          ),
          ROLE_NOT_FOUND: t('validation.discord_guild_or_role_not_found'),
          GUILD_NOT_FOUND: t('validation.discord_guild_or_role_not_found'),
          BOT_NOT_IN_GUILD: t('validation.discord_bot_not_in_guild'),
          DUPLICATE_MAPPING: t(
            'validation.discord_role_mapping_already_exists',
          ),
        };

        return NextResponse.json(
          {
            message:
              errorMessages[discordValidation.errorCode!] ||
              discordValidation.error ||
              'Discord validation failed',
            field: 'discordRoleMapping',
          },
          { status: HttpStatus.BAD_REQUEST },
        );
      }

      validatedDiscordMappings = discordValidation.validatedMappings;
    }

    if (!team.products.find((product) => product.id === productId)) {
      return NextResponse.json(
        {
          message: t('validation.product_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (
      team.products.find(
        (product) => product.name === name && product.id !== productId,
      )
    ) {
      return NextResponse.json(
        {
          message: t('validation.product_already_exists'),
          field: 'name',
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    let webhookEventIds: string[] = [];

    const response = await prisma.$transaction(async (prisma) => {
      const product = await prisma.product.update({
        where: {
          id: productId,
        },
        data: {
          name,
          url: url || null,
          metadata: {
            deleteMany: {},
            createMany: {
              data: metadata.map((m) => ({
                ...m,
                teamId: team.id,
              })),
            },
          },
          discordRoles: {
            deleteMany: {},
            createMany: validatedDiscordMappings
              ? {
                  data: validatedDiscordMappings.map((mapping) => ({
                    roleId: mapping.discordRoleId,
                    roleName: mapping.roleName,
                    guildId: mapping.discordGuildId,
                    guildName: mapping.guildName,
                    teamId: selectedTeam,
                    createdByUserId: session.user.id,
                  })),
                }
              : { data: [] },
          },
        },
        include: {
          metadata: true,
        },
      });

      const response = {
        product,
      };

      await createAuditLog({
        userId: session.user.id,
        teamId: selectedTeam,
        action: AuditLogAction.UPDATE_PRODUCT,
        targetId: product.id,
        targetType: AuditLogTargetType.PRODUCT,
        requestBody: body,
        responseBody: response,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      webhookEventIds = await createWebhookEvents({
        eventType: WebhookEventType.PRODUCT_UPDATED,
        teamId: selectedTeam,
        payload: updateProductPayload(product),
        userId: session.user.id,
        source: AuditLogSource.DASHBOARD,
        tx: prisma,
      });

      return response;
    });

    void attemptWebhookDelivery(webhookEventIds);

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error occurred in 'products/[slug]' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
