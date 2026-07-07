import { Pressable, Text, type PressableProps } from 'react-native';

interface Props extends PressableProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'default' | 'field';
  loading?: boolean;
  loadingTitle?: string;
}

export function AccessibleButton({
  title,
  variant = 'primary',
  size = 'default',
  loading = false,
  loadingTitle = 'Please wait…',
  className,
  disabled,
  ...props
}: Props) {
  const isDisabled = disabled || loading;
  const label = loading ? loadingTitle : title;
  const base =
    size === 'field'
      ? 'py-5 px-4 rounded-xl items-center justify-center'
      : 'py-5 px-6 rounded-2xl items-center justify-center min-h-[56px]';
  const variants = {
    primary: 'bg-primary',
    secondary: 'bg-accent',
    outline: 'border-2 border-primary bg-white',
  };
  const textVariants = {
    primary: 'text-white',
    secondary: 'text-white',
    outline: 'text-primary',
  };

  return (
    <Pressable
      className={`${base} ${variants[variant]} ${isDisabled ? 'opacity-60' : ''} ${className ?? ''}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      {...props}
    >
      <Text className={`text-xl font-bold ${textVariants[variant]}`}>{label}</Text>
    </Pressable>
  );
}
