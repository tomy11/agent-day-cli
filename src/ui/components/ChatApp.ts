import React, {useRef, useState} from 'react'
import {Box, Text, useApp, useInput} from 'ink'
import type {ChatMessage, LlmProvider} from '../../core/providers'
import {AppFrame} from './AppFrame'
import {ChatHeader} from './ChatHeader'
import {LoadingIndicator} from './LoadingIndicator'
import {MessageBubble} from './MessageBubble'
import {StatusLine, type StatusTone} from './StatusLine'
import {WelcomeHero} from './WelcomeHero'
import {DEFAULT_UI_THEME} from './theme'

interface UiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatAppProps {
  model: string
  provider: LlmProvider
  systemPrompt?: string
  sessionId?: string
  initialMessages?: UiMessage[]
  persistMessage?: (message: UiMessage) => Promise<void>
}

export function ChatApp({
  model,
  provider,
  systemPrompt,
  sessionId,
  initialMessages = [],
  persistMessage,
}: ChatAppProps): React.JSX.Element {
  const {exit} = useApp()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  const [statusText, setStatusText] = useState('Connected')
  const [statusTone, setStatusTone] = useState<StatusTone>('success')
  const conversationRef = useRef<ChatMessage[]>(
    initialMessages.map(message => ({
      role: message.role,
      content: message.content,
    })),
  )
  const showWelcomeHero = messages.length === 0 && conversationRef.current.length === 0 && !isLoading

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
      footer: sessionId ? `/help  /clear  /exit  resume: daycli session resume ${sessionId}` : '/help  /clear  /exit',
    },
    React.createElement(ChatHeader, {model}),
    showWelcomeHero ? React.createElement(WelcomeHero, {model}) : null,
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
      await persistChatMessage(userMessage)

      const response = await provider.chat({
        messages: [
          ...(systemPrompt ? [{role: 'system' as const, content: systemPrompt}] : []),
          ...conversation,
        ],
      })

      const assistantMessage: UiMessage = {role: 'assistant', content: response.content}
      conversationRef.current = [...conversationRef.current, {role: 'assistant', content: response.content}]
      setMessages(previous => [...previous, assistantMessage])
      await persistChatMessage(assistantMessage)
      setStatusText('Response received')
      setStatusTone('success')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const systemMessage: UiMessage = {role: 'system', content: `Error: ${message}`}
      setMessages(previous => [...previous, systemMessage])
      await persistChatMessage(systemMessage)
      setStatusText('Request failed')
      setStatusTone('error')
    } finally {
      setIsLoading(false)
    }
  }

  async function persistChatMessage(message: UiMessage): Promise<void> {
    if (!persistMessage) {
      return
    }

    await persistMessage(message)
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
