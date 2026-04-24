import React from 'react'
import {Box, Text} from 'ink'
import type {ReactNode} from 'react'
import {DEFAULT_UI_THEME} from './theme'

interface AppFrameProps {
  title: string
  subtitle?: string
  footer?: ReactNode
  children?: ReactNode
}

export function AppFrame({title, subtitle, children, footer}: AppFrameProps): React.JSX.Element {
  return React.createElement(
    Box,
    {flexDirection: 'column', paddingX: 1, paddingY: 1},
    React.createElement(
      Box,
      {flexDirection: 'column', borderStyle: 'round', borderColor: DEFAULT_UI_THEME.brand, paddingX: 1, paddingY: 0},
      React.createElement(Text, {bold: true, color: DEFAULT_UI_THEME.brand}, title),
      subtitle
        ? React.createElement(Text, {color: DEFAULT_UI_THEME.muted}, subtitle)
        : null,
      React.createElement(Box, {marginTop: 1, flexDirection: 'column'}, children),
    ),
    footer
      ? React.createElement(
          Box,
          {marginTop: 1, paddingX: 1},
          React.createElement(Text, {color: DEFAULT_UI_THEME.muted}, footer),
        )
      : null,
  )
}
