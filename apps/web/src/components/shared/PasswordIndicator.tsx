'use client';

import { regex } from '@lukittu/shared';

interface PasswordIndicatorProps {
  password: string;
}

export default function PasswordIndicator({
  password,
}: PasswordIndicatorProps) {
  const strength = passwordStrength(password);

  return (
    <div className="flex items-center gap-1 space-x-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className={`h-1.5 w-full rounded-full ${strength > index ? 'bg-primary' : 'bg-secondary'}`}
        />
      ))}
    </div>
  );
}

const passwordStrength = (password: string): number => {
  let strength = 0;

  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;

  const hasLower = regex.passwordLowercase.test(password);
  const hasUpper = regex.passwordUppercase.test(password);
  const hasNumber = regex.passwordNumber.test(password);
  const hasSpecial = regex.passwordSpecial.test(password);

  if (hasLower && hasUpper) strength++;
  if (hasNumber) strength++;
  if (hasSpecial) strength++;

  return strength;
};
