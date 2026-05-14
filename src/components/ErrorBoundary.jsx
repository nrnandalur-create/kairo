import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error.message, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-[#e55353]/10 border border-[#e55353]/25 rounded-2xl p-5 text-sm text-[#e55353] flex items-start gap-3">
          <span className="shrink-0 mt-0.5">⚠</span>
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Something went wrong rendering this section.</span>
            <span className="text-xs text-[#e55353]/70">{this.state.error.message}</span>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
