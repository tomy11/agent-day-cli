import React, {useRef, useState} from 'react'
import {Box, Text, useApp, useInput} from 'ink'
import type {ChatMessage, LlmProvider} from '../../core/providers'
import {AppFrame} from './AppFrame'
import {ChatHeader} from './ChatHeader'
import {LoadingIndicator} from './LoadingIndicator'
import {MessageBubble} from './MessageBubble'
import {StatusLine, type StatusTone} from './StatusLine'
import {DEFAULT_UI_THEME} from './theme'

interface UiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatAppProps {
  model: string
  provider: LlmProvider
  systemPrompt?: string
}

export function ChatApp({model, provider, systemPrompt}: ChatAppProps): React.JSX.Element {
  const {exit} = useApp()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      role: 'system',
      content: 'Interactive mode ready. Type a prompt and press Enter.',
    },
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [statusText, setStatusText] = useState('Connected')
  const [statusTone, setStatusTone] = useState<StatusTone>('success')
  const conversationRef = useRef<ChatMessage[]>([])

  useInput((value, key) => {
    if (key.ctrl && value === 'c') {
      exit()
      return
    }

    if (isLoading) {
      return
    }

    if (key.return) {
      const prompt = input.trim()
      if (!prompt) {
        return
      }

      setInput('')
      if (prompt.startsWith('/')) {
        handleSlashCommand(prompt)
        return
      }

      void submitPrompt(prompt)
      return
    }

    if (key.backspace || key.delete) {
      setInput(previous => previous.slice(0, -1))
      return
    }

    if (value) {
      setInput(previous => previous + value)
    }
  })

  return React.createElement(
    AppFrame,
    {
      title: 'daycli',
      subtitle: 'Interactive chat',
      footer: '/help  /clear  /exit',
    },
    React.createElement(ChatHeader, {model}),
    React.createElement(
      Box,
      {marginTop: 1, flexDirection: 'column'},
      ...messages.map((message, index) =>
        React.createElement(MessageBubble, {
          key: `${message.role}-${index}`,
          role: message.role,
          content: message.content,
        }),
      ),
    ),
    isLoading ? React.createElement(LoadingIndicator, {label: 'Thinking'}) : null,
    React.createElement(
      Box,
      {marginTop: 1},
      React.createElement(Text, {color: DEFAULT_UI_THEME.accent}, `> ${input}_`),
    ),
    React.createElement(StatusLine, {text: statusText, tone: statusTone}),
  )

  async function submitPrompt(prompt: string): Promise<void> {
    const userMessage: UiMessage = {role: 'user', content: prompt}
    const conversation = [...conversationRef.current, {role: 'user' as const, content: prompt}]
    conversationRef.current = conversation

    setMessages(previous => [...previous, userMessage])
    setIsLoading(true)
    setStatusText('Waiting for model response...')
    setStatusTone('info')

    try {
      const response = await provider.chat({
        messages: [
          ...(systemPrompt ? [{role: 'system' as const, content: systemPrompt}] : []),
          ...conversation,
        ],
      })

      conversationRef.current = [...conversationRef.current, {role: 'assistant', content: response.content}]
      setMessages(previous => [...previous, {role: 'assistant', content: response.content}])
      setStatusText('Response received')
      setStatusTone('success')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setMessages(previous => [...previous, {role: 'system', content: `Error: ${message}`}])
      setStatusText('Request failed')
      setStatusTone('error')
    } finally {
      setIsLoading(false)
    }
  }

  function handleSlashCommand(raw: string): void {
    switch (raw.trim()) {
      case '/exit': {
        exit()
        return
      }
      case '/help': {
        setMessages(previous => [
          ...previous,
          {
            role: 'system',
            content: 'Commands: /help, /clear, /exit',
          },
        ])
        setStatusText('Help shown')
        setStatusTone('info')
        return
      }
      case '/clear': {
        conversationRef.current = []
        setMessages([
          {
            role: 'system',
            content: 'Chat history cleared.',
          },
        ])
        setStatusText('History cleared')
        setStatusTone('warning')
        return
      }
      default: {
        setMessages(previous => [
          ...previous,
          {
            role: 'system',
            content: `Unknown command: ${raw}`,
          },
        ])
        setStatusText('Unknown command')
        setStatusTone('warning')
      }
    }
  }
}
