import { Platform, TextInput, View, type TextInputProps } from 'react-native';

const FIELD_HEIGHT = 56;
const FONT_SIZE = 18;
const LINE_HEIGHT = 22;

type Props = TextInputProps;

export function FormTextInput({ multiline, className, style, ...props }: Props) {
  if (multiline) {
    return (
      <TextInput
        className={`bg-white border-2 border-gray-200 rounded-xl px-4 py-4 mb-4 min-h-[120px] ${className ?? ''}`}
        multiline
        textAlignVertical="top"
        style={[{ fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT }, style]}
        placeholderTextColor="#9CA3AF"
        {...props}
      />
    );
  }

  return (
    <View
      className={`bg-white border-2 border-gray-200 rounded-xl mb-4 justify-center ${className ?? ''}`}
      style={{ height: FIELD_HEIGHT, paddingHorizontal: 16 }}
    >
      <TextInput
        style={[
          {
            width: '100%',
            fontSize: FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            padding: 0,
            margin: 0,
            color: '#111827',
            ...(Platform.OS === 'ios'
              ? { height: LINE_HEIGHT }
              : { textAlignVertical: 'center' }),
          },
          style,
        ]}
        placeholderTextColor="#9CA3AF"
        includeFontPadding={false}
        {...props}
      />
    </View>
  );
}
