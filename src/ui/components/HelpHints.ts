import React from 'react'
import {Box, Text} from 'ink'
import {DEFAULT_UI_THEME} from './theme'

interface HelpHintsProps {
  hints?: string[]
}

const DEFAULT_HINTS = [
  'Type your task and press Enter',
  'Use /exit to end session',
  'Use /help to list commands',
]

export function HelpHints({hints = DEFAULT_HINTS}: HelpHintsProps = {}): React.JSX.Element {
  return React.createElement(
    Box,
    {marginTop: 1, flexDirection: 'column'},
    ...hints.map(hint => React.createElement(Text, {key: hint, color: DEFAULT_UI_THEME.muted}, `- ${hint}`)),
  )
}
