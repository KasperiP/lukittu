import { DiscordIcon } from '@/components/shared/Icons';
import {
  Ban,
  BookOpenText,
  FileScan,
  GithubIcon,
  KeyRound,
  LayoutGrid,
  Logs,
  LucideIcon,
  Package,
  Shield,
  Users,
} from 'lucide-react';
import { Messages } from '../../../global';

type Submenu = {
  href: string;
  translation: keyof Messages['dashboard']['navigation'];
  active: boolean;
};

type Menu = {
  href: string;
  translation: keyof Messages['dashboard']['navigation'];
  active: boolean;
  icon: LucideIcon;
  submenus: Submenu[];
};

type Group = {
  groupTranslation: keyof Messages['dashboard']['navigation'] | '';
  menus: Menu[];
};

export function getMenuList(pathname: string): Group[] {
  return [
    {
      groupTranslation: '',
      menus: [
        {
          href: '/dashboard',
          translation: 'dashboard',
          active: pathname === '/dashboard',
          icon: LayoutGrid,
          submenus: [],
        },
      ],
    },
    {
      groupTranslation: '',
      menus: [
        {
          href: '/dashboard/licenses',
          translation: 'licenses',
          active: pathname.startsWith('/dashboard/licenses'),
          icon: KeyRound,
          submenus: [],
        },
      ],
    },
    {
      groupTranslation: '',
      menus: [
        {
          href: '/dashboard/products',
          translation: 'products',
          active: pathname.startsWith('/dashboard/products'),
          icon: Package,
          submenus: [],
        },
      ],
    },
    {
      groupTranslation: '',
      menus: [
        {
          href: '/dashboard/customers',
          translation: 'customers',
          active: pathname.startsWith('/dashboard/customers'),
          icon: Users,
          submenus: [],
        },
      ],
    },
    {
      groupTranslation: '',
      menus: [
        {
          href: '/dashboard/blacklist',
          translation: 'blacklist',
          active: pathname === '/dashboard/blacklist',
          icon: Ban,
          submenus: [],
        },
      ],
    },
    {
      groupTranslation: '',
      menus: [
        {
          href: '/dashboard/logs',
          translation: 'logs',
          active: pathname === '/dashboard/logs',
          icon: Logs,
          submenus: [],
        },
      ],
    },
    {
      groupTranslation: '',
      menus: [
        {
          href: '/dashboard/analyzer',
          translation: 'analyzer',
          active: pathname === '/dashboard/analyzer',
          icon: FileScan,
          submenus: [],
        },
      ],
    },
    {
      groupTranslation: '',
      menus: [
        {
          href: '',
          translation: 'team',
          active: pathname.startsWith('/dashboard/team'),
          icon: Shield,
          submenus: [
            {
              href: '/dashboard/team/settings',
              translation: 'settings',
              active: pathname === '/dashboard/team/settings',
            },
            {
              href: '/dashboard/team/integrations',
              translation: 'integrations',
              active: pathname === '/dashboard/team/integrations',
            },
            {
              href: '/dashboard/team/members',
              translation: 'members',
              active: pathname === '/dashboard/team/members',
            },
            {
              href: '/dashboard/team/audit-logs',
              translation: 'audit_logs',
              active: pathname === '/dashboard/team/audit-logs',
            },
          ],
        },
      ],
    },
    {
      groupTranslation: 'external_links',
      menus: [
        {
          href: 'https://docs.lukittu.com',
          translation: 'documentation',
          active: pathname === '#',
          icon: BookOpenText,
          submenus: [],
        },
        {
          href: 'https://discord.lukittu.com',
          translation: 'discord',
          active: pathname === '#',
          icon: DiscordIcon as LucideIcon,
          submenus: [],
        },
        {
          href: 'https://github.com/KasperiP/lukittu',
          translation: 'github',
          active: pathname === '#',
          icon: GithubIcon,
          submenus: [],
        },
      ],
    },
  ];
}
