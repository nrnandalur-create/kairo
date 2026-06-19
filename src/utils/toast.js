// Module-level toast queue with pub/sub. Inspired by Sonner / react-hot-toast.
// Components fire toasts via the singleton (no prop drilling); the <Toaster />
// component subscribes once and renders the current queue.
//
//   import { toast } from '../utils/toast'
//   toast.success('Alert saved')
//   toast.error('Couldn\'t save', { action: { label: 'Retry', onClick: () => save() } })

let nextId = 1
const listeners = new Set()
let queue = []

function emit() { listeners.forEach(fn => fn(queue)) }

function push(variant, message, opts = {}) {
  const id  = nextId++
  const ttl = opts.ttl ?? 3500
  const t   = { id, variant, message, action: opts.action ?? null }
  queue = [...queue, t]
  emit()
  if (ttl > 0) {
    setTimeout(() => dismiss(id), ttl)
  }
  return id
}

function dismiss(id) {
  queue = queue.filter(t => t.id !== id)
  emit()
}

export const toast = {
  show:    (message, opts) => push('info',    message, opts),
  success: (message, opts) => push('success', message, opts),
  error:   (message, opts) => push('error',   message, opts),
  warning: (message, opts) => push('warning', message, opts),
  dismiss,
  // Internal: <Toaster /> uses this to subscribe.
  _subscribe(fn) {
    listeners.add(fn)
    fn(queue)
    return () => listeners.delete(fn)
  },
}
