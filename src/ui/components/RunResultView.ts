import React, {useEffect} from 'react'
import {Box, Text, useApp} from 'ink'
import {AppFrame} from './AppFrame'
import {StatusLine} from './StatusLine'
import {DEFAULT_UI_THEME} from './theme'

interface RetrievalSummary {
  chunkCount: number
  truncated: boolean
}

interface RunResultViewProps {
  task: string
  model: string
  response: string
  retrieval?: RetrievalSummary
}

export function RunResultView({task, model, response, retrieval}: RunResultViewProps): React.JSX.Element {
  const {exit} = useApp()

  useEffect(() => {
    const timer = setTimeout(() => exit(), 0)
    return () => clearTimeout(timer)
  }, [exit])

  return React.createElement(
    AppFrame,
    {
      title: 'daycli run',
      subtitle: `model=${model}`,
      footer: 'output=rich',
    },
    React.createElement(
      Box,
      {flexDirection: 'column'},
      React.createElement(Text, {bold: true, color: DEFAULT_UI_THEME.accent}, 'Task'),
      React.createElement(Text, null, task),
    ),
    React.createElement(
      Box,
      {marginTop: 1, flexDirection: 'column'},
      React.createElement(Text, {bold: true, color: DEFAULT_UI_THEME.brand}, 'Response'),
      React.createElement(Text, null, response),
    ),
    retrieval
      ? React.createElement(
          Box,
          {marginTop: 1, flexDirection: 'column'},
          React.createElement(Text, {bold: true, color: DEFAULT_UI_THEME.muted}, 'Retrieval'),
          React.createElement(
            Text,
            {color: DEFAULT_UI_THEME.muted},
            `chunks=${retrieval.chunkCount} truncated=${retrieval.truncated}`,
          ),
        )
      : null,
    React.createElement(StatusLine, {text: 'Run complete', tone: 'success'}),
  )
}
