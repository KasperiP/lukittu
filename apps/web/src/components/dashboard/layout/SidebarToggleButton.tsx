'use client';
import { Button } from '@/components/ui/button';
import { SidebarContext } from '@/providers/SidebarProvider';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useContext } from 'react';

export function SidebarToggleButton() {
  const ctx = useContext(SidebarContext);
  return (
    <Button className="ml-4" size="icon" variant="ghost" onClick={ctx.toggle}>
      {ctx.open ? <PanelLeftClose /> : <PanelLeftOpen />}
    </Button>
  );
}
