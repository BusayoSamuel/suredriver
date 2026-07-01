import { Pressable, Text, type PressableProps } from 'react-native';

interface Props extends PressableProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'default' | 'field';
}

export function AccessibleButton({
  title,
  variant = 'primary',
  size = 'default',
  className,
  ...props
}: Props) {
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
      className={`${base} ${variants[variant]} ${className ?? ''}`}
      accessibilityRole="button"
      {...props}
    >
      <Text className={`text-xl font-bold ${textVariants[variant]}`}>{title}</Text>
    </Pressable>
  );
}
