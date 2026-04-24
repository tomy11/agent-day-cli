import React, {useEffect, useState} from 'react'
import {Box, Text} from 'ink'
import {DEFAULT_UI_THEME} from './theme'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

interface LoadingIndicatorProps {
  label?: string
}

export function LoadingIndicator({label = 'Thinking...'}: LoadingIndicatorProps): React.JSX.Element {
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex(current => (current + 1) % FRAMES.length)
    }, 80)

    return () => clearInterval(timer)
  }, [])

  return React.createElement(
    Box,
    {marginTop: 1},
    React.createElement(Text, {color: DEFAULT_UI_THEME.brand}, `${FRAMES[frameIndex]} ${label}`),
  )
}
