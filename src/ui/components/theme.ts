export interface UiTheme {
  brand: string
  accent: string
  success: string
  warning: string
  danger: string
  text: string
  muted: string
}

export const DEFAULT_UI_THEME: UiTheme = {
  brand: 'cyan',
  accent: 'blue',
  success: 'green',
  warning: 'yellow',
  danger: 'red',
  text: 'white',
  muted: 'gray',
}
