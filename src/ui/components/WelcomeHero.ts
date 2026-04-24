import React from 'react'
import {Box, Text} from 'ink'
import {DEFAULT_UI_THEME} from './theme'

interface WelcomeHeroProps {
  model: string
}

const LOGO_LINES = [
  '      _                  _ _ ',
  '   __| | __ _ _   _  ___| (_)',
  "  / _` |/ _` | | | |/ __| | |",
  ' | (_| | (_| | |_| | (__| | |',
  '  \\__,_|\\__,_|\\__, |\\___|_|_|',
  '              |___/          ',
]

export function WelcomeHero({model}: WelcomeHeroProps): React.JSX.Element {
  return React.createElement(
    Box,
    {marginTop: 1, marginBottom: 1, flexDirection: 'column', alignItems: 'center'},
    React.createElement(
      Box,
      {flexDirection: 'column', alignItems: 'center'},
      ...LOGO_LINES.map((line, index) =>
        React.createElement(Text, {key: line, color: index < 4 ? DEFAULT_UI_THEME.text : DEFAULT_UI_THEME.muted}, line),
      ),
    ),
    React.createElement(Box, {marginTop: 1}, React.createElement(Text, {color: DEFAULT_UI_THEME.muted}, 'Ask anything... "Fix a TODO in the codebase"')),
    React.createElement(
      Box,
      {marginTop: 1},
      React.createElement(Text, {color: DEFAULT_UI_THEME.accent}, 'Build'),
      React.createElement(Text, {color: DEFAULT_UI_THEME.muted}, ` · ${model} · daycli chat`),
    ),
    React.createElement(
      Box,
      {marginTop: 1},
      React.createElement(Text, {color: DEFAULT_UI_THEME.muted}, 'tab agents   ctrl+p commands'),
    ),
  )
}
