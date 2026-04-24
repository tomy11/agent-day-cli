import React from 'react'
import {Box, Text} from 'ink'
import {DEFAULT_UI_THEME} from './theme'

export type StatusTone = 'info' | 'success' | 'warning' | 'error'

interface StatusLineProps {
  text: string
  tone?: StatusTone
}

export function StatusLine({text, tone = 'info'}: StatusLineProps): React.JSX.Element {
  const color = getToneColor(tone)

  return React.createElement(
    Box,
    {marginTop: 1},
    React.createElement(Text, {color}, `● ${text}`),
  )
}

function getToneColor(tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return DEFAULT_UI_THEME.success
    case 'warning':
      return DEFAULT_UI_THEME.warning
    case 'error':
      return DEFAULT_UI_THEME.danger
    default:
      return DEFAULT_UI_THEME.accent
  }
}
