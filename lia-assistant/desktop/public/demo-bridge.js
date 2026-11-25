/* Mock window.lia for browser captures (Linux Chromium). */
(function () {
  const listeners = {}
  function emit(ch, ...args) {
    ;(listeners[ch] || []).forEach((fn) => fn(...args))
  }
  window.lia = {
    getConfig: async () => ({
      provider: 'gemini',
      apiKeyMasked: '',
      model: 'gemini-2.0-flash',
      ttsVoice: 'SvetlanaNeural',
      workspacePath: '~/LiaWorkspace',
    }),
    getConfigSecret: async () => ({
      provider: 'gemini',
      apiKey: '',
      baseUrl: '',
      model: 'gemini-2.0-flash',
      workspacePath: '/tmp/LiaWorkspace',
      ttsVoice: 'SvetlanaNeural',
    }),
    saveConfig: async (p) => p,
    speak: async (text) => {
      emit('voice:state', { state: 'SPEAKING', text })
      const boundaries = []
      let t = 0
      for (let i = 0; i < text.length; i++) {
        if ('аеёиоуыэюяАЕЁИОУЫЭЮЯaeiou'.includes(text[i])) {
          boundaries.push({ offsetMs: t, durationMs: 140, charStart: i, charEnd: i + 1 })
        }
        t += 45
      }
      emit('voice:speak-result', { text, boundaries, dataUrl: '' })
      // Drive mouth via viseme polling in App; keep speaking ~2.5s
      setTimeout(() => emit('voice:state', { state: 'IDLE' }), 2800)
      return { text, boundaries }
    },
    stopSpeak: async () => true,
    runAgent: async (text) => {
      emit('agent:event', { type: 'tool_start', tool: 'list_dir', text: 'list_dir' })
      emit('agent:log', '[demo] list_dir ~/LiaWorkspace')
      await new Promise((r) => setTimeout(r, 400))
      emit('agent:event', { type: 'tool_end', tool: 'list_dir' })
      if (/брауз|browser|http/i.test(text)) {
        emit('agent:event', { type: 'tool_start', tool: 'browser_open' })
        emit('agent:log', '[demo] browser_open https://example.com')
        await new Promise((r) => setTimeout(r, 500))
        emit('agent:event', { type: 'tool_end', tool: 'browser_open' })
      }
      if (/файл|file|создай|папк/i.test(text)) {
        emit('agent:event', { type: 'tool_start', tool: 'write_file' })
        emit('agent:log', '[demo] write_file note.txt')
        await new Promise((r) => setTimeout(r, 400))
        emit('agent:event', { type: 'tool_end', tool: 'write_file' })
      }
      const reply = 'Готово. Я выполнила задачу.'
      emit('agent:event', { type: 'narrate', text: reply })
      emit('agent:event', { type: 'done', text: reply })
      await window.lia.speak(reply)
      return { ok: true, reply }
    },
    abortAgent: async () => {
      emit('agent:aborted')
      return true
    },
    confirm: async () => true,
    getLog: async () => [],
    visemeShape: async (text, start, end, amp) => {
      const slice = text.slice(start, end).toLowerCase()
      let shape = 'E'
      if (/[аяэ]/.test(slice)) shape = 'AA'
      else if (/[оё]/.test(slice)) shape = 'O'
      else if (/[ую]/.test(slice)) shape = 'U'
      else if (/[бпм]/.test(slice)) shape = 'SIL'
      const oOpen = 0.55 * Math.max(amp, 0.4)
      if (shape === 'AA' || shape === 'O') return { shape, jaw: Math.min(oOpen, 0.58), funnel: shape === 'O' ? 0.8 : 0, wide: 0 }
      if (shape === 'E') return { shape, jaw: 0.45, funnel: 0, wide: 0.75 }
      return { shape, jaw: 0.05, funnel: 0, wide: 0 }
    },
    meshPath: async () => '/models/lia_holo_mesh.bin',
    openPath: async () => {},
    openExternal: async (url) => window.open(url, '_blank'),
    on: (channel, cb) => {
      listeners[channel] = listeners[channel] || []
      listeners[channel].push(cb)
      return () => {
        listeners[channel] = (listeners[channel] || []).filter((f) => f !== cb)
      }
    },
  }
  window.__liaDemo = {
    idle: () => {},
    speak: () => window.lia.speak('Доброй ночи, сэр. Я Лиа. Готова помочь.'),
    fileTask: () => window.lia.runAgent('Создай файл заметка.txt в workspace'),
    browserTask: () => window.lia.runAgent('Открой браузер https://example.com'),
  }
})()
