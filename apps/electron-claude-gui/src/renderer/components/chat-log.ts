import { store, ChatMessage } from '../core/store'

export class ChatLog {
  private container: HTMLElement
  private renderedCount = 0

  constructor(container: HTMLElement) {
    this.container = container

    store.subscribe(
      s => s.chat.messages,
      (messages) => this.render(messages)
    )
  }

  render(messages?: ChatMessage[]): void {
    const msgs = messages || store.getState().chat.messages
    const model = store.getState().claude.selectedModel

    if (msgs.length === 0) {
      this.container.textContent = ''
      const empty = document.createElement('div')
      empty.className = 'chat-empty'
      empty.textContent = '대화가 아직 없습니다.'
      this.container.appendChild(empty)
      this.renderedCount = 0
      return
    }

    // Incremental append: only add new messages
    if (this.renderedCount > msgs.length) {
      // Messages were truncated (session load) — full rebuild
      this.container.textContent = ''
      this.renderedCount = 0
    }

    for (let i = this.renderedCount; i < msgs.length; i++) {
      // Remove empty placeholder if first message
      if (i === 0 && this.renderedCount === 0) {
        this.container.textContent = ''
      }
      this.container.appendChild(this.createMessageElement(msgs[i], model))
    }

    this.renderedCount = msgs.length
    this.container.scrollTop = this.container.scrollHeight
  }

  private createMessageElement(msg: ChatMessage, model: string): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = `msg msg-${msg.role}`

    const head = document.createElement('div')
    head.className = 'msg-head'

    const avatar = document.createElement('span')
    avatar.className = `agent-avatar ${msg.role === 'user' ? 'a-fox' : 'a-mage'}`
    avatar.textContent = msg.role === 'user' ? '\uD83E\uDD8A' : '\uD83E\uDDD9'

    const role = document.createElement('div')
    role.className = 'msg-role'
    role.textContent = msg.role === 'user' ? 'You' : `Claude (${model})`

    head.appendChild(avatar)
    head.appendChild(role)

    const text = document.createElement('div')
    text.className = 'msg-text'
    text.textContent = msg.text

    wrapper.appendChild(head)
    wrapper.appendChild(text)
    return wrapper
  }
}
