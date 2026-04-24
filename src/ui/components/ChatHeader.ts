import React from 'react'
import {Box, Text} from 'ink'
import {DEFAULT_UI_THEME} from './theme'

interface ChatHeaderProps {
  model: string
  modeLabel?: string
}

export function ChatHeader({model, modeLabel = 'interactive'}: ChatHeaderProps): React.JSX.Element {
  return React.createElement(
    Box,
    {justifyContent: 'space-between'},
    React.createElement(Text, {bold: true, color: DEFAULT_UI_THEME.text}, 'daycli chat'),
    React.createElement(
      Text,
      {color: DEFAULT_UI_THEME.muted},
      `model=${model} | mode=${modeLabel}`,
    ),
  )
}
