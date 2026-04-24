import React from 'react'
import {Box, Text} from 'ink'
import {DEFAULT_UI_THEME} from './theme'

export type ChatRole = 'system' | 'user' | 'assistant'

interface MessageBubbleProps {
  role: ChatRole
  content: string
}

export function MessageBubble({role, content}: MessageBubbleProps): React.JSX.Element {
  const color = getRoleColor(role)
  const label = getRoleLabel(role)

  return React.createElement(
    Box,
    {marginTop: 1, flexDirection: 'column'},
    React.createElement(Text, {color, bold: true}, label),
    React.createElement(Text, {color: DEFAULT_UI_THEME.text}, content),
  )
}

function getRoleColor(role: ChatRole): string {
  switch (role) {
    case 'assistant':
      return DEFAULT_UI_THEME.brand
    case 'system':
      return DEFAULT_UI_THEME.warning
    case 'user':
    default:
      return DEFAULT_UI_THEME.accent
  }
}

function getRoleLabel(role: ChatRole): string {
  switch (role) {
    case 'assistant':
      return 'assistant'
    case 'system':
      return 'system'
    case 'user':
    default:
      return 'you'
  }
}
