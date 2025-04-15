'use client';
import Confetti from '@/components/ui/confetti';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { type ThemeProviderProps } from 'next-themes/dist/types';
import { createContext, useState } from 'react';

export const ConfettiContext = createContext({
  isConfettiActive: false,
  setIsConfettiActive: (isActive: boolean) => {},
});

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const [isConfettiActive, setIsConfettiActive] = useState(false);

  return (
    <NextThemesProvider {...props}>
      <ConfettiContext.Provider
        value={{ isConfettiActive, setIsConfettiActive }}
      >
        <Confetti duration={3000} isActive={isConfettiActive} />
        {children}
      </ConfettiContext.Provider>
    </NextThemesProvider>
  );
}
