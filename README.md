<img src="./.github/lukittu.png" alt="Lukittu GitHub-repository banner">

<div align="center">
  
[![Build Status](https://img.shields.io/github/actions/workflow/status/KasperiP/lukittu/pipeline.yml?branch=main&style=flat&colorA=4153af&colorB=4153af)](https://github.com/KasperiP/lukittu/actions?query=pipeline)
[![Discord Shield](https://img.shields.io/discord/1287496974303494214?style=flat&colorA=4153af&colorB=4153af&label=discord&logo=discord&logoColor=ffffff)](https://discord.lukittu.com)
[![License](https://img.shields.io/github/license/kasperip/lukittu?style=flat&colorA=4153af&colorB=4153af)](https://github.com/KasperiP/lukittu/blob/main/LICENSE)
[![Contributors](https://img.shields.io/github/contributors/KasperiP/lukittu?style=flat&colorA=4153af&colorB=4153af)](https://github.com/KasperiP/lukittu/graphs/contributors)

</div>

# [Lukittu](https://lukittu.com)

Lukittu is a modern software licensing service that provides robust APIs to enhance the security and trackability of your applications. It introduces a licensing layer to protect proprietary software from unauthorized sharing and misuse, offering benefits such as enhanced security, usage analytics, easy integration, and flexible licensing. Lukittu is particularly suitable for applications like game scripts and add-ons running on client servers, including platforms like Minecraft, FiveM, and Roblox.

## Features

- **Flexible License Management** – Support for various licensing models
- **Customer Management** – Organize and manage licensees efficiently
- **Product Release Versioning** – Track and manage different software versions
- **Advanced Watermarking** – Protect Java applications with unique identifiers
- **Detailed Analytics & Logging** – Monitor usage and detect potential abuse
- **Team Collaboration** – Work with your team seamlessly
- **Comprehensive API** – Easily integrate Lukittu with your applications

## Hosting Options

Lukittu is available in two hosting options:

- **Free Tier** – Essential features for small projects at no cost
- **Pro Tier (€2.90/month)** – Enhanced features and higher limits for commercial projects

For detailed pricing and feature comparisons, visit [our website](https://lukittu.com).

> [!IMPORTANT]  
> While you can self-host Lukittu, it is **not highly recommended**. Lukittu is designed to be a SaaS platform. If you choose to self-host it, keep in mind that, by default, anyone can register and use it unless you implement custom modifications. However, these modifications may make it more difficult to receive updates from upstream when Lukittu is updated.

## Local Development

Lukittu uses a pnpm workspace monorepo structure with the following packages:

- `apps/web`: The core Next.js application
- `apps/bot`: Lukittu's Discord bot
- `packages/prisma`: Shared Prisma schema and client

To get started with the project locally, follow the steps below:

#### 1. Setup Environment Variables

- Rename the `.env.example` file to `.env`.
- Open the `.env` file and fill in the necessary details.

#### 2. Install Node.js, Docker, and pnpm

Ensure the following tools are installed on your system:

- **Node.js** v20+ (Download from [nodejs.org](https://nodejs.org/))
- **Docker** (Install from [docker.com](https://www.docker.com/get-started))
- **pnpm** v9.11.0+ (Package manager for Node.js, install via [pnpm.io](https://pnpm.io/))

#### 3. Install Dependencies

Once the environment is set up, install dependencies for all workspaces:

```bash
pnpm install
```

#### 4. Start Local Databases

To start the local databases (PostgreSQL & Redis), use Docker Compose:

```bash
docker compose -f docker-compose-local.yml up
```

This command will spin up the containers for both PostgreSQL and Redis.

#### 5. Run Database Migrations

Run the necessary database migrations to set up your database schema:

```bash
pnpm --filter @lukittu/shared migrate
```

#### 6. Start the Application

After the migrations are complete, start the local application:

```bash
pnpm dev
```

This will run the dev script for all workspaces simultaneously.

To run commands for a specific workspace, use the `--filter` flag:

```bash
# Run Next.js development server only
pnpm --filter lukittu-web dev

# Generate Prisma client
pnpm --filter @lukittu/shared generate
```

#### 7. Access the Application

Navigate to `http://localhost:3000` in your browser, and you should have everything running!

### Troubleshooting

- Ensure Docker is running before starting the databases.
- Make sure to have all environment variables filled correctly in the `.env` file.
- If you encounter dependency issues, try running `pnpm install --force` to refresh dependencies.

## Community & Support

Join our community Discord server to get help, share ideas, and connect with other developers: [https://discord.lukittu.com/](https://discord.lukittu.com/)

## How to Support the Project

The best way to support Lukittu is to **give it a star on GitHub** – it’s free and helps us grow the community!

## Documentation

For comprehensive documentation on how to use Lukittu, visit: [https://docs.lukittu.com/introduction](https://docs.lukittu.com/introduction). **The documentation source can be found in its own repository [here](https://github.com/KasperiP/lukittu-docs).**

## Contributing

We welcome contributions from the community! Whether it’s bug fixes, feature improvements, or documentation updates, your help is appreciated.

### How to Contribute:

1. **Open an issue** – Discuss proposed changes before starting work
2. **Fork the repository** – Create your own copy to work on
3. **Create a feature branch** – Organize your changes
4. **Make your changes** – Implement improvements or fixes
5. **Submit a pull request** – Share your work with the community

Discussing changes before implementation ensures efficient collaboration and valuable contributions.

#### Contributors

<a href="https://github.com/KasperiP/lukittu/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=KasperiP/lukittu" />
</a>

## License

Lukittu is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.
