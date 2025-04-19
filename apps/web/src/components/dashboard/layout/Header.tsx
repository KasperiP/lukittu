'use client';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { ThemeSwitcher } from '../../shared/ThemeSwitcher';
import { SheetMenu } from './SheetMenu';
import { SidebarToggleButton } from './SidebarToggleButton';
import { TeamSelector } from './TeamSelector';
import { UserDropdown } from './UserDropdown';

export default function Header() {
  return (
    <div className="sticky top-0 z-20 bg-background">
      <nav className="flex h-16 items-center justify-between pl-4 pr-6 max-sm:pl-2 max-sm:pr-4">
        <div className="flex items-center gap-2">
          <div className="lg:hidden">
            <SheetMenu />
          </div>
          <div className="max-lg:hidden">
            <SidebarToggleButton />
          </div>
          <div className="max-lg:hidden">
            <TeamSelector />
          </div>
        </div>

        <div className="flex items-center gap-2 md:mr-4">
          <ThemeSwitcher variant="ghost" />
          <LanguageSwitcher variant="ghost" />
          <UserDropdown />
        </div>
      </nav>
    </div>
  );
}
